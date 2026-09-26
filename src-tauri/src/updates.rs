use tauri::AppHandle;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

/// Checks the latest GitHub release once at startup and offers to install it.
/// A failed check is only logged: being offline must not stop the app.
/// Debug builds skip it, so `npm start` never replaces itself with a release.
pub async fn check(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    if let Err(e) = offer(&app).await {
        eprintln!("update check failed: {e}");
    }
}

async fn offer(app: &AppHandle) -> tauri_plugin_updater::Result<()> {
    let Some(update) = app.updater()?.check().await? else {
        return Ok(());
    };
    let (answer, accepted) = tokio::sync::oneshot::channel();
    app.dialog()
        .message(format!(
            "CoreTrace {} est disponible (version installée : {}).\n\n\
             Installer maintenant ? L’application redémarrera.",
            update.version, update.current_version
        ))
        .title("Mise à jour disponible")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Installer".into(),
            "Plus tard".into(),
        ))
        .show(move |ok| {
            let _ = answer.send(ok);
        });
    if !accepted.await.unwrap_or(false) {
        return Ok(());
    }
    update.download_and_install(|_, _| {}, || {}).await?;
    app.restart();
}
