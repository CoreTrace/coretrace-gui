use reqwest::{Client, Method};
use serde::Serialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

const DEFAULT_API_URL: &str = "https://api.coretrace.fr";
const ACCOUNT_URL: &str = "https://app.coretrace.fr/app";

pub struct Cloud(pub Mutex<Session>);
pub struct Session {
    client: Client,
    base: String,
    access: Option<String>,
    refresh: Option<String>,
    device: Option<Device>,
}
struct Device {
    code: String,
    uri: String,
    deadline: Instant,
    next_poll: Instant,
    interval: Duration,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    signed_in: bool,
    base_url: String,
}

pub fn validate_base(value: &str) -> Result<String, String> {
    let parsed = url::Url::parse(value).map_err(|_| "Invalid API URL")?;
    let local = matches!(parsed.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (parsed.scheme() != "https" && !(parsed.scheme() == "http" && local))
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err("The API must use HTTPS (HTTP is allowed only on localhost), without credentials or query parameters".into());
    }
    let base = value.trim_end_matches('/');
    Ok(if base.ends_with("/v1") {
        base.into()
    } else {
        format!("{base}/v1")
    })
}
impl Cloud {
    pub fn new() -> Result<Self, String> {
        let base = validate_base(
            &std::env::var("CORETRACE_BASE_URL").unwrap_or_else(|_| DEFAULT_API_URL.into()),
        )?;
        let client = Client::builder()
            .user_agent("coretrace-desktop/6.0.0-beta.1")
            .timeout(Duration::from_secs(30))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|e| e.to_string())?;
        Ok(Self(Mutex::new(Session {
            client,
            base,
            access: None,
            refresh: None,
            device: None,
        })))
    }
}
impl Session {
    /// A session pointed at a test server, with no stored credential.
    #[cfg(test)]
    pub(crate) fn for_tests(base: String) -> Self {
        Session {
            client: Client::builder().build().expect("client"),
            base,
            access: Some("test-token".into()),
            refresh: None,
            device: None,
        }
    }
    /// The bare HTTP client, for a presigned URL. Signed links never receive
    /// the platform bearer or the X-Org header.
    pub(crate) fn http(&self) -> &Client {
        &self.client
    }
    fn credential(&self) -> Result<keyring::Entry, String> {
        keyring::Entry::new("fr.coretrace.desktop", &self.base)
            .map_err(|e| format!("Credential store: {e}"))
    }
    async fn send(
        &self,
        method: Method,
        path: &str,
        org: Option<&str>,
        body: Option<Value>,
        auth: bool,
    ) -> Result<(u16, Value), String> {
        let mut request = self
            .client
            .request(method, format!("{}{path}", self.base))
            .header("Accept", "application/json");
        if auth {
            if let Some(token) = &self.access {
                request = request.bearer_auth(token);
            }
        }
        if let Some(org) = org {
            request = request.header("X-Org", org);
        }
        if let Some(body) = body {
            request = request.json(&body);
        }
        let mut response = request
            .send()
            .await
            .map_err(|e| format!("Platform unavailable: {e}"))?;
        let status = response.status().as_u16();
        let mut bytes = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                return Err("Platform response exceeds 8 MiB".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let value = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).map_err(|_| {
                let endpoint = format!("{}{path}", self.base);
                if status == 404 {
                    format!("API endpoint not found (HTTP 404): {endpoint}. Check the platform address; the public website does not serve the API.")
                } else {
                    format!("Platform returned a non-JSON response (HTTP {status}): {endpoint}")
                }
            })?
        };
        Ok((status, value))
    }
    fn accept_tokens(&mut self, value: Value) -> Result<(), String> {
        let access = value["access_token"]
            .as_str()
            .ok_or("Missing access token")?
            .to_owned();
        let refresh = value["refresh_token"]
            .as_str()
            .map(str::to_owned)
            .or_else(|| self.refresh.clone());
        self.access = Some(access);
        self.refresh = refresh;
        if let Some(token) = &self.refresh {
            let credential = self.credential()?;
            if let Err(error) = credential.set_password(token) {
                // A rotated token must never be replaced by the old, already consumed token.
                let _ = credential.delete_credential();
                return Err(format!("Session is available in memory, but could not be saved in the OS credential store: {error}"));
            }
        }
        Ok(())
    }
    async fn refresh(&mut self) -> Result<(), String> {
        if self.refresh.is_none() {
            self.refresh = match self.credential()?.get_password() {
                Ok(token) => Some(token),
                Err(keyring::Error::NoEntry) => None,
                Err(e) => return Err(format!("Credential store unavailable: {e}")),
            };
        }
        let token = self.refresh.as_ref().ok_or("Sign in to CoreTrace first")?;
        let response = self
            .send(
                Method::POST,
                "/auth/refresh",
                None,
                Some(json!({"refresh_token":token})),
                false,
            )
            .await?;
        self.accept_tokens(success(response)?)
    }
    pub(crate) async fn request(
        &mut self,
        method: Method,
        path: &str,
        org: Option<&str>,
        body: Option<Value>,
    ) -> Result<Value, String> {
        if self.access.is_none() {
            self.refresh().await?;
        }
        let response = self
            .send(method.clone(), path, org, body.clone(), true)
            .await?;
        if response.0 != 401 {
            return success(response);
        }
        self.access = None;
        self.refresh().await?;
        success(self.send(method, path, org, body, true).await?)
    }
}
fn success((status, value): (u16, Value)) -> Result<Value, String> {
    if (200..300).contains(&status) {
        return Ok(value);
    }
    Err(format!(
        "{} (HTTP {status}){}",
        value["title"]
            .as_str()
            .or(value["error"].as_str())
            .unwrap_or("Platform request failed"),
        value["request_id"]
            .as_str()
            .map(|s| format!(" · request {s}"))
            .unwrap_or_default()
    ))
}
fn segment(value: &str) -> Result<&str, String> {
    if value.is_empty()
        || value == "."
        || value == ".."
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
    {
        return Err("Invalid platform identifier".into());
    }
    Ok(value)
}
fn verification_uri(value: &str, user_code: &str) -> Result<String, String> {
    validate_external(value)?;
    let mut uri = url::Url::parse(value).map_err(|_| "Invalid verification URI")?;
    uri.query_pairs_mut().append_pair("user_code", user_code);
    Ok(uri.to_string())
}
#[tauri::command]
pub async fn cloud_status(cloud: tauri::State<'_, Cloud>) -> Result<Status, String> {
    let mut session = cloud.0.lock().await;
    let signed_in = session.access.is_some() || session.refresh().await.is_ok();
    Ok(Status {
        signed_in,
        base_url: session.base.clone(),
    })
}
#[tauri::command]
pub async fn login_start(cloud: tauri::State<'_, Cloud>) -> Result<Value, String> {
    let mut s = cloud.0.lock().await;
    let value = success(
        s.send(Method::POST, "/auth/device", None, None, false)
            .await?,
    )?;
    let code = value["device_code"]
        .as_str()
        .ok_or("Missing device code")?
        .into();
    let uri = value["verification_uri"]
        .as_str()
        .ok_or("Missing verification URI")?
        .to_owned();
    let user_code = value["user_code"].as_str().ok_or("Missing user code")?;
    let uri = verification_uri(&uri, user_code)?;
    let interval = Duration::from_secs(value["interval"].as_u64().unwrap_or(5).max(1));
    let expires = value["expires_in"].as_u64().unwrap_or(600);
    s.device = Some(Device {
        code,
        uri: uri.clone(),
        deadline: Instant::now() + Duration::from_secs(expires),
        next_poll: Instant::now() + interval,
        interval,
    });
    Ok(
        json!({"userCode":user_code, "verificationUri":uri, "interval":interval.as_secs(), "expiresIn":expires}),
    )
}
#[tauri::command]
pub async fn login_poll(cloud: tauri::State<'_, Cloud>) -> Result<bool, String> {
    let mut s = cloud.0.lock().await;
    let d = s.device.as_mut().ok_or("No sign-in in progress")?;
    if Instant::now() > d.deadline {
        s.device = None;
        return Err("Sign-in code expired; start again".into());
    }
    if Instant::now() < d.next_poll {
        return Ok(false);
    }
    d.next_poll = Instant::now() + d.interval;
    let code = d.code.clone();
    let response = s
        .send(
            Method::POST,
            "/auth/device/token",
            None,
            Some(json!({"device_code":code})),
            false,
        )
        .await?;
    match response.1["error"].as_str() {
        Some("authorization_pending") => return Ok(false),
        Some("slow_down") => {
            if let Some(d) = &mut s.device {
                d.interval += Duration::from_secs(5);
                d.next_poll = Instant::now() + d.interval;
            }
            return Ok(false);
        }
        _ => {}
    }
    s.device = None;
    s.accept_tokens(success(response)?)?;
    Ok(true)
}
#[tauri::command]
pub async fn login_cancel(cloud: tauri::State<'_, Cloud>) -> Result<(), String> {
    cloud.0.lock().await.device = None;
    Ok(())
}
#[tauri::command]
pub async fn logout(cloud: tauri::State<'_, Cloud>) -> Result<(), String> {
    let mut s = cloud.0.lock().await;
    // Clear local authority even when the server cannot be reached.
    let _ = s.send(Method::POST, "/auth/logout", None, None, true).await;
    s.access = None;
    s.refresh = None;
    s.device = None;
    match s.credential()?.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Could not remove stored session: {e}")),
    }
}
#[tauri::command]
pub async fn cloud_read(
    cloud: tauri::State<'_, Cloud>,
    resource: String,
    org: Option<String>,
    id: Option<String>,
    run: Option<String>,
) -> Result<Value, String> {
    let org_path = || -> Result<String, String> {
        Ok(format!(
            "/orgs/{}",
            segment(org.as_deref().ok_or("Choose an organisation")?)?
        ))
    };
    let id = id.as_deref().map(segment).transpose()?;
    let path = match resource.as_str() {
        "me" => "/me".into(),
        "tools" => "/tools".into(),
        "jobs" => "/jobs?limit=200".into(),
        "limits" => format!("{}/limits", org_path()?),
        "organisation" => org_path()?,
        "members" => format!("{}/members", org_path()?),
        "installations" => format!("{}/scm/installations", org_path()?),
        "repositories" => format!(
            "{}/scm/installations/{}/repos",
            org_path()?,
            id.ok_or("Missing installation")?
        ),
        "job" => format!("/jobs/{}", id.ok_or("Missing job")?),
        "report" => format!(
            "/jobs/{}/runs/{}/report",
            id.ok_or("Missing job")?,
            segment(run.as_deref().ok_or("Missing run")?)?
        ),
        _ => return Err("Unknown desktop resource".into()),
    };
    cloud
        .0
        .lock()
        .await
        .request(Method::GET, &path, org.as_deref(), None)
        .await
}
#[tauri::command]
pub async fn cloud_analyse(
    cloud: tauri::State<'_, Cloud>,
    org: String,
    installation: String,
    repository: String,
    reference: String,
    rerun: bool,
    request_id: String,
) -> Result<Value, String> {
    if reference.trim().is_empty() || reference.len() > 250 {
        return Err("Choose a branch, tag or commit".into());
    }
    let path = format!(
        "/orgs/{}/scm/installations/{}/repos/{}/analyses",
        segment(&org)?,
        segment(&installation)?,
        segment(&repository)?
    );
    cloud
        .0
        .lock()
        .await
        .request(
            Method::POST,
            &path,
            Some(&org),
            Some(json!({"ref":reference,"rerun":rerun,"idempotency_key":segment(&request_id)?})),
        )
        .await
}
#[tauri::command]
pub async fn cloud_cancel(
    cloud: tauri::State<'_, Cloud>,
    org: String,
    id: String,
) -> Result<Value, String> {
    cloud
        .0
        .lock()
        .await
        .request(
            Method::POST,
            &format!("/jobs/{}/cancel", segment(&id)?),
            Some(segment(&org)?),
            None,
        )
        .await
}
#[tauri::command]
pub async fn cloud_report(
    cloud: tauri::State<'_, Cloud>,
    org: String,
    id: String,
    run: String,
) -> Result<String, String> {
    let mut s = cloud.0.lock().await;
    let link = s
        .request(
            Method::GET,
            &format!("/jobs/{}/runs/{}/report", segment(&id)?, segment(&run)?),
            Some(segment(&org)?),
            None,
        )
        .await?;
    let uri = link["url"].as_str().ok_or("Missing report download link")?;
    validate_external(uri)?;
    if link["size"].as_u64().unwrap_or(u64::MAX) > 10 * 1024 * 1024 {
        return Err("Report exceeds the desktop limit of 10 MiB".into());
    }
    // Signed artifact links never receive the platform bearer or X-Org header.
    let mut response = s
        .client
        .get(uri)
        .send()
        .await
        .map_err(|_| "Could not download report")?;
    if !response.status().is_success() {
        return Err(format!(
            "Report download failed (HTTP {})",
            response.status()
        ));
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Report download interrupted")?
    {
        if bytes.len() + chunk.len() > 10 * 1024 * 1024 {
            return Err("Report exceeds 10 MiB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    if format!("{:x}", Sha256::digest(&bytes))
        != link["sha256"].as_str().ok_or("Missing report checksum")?
    {
        return Err("Report checksum mismatch".into());
    }
    String::from_utf8(bytes).map_err(|_| "Report is not UTF-8".into())
}
fn validate_external(value: &str) -> Result<(), String> {
    let url = url::Url::parse(value).map_err(|_| "Invalid link")?;
    if url.scheme() != "https"
        || url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err("Only HTTPS links may be opened".into());
    }
    Ok(())
}
/// Starts attaching a GitHub account and opens the authorisation in the system
/// browser. The desktop cannot host GitHub's consent screen itself, and the
/// platform binds the flow to the signed-in session, so the browser is the only
/// place it can finish. The caller then polls `me` until the identity appears.
#[tauri::command]
pub async fn connect_github(cloud: tauri::State<'_, Cloud>) -> Result<String, String> {
    let value = cloud
        .0
        .lock()
        .await
        .request(Method::POST, "/me/identities/github", None, None)
        .await?;
    let url = value["authorize_url"]
        .as_str()
        .ok_or("The platform returned no authorisation link")?
        .to_owned();
    validate_external(&url)?;
    open::that_detached(&url).map_err(|e| e.to_string())?;
    Ok(url)
}

#[tauri::command]
pub async fn open_account(cloud: tauri::State<'_, Cloud>, page: String) -> Result<(), String> {
    let s = cloud.0.lock().await;
    let url = match page.as_str() {
        "device" => s
            .device
            .as_ref()
            .ok_or("No sign-in in progress")?
            .uri
            .clone(),
        "dashboard" => ACCOUNT_URL.into(),
        "repositories" => format!("{ACCOUNT_URL}/repositories"),
        "settings" => format!("{ACCOUNT_URL}/settings"),
        _ => return Err("Unknown account page".into()),
    };
    validate_external(&url)?;
    open::that_detached(url).map_err(|e| e.to_string())
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Read, Write};
    fn fake_platform() -> (Session, std::thread::JoinHandle<String>) {
        fake_response("200 OK", "{\"ok\":true}")
    }
    fn fake_response(
        status: &'static str,
        response: &'static str,
    ) -> (Session, std::thread::JoinHandle<String>) {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let base = format!("http://{}/v1", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(Duration::from_secs(5)))
                .unwrap();
            let mut reader = BufReader::new(stream.try_clone().unwrap());
            let mut request = String::new();
            let mut length = 0;
            loop {
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                if line.to_lowercase().starts_with("content-length:") {
                    length = line
                        .split(':')
                        .nth(1)
                        .unwrap()
                        .trim()
                        .parse::<usize>()
                        .unwrap();
                }
                let end = line == "\r\n";
                request.push_str(&line);
                if end {
                    break;
                }
            }
            let mut body = vec![0; length];
            reader.read_exact(&mut body).unwrap();
            request.push_str(&String::from_utf8(body).unwrap());
            write!(
                stream,
                "HTTP/1.1 {status}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{response}",
                response.len()
            )
            .unwrap();
            request
        });
        (
            Session {
                base,
                client: Client::builder()
                    .timeout(Duration::from_secs(5))
                    .build()
                    .unwrap(),
                access: Some("test-only-bearer".into()),
                refresh: None,
                device: None,
            },
            server,
        )
    }
    #[tokio::test]
    async fn authenticated_requests_scope_each_organisation_in_headers() {
        let (mut session, server) = fake_platform();
        assert_eq!(
            session
                .request(Method::GET, "/jobs?limit=200", Some("alpha"), None)
                .await
                .unwrap(),
            json!({"ok":true})
        );
        let request = server.join().unwrap().to_lowercase();
        assert!(request.starts_with("get /v1/jobs?limit=200 http/1.1"));
        assert!(request.contains("x-org: alpha\r\n"));
        assert!(request.contains("authorization: bearer test-only-bearer\r\n"));
    }
    #[tokio::test]
    async fn device_requests_do_not_leak_an_existing_session_bearer() {
        let (session, server) = fake_platform();
        session
            .send(
                Method::POST,
                "/auth/device/token",
                None,
                Some(json!({"device_code":"test-device"})),
                false,
            )
            .await
            .unwrap();
        let request = server.join().unwrap().to_lowercase();
        assert!(!request.contains("authorization:"));
        assert!(!request.contains("x-org:"));
        assert!(request.contains("\"device_code\":\"test-device\""));
    }
    #[test]
    fn validates_platform_origin_and_identifiers() {
        assert_eq!(
            validate_base(DEFAULT_API_URL).unwrap(),
            "https://api.coretrace.fr/v1"
        );
        assert_eq!(ACCOUNT_URL, "https://app.coretrace.fr/app");
        assert_eq!(
            validate_base("http://127.0.0.1:8080/v1/").unwrap(),
            "http://127.0.0.1:8080/v1"
        );
        for bad in [
            "http://evil.test",
            "https://user:pass@host",
            "https://host?token=x",
            "file:///tmp",
        ] {
            assert!(validate_base(bad).is_err());
        }
        for bad in ["..", "org/jobs", "org?x=y", "org\r\nX-Org:x"] {
            assert!(segment(bad).is_err());
        }
    }
    #[test]
    fn verification_link_prefills_the_browser_code() {
        assert_eq!(
            verification_uri(
                "https://app.coretrace.fr/v1/auth/device/verify",
                "BCDF-GHJK"
            )
            .unwrap(),
            "https://app.coretrace.fr/v1/auth/device/verify?user_code=BCDF-GHJK"
        );
    }
    #[tokio::test]
    async fn html_404_identifies_the_misconfigured_endpoint() {
        let (session, server) = fake_response("404 Not Found", "<html>Not found</html>");
        let error = session
            .send(Method::POST, "/auth/device", None, None, false)
            .await
            .unwrap_err();
        assert!(error.contains("API endpoint not found (HTTP 404)"));
        assert!(error.contains(&format!("{}/auth/device", session.base)));
        server.join().unwrap();
    }
}
