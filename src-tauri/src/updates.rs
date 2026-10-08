//! Over-the-air updates from the rolling `main-latest` GitHub release.
//!
//! CI versions every build of main `<major>.<minor>.<run number>` (see
//! scripts/release-macos.sh), so the updater's default semver comparison orders them, and the
//! version recorded in each update signature equals the one latest.json announces.

#[cfg(feature = "desktop")]
pub mod commands {
    use serde::Serialize;
    use std::sync::Mutex;
    use tauri::ipc::Channel;
    use tauri::{AppHandle, State};
    use tauri_plugin_updater::{Update, UpdaterExt};

    type Result<T> = std::result::Result<T, String>;

    /// The update found by the last check, kept so installing downloads exactly what was shown.
    #[derive(Default)]
    pub struct Pending(Mutex<Option<Update>>);

    #[derive(Serialize)]
    pub struct AppVersion {
        version: String,
    }

    #[derive(Serialize)]
    pub struct UpdateInfo {
        version: String,
        notes: Option<String>,
    }

    #[derive(Clone, Serialize)]
    #[serde(tag = "event", rename_all = "camelCase")]
    pub enum Progress {
        Started { total: Option<u64> },
        Progress { downloaded: u64 },
        Installing,
    }

    #[tauri::command]
    pub fn app_version(app: AppHandle) -> AppVersion {
        AppVersion {
            version: app.package_info().version.to_string(),
        }
    }

    #[tauri::command(async)]
    pub async fn check_update(
        app: AppHandle,
        pending: State<'_, Pending>,
    ) -> Result<Option<UpdateInfo>> {
        let update = app
            .updater()
            .map_err(|e| e.to_string())?
            .check()
            .await
            .map_err(|e| format!("Could not check for updates: {e}"))?;
        let info = update.as_ref().map(|u| UpdateInfo {
            version: u.version.clone(),
            notes: u.body.clone(),
        });
        *pending.0.lock().map_err(|e| e.to_string())? = update;
        Ok(info)
    }

    /// Download, verify against the bundled public key, replace the app, and relaunch.
    #[tauri::command(async)]
    pub async fn install_update(
        app: AppHandle,
        pending: State<'_, Pending>,
        on_progress: Channel<Progress>,
    ) -> Result<()> {
        let update = pending
            .0
            .lock()
            .map_err(|e| e.to_string())?
            .take()
            .ok_or("No update is ready. Check for updates again.")?;
        let mut started = false;
        let mut downloaded = 0u64;
        update
            .download_and_install(
                |chunk, total| {
                    if !started {
                        started = true;
                        let _ = on_progress.send(Progress::Started { total });
                    }
                    downloaded += chunk as u64;
                    let _ = on_progress.send(Progress::Progress { downloaded });
                },
                || {
                    let _ = on_progress.send(Progress::Installing);
                },
            )
            .await
            .map_err(|e| format!("The update could not be installed: {e}"))?;
        app.restart();
    }
}
