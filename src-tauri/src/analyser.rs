use crate::analysis::{adopt_analyser, AnalysisState};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::Duration,
};
use tauri::Manager;
use tokio::{io::AsyncWriteExt, sync::Notify};

const VERSION: &str = "v0.85.0";
const RELEASE: &str = "https://github.com/CoreTrace/coretrace/releases/download";

#[derive(Clone, Copy, Serialize)]
struct Package {
    version: &'static str,
    bytes: u64,
    #[serde(skip)]
    target: &'static str,
    #[serde(skip)]
    suffix: &'static str,
    #[serde(skip)]
    sha256: &'static str,
}

fn package() -> Option<Package> {
    let (target, suffix, bytes, sha256) = match (std::env::consts::OS, std::env::consts::ARCH) {
        ("linux", "x86_64") if supported_linux() => (
            "linux-amd64",
            "tar.gz",
            96_946_015,
            "49885e0e7fe63e65eece1e9709fb89ffa4e02e9c930fd17efe6f98124dbb9c9d",
        ),
        ("macos", "aarch64") if supported_macos() => (
            "macos-arm64",
            "dmg",
            86_175_180,
            "a0da11353af59ac83e1036e650743fb370e7d1ab78c758975600c4df1092b591",
        ),
        _ => return None,
    };
    Some(Package {
        version: VERSION,
        bytes,
        target,
        suffix,
        sha256,
    })
}

fn supported_linux() -> bool {
    static SUPPORTED: OnceLock<bool> = OnceLock::new();
    *SUPPORTED.get_or_init(|| {
        let version = std::process::Command::new("/usr/bin/getconf")
            .arg("GNU_LIBC_VERSION")
            .output()
            .ok()
            .and_then(|result| String::from_utf8(result.stdout).ok());
        version
            .and_then(|version| {
                let mut parts = version.strip_prefix("glibc ")?.trim().split('.');
                Some((
                    parts.next()?.parse::<u32>().ok()?,
                    parts.next()?.parse::<u32>().ok()?,
                ))
            })
            .is_some_and(|version| version >= (2, 34))
    })
}

fn prerequisite() -> Option<&'static str> {
    (cfg!(target_os = "linux") && !Path::new("/usr/include/stdio.h").is_file()).then_some(
        "Installez les en-têtes de la bibliothèque C (libc6-dev sur Debian/Ubuntu ou glibc-devel sur Fedora/RHEL), puis vérifiez à nouveau.",
    )
}

fn supported_macos() -> bool {
    static SUPPORTED: OnceLock<bool> = OnceLock::new();
    *SUPPORTED.get_or_init(|| {
        std::process::Command::new("/usr/bin/sw_vers")
            .arg("-productVersion")
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .and_then(|version| version.trim().split('.').next()?.parse::<u32>().ok())
            .is_some_and(|major| major >= 14)
    })
}

#[derive(Default)]
struct Transfer {
    received: AtomicU64,
    cancelled: AtomicBool,
    wake: Notify,
}

impl Transfer {
    fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::Acquire) {
            Err("Téléchargement annulé.".into())
        } else {
            Ok(())
        }
    }
}

#[derive(Default)]
pub struct Installer(Mutex<Option<Arc<Transfer>>>);

struct Installing<'a>(&'a Installer);

impl Drop for Installing<'_> {
    fn drop(&mut self) {
        if let Ok(mut active) = self.0 .0.lock() {
            *active = None;
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    available: Option<Package>,
    installed_version: Option<String>,
    path: Option<String>,
    received: Option<u64>,
    prerequisite: Option<&'static str>,
}

fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("analyser"))
}

fn selected(analysis: &AnalysisState) -> Result<Option<PathBuf>, String> {
    Ok(analysis
        .executable
        .lock()
        .map_err(|e| e.to_string())?
        .clone())
}

#[tauri::command]
pub fn analyser_status(
    app: tauri::AppHandle,
    installer: tauri::State<'_, Installer>,
    analysis: tauri::State<'_, AnalysisState>,
) -> Result<Status, String> {
    let root = data_path(&app)?;
    let path = selected(&analysis)?.filter(|path| path.is_file());
    let installed_version = path
        .as_ref()
        .and_then(|path| path.strip_prefix(root).ok())
        .and_then(|path| path.components().next())
        .and_then(|part| part.as_os_str().to_str())
        .map(str::to_owned);
    let received = installer
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .as_ref()
        .map(|transfer| transfer.received.load(Ordering::Relaxed));
    Ok(Status {
        available: package(),
        prerequisite: if path.is_none() || installed_version.is_some() {
            package().and_then(|_| prerequisite())
        } else {
            None
        },
        installed_version,
        path: path.map(|p| p.display().to_string()),
        received,
    })
}

#[tauri::command]
pub fn cancel_analyser_install(installer: tauri::State<'_, Installer>) -> Result<(), String> {
    if let Some(active) = installer.0.lock().map_err(|e| e.to_string())?.as_ref() {
        active.cancelled.store(true, Ordering::Release);
        active.wake.notify_one();
    }
    Ok(())
}

async fn download(package: Package, path: &Path, transfer: &Transfer) -> Result<(), String> {
    let url = format!(
        "{RELEASE}/{}/coretrace-{}-{}.{}",
        package.version, package.version, package.target, package.suffix
    );
    let mut output = tokio::fs::File::create(path)
        .await
        .map_err(|e| e.to_string())?;
    let mut digest = Sha256::new();
    let mut length = 0;
    let mut response = reqwest::Client::builder()
        .https_only(true)
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|e| format!("Téléchargement CoreTrace impossible : {e}"))?;
    while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
        length += chunk.len() as u64;
        if length > package.bytes {
            return Err("Taille du téléchargement CoreTrace incorrecte.".into());
        }
        output.write_all(&chunk).await.map_err(|e| e.to_string())?;
        digest.update(&chunk);
        transfer.received.store(length, Ordering::Relaxed);
    }
    if length != package.bytes || format!("{:x}", digest.finalize()) != package.sha256 {
        return Err("Le téléchargement CoreTrace a échoué à la vérification SHA-256.".into());
    }
    output.flush().await.map_err(|e| e.to_string())
}

fn unpack(
    package: Package,
    archive: &Path,
    pending: &Path,
    transfer: &Transfer,
) -> Result<PathBuf, String> {
    let name = format!("coretrace-{}-{}", package.version, package.target);
    let distribution = pending.join(&name);
    if package.suffix == "tar.gz" {
        let file = std::fs::File::open(archive).map_err(|e| e.to_string())?;
        let mut tar = tar::Archive::new(flate2::read::GzDecoder::new(file));
        for entry in tar.entries().map_err(|e| e.to_string())? {
            transfer.check()?;
            if !entry
                .and_then(|mut entry| entry.unpack_in(pending))
                .map_err(|e| e.to_string())?
            {
                return Err("Chemin inattendu dans l’archive CoreTrace.".into());
            }
        }
    } else {
        mount_and_copy(archive, pending, &name)?;
    }
    Ok(distribution)
}

fn mount_and_copy(archive: &Path, pending: &Path, name: &str) -> Result<(), String> {
    use std::process::Command;
    let mount = pending.join("image");
    let status = Command::new("/usr/bin/hdiutil")
        .args(["attach", "-readonly", "-nobrowse", "-mountpoint"])
        .arg(&mount)
        .arg(archive)
        .output()
        .map_err(|e| e.to_string())?;
    if !status.status.success() {
        return Err(format!(
            "Impossible d’ouvrir l’image CoreTrace : {}",
            String::from_utf8_lossy(&status.stderr)
        ));
    }
    let copied = Command::new("/bin/cp")
        .args(["-R", "-P"])
        .arg(mount.join(name))
        .arg(pending.join(name))
        .output();
    let detached = Command::new("/usr/bin/hdiutil")
        .arg("detach")
        .arg(&mount)
        .output();
    if !detached.is_ok_and(|output| output.status.success()) {
        return Err("Impossible d’éjecter l’image CoreTrace.".into());
    }
    if !copied.is_ok_and(|output| output.status.success()) {
        return Err("Impossible de copier l’analyseur CoreTrace.".into());
    }
    Ok(())
}

async fn smoke(executable: &Path, version: &str) -> Result<(), String> {
    let result = tokio::time::timeout(
        Duration::from_secs(15),
        tokio::process::Command::new(executable)
            .arg("--version")
            .kill_on_drop(true)
            .output(),
    )
    .await;
    if !matches!(result, Ok(Ok(output)) if output.status.success() &&
        String::from_utf8_lossy(&output.stdout).trim() == format!("ctrace {version}"))
    {
        return Err("L’analyseur CoreTrace ne démarre pas sur cette machine. Vérifiez les prérequis de la version ou choisissez un exécutable installé.".into());
    }
    Ok(())
}

async fn install_release(
    root: &Path,
    package: Package,
    transfer: &Arc<Transfer>,
) -> Result<PathBuf, String> {
    std::fs::create_dir_all(root).map_err(|e| e.to_string())?;
    let final_dir = root.join(package.version);
    let executable = final_dir.join("bin/ctrace");
    if executable.is_file() {
        transfer.received.store(package.bytes, Ordering::Relaxed);
        smoke(&executable, package.version).await?;
    } else {
        let staged = tempfile::Builder::new()
            .prefix(".install-")
            .tempdir_in(root)
            .map_err(|e| e.to_string())?;
        let archive = staged.path().join(format!("analyser.{}", package.suffix));
        tokio::select! {
            _ = transfer.wake.notified() => transfer.check()?,
            result = download(package, &archive, transfer) => result?,
        }
        transfer.check()?;
        let current = transfer.clone();
        let (staged, prepared) = tokio::task::spawn_blocking(move || {
            let prepared = unpack(package, &archive, staged.path(), &current)?;
            Ok::<_, String>((staged, prepared))
        })
        .await
        .map_err(|e| e.to_string())??;
        smoke(&prepared.join("bin/ctrace"), package.version).await?;
        transfer.check()?;
        std::fs::rename(&prepared, &final_dir).map_err(|e| e.to_string())?;
        drop(staged);
    }
    Ok(executable)
}

#[tauri::command]
pub async fn install_analyser(
    app: tauri::AppHandle,
    analysis: tauri::State<'_, AnalysisState>,
    installer: tauri::State<'_, Installer>,
    version: String,
) -> Result<String, String> {
    let package = package()
        .filter(|package| package.version == version)
        .ok_or("Aucun téléchargement officiel compatible avec cette machine.")?;
    if let Some(problem) = prerequisite() {
        return Err(problem.into());
    }
    let transfer = Arc::new(Transfer::default());
    {
        let mut active = installer.0.lock().map_err(|e| e.to_string())?;
        if active.is_some() || analysis.running.load(Ordering::Acquire) {
            return Err("Une opération CoreTrace est déjà en cours.".into());
        }
        *active = Some(transfer.clone());
    }
    let _installing = Installing(&installer);
    let before = selected(&analysis)?;
    let root = data_path(&app)?;
    let executable = install_release(&root, package, &transfer).await?;
    transfer.check()?;
    if selected(&analysis)? != before || analysis.running.load(Ordering::Acquire) {
        return Err(
            "L’analyseur a changé pendant le téléchargement. Réessayez depuis les paramètres."
                .into(),
        );
    }
    let display = adopt_analyser(&analysis, executable.clone())?;
    crate::settings::remember_analyser(&app, executable);
    Ok(display)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    #[ignore = "downloads the official analyser release for the host platform"]
    async fn official_release_installs_and_produces_sarif() {
        let package = package().expect("managed analyser target");
        assert!(prerequisite().is_none());
        let scratch = tempfile::tempdir().unwrap();
        let transfer = Arc::new(Transfer::default());
        let executable = install_release(scratch.path(), package, &transfer)
            .await
            .unwrap();
        assert_eq!(transfer.received.load(Ordering::Relaxed), package.bytes);
        let config = scratch
            .path()
            .join(package.version)
            .join("config/tool-config.json");
        let input = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../atp/appendices/datasets/DS02_clean.c")
            .canonicalize()
            .unwrap();
        let report = scratch.path().join("result.sarif");
        let result = tokio::process::Command::new(&executable)
            .arg("--config")
            .arg(config)
            .arg("--input")
            .arg(input)
            .args(["--sarif-format", "--report-file"])
            .arg(&report)
            .output()
            .await
            .unwrap();
        assert!(
            result.status.success(),
            "{}",
            String::from_utf8_lossy(&result.stderr)
        );
        let report: serde_json::Value =
            serde_json::from_slice(&std::fs::read(report).unwrap()).unwrap();
        assert_eq!(report["version"], "2.1.0");
        let offline = Package {
            bytes: 0,
            sha256: "",
            ..package
        };
        assert_eq!(
            install_release(scratch.path(), offline, &transfer)
                .await
                .unwrap(),
            executable
        );
    }

    #[test]
    fn extracts_a_distribution_into_staging_and_respects_cancellation() {
        let temp = tempfile::tempdir().unwrap();
        let package = Package {
            version: VERSION,
            bytes: 0,
            target: "linux-amd64",
            suffix: "tar.gz",
            sha256: "",
        };
        let archive = temp.path().join("package.tar.gz");
        let encoder = flate2::write::GzEncoder::new(
            std::fs::File::create(&archive).unwrap(),
            flate2::Compression::default(),
        );
        let mut tar = tar::Builder::new(encoder);
        let mut header = tar::Header::new_gnu();
        header.set_size(6);
        header.set_mode(0o755);
        header.set_cksum();
        tar.append_data(
            &mut header,
            format!("coretrace-{VERSION}-linux-amd64/bin/ctrace"),
            b"ctrace".as_slice(),
        )
        .unwrap();
        tar.into_inner().unwrap().finish().unwrap();
        let transfer = Transfer::default();
        let installed = unpack(package, &archive, temp.path(), &transfer).unwrap();
        assert_eq!(
            std::fs::read(installed.join("bin/ctrace")).unwrap(),
            b"ctrace"
        );
        transfer.cancelled.store(true, Ordering::Release);
        assert!(unpack(package, &archive, temp.path(), &transfer).is_err());
    }
}
