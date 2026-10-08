//! Over-the-air updates from the rolling `main-latest` GitHub release.
//!
//! Every CI build of main keeps the version from tauri.conf.json and stamps its workflow run
//! number into the binary as `LUMEN_BUILD`. The release manifest (latest.json) carries the
//! same number as semver build metadata, e.g. `0.1.0+42`, so two builds of one version are
//! still ordered.

/// The CI run number this binary was built from, or 0 for local builds.
pub fn build_number() -> u64 {
    option_env!("LUMEN_BUILD")
        .and_then(|b| b.parse().ok())
        .unwrap_or(0)
}

/// Whether a release (major, minor, patch, build) is newer than the running one.
pub fn is_newer(current: (u64, u64, u64, u64), remote: (u64, u64, u64, u64)) -> bool {
    remote > current
}

#[cfg(feature = "desktop")]
pub mod commands {
    use super::{build_number, is_newer};
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
        build: u64,
    }

    #[derive(Serialize)]
    pub struct UpdateInfo {
        version: String,
        build: u64,
        notes: Option<String>,
    }

    #[derive(Clone, Serialize)]
    #[serde(tag = "event", rename_all = "camelCase")]
    pub enum Progress {
        Started { total: Option<u64> },
        Progress { downloaded: u64 },
        Installing,
    }

    fn build_of(build: &str) -> u64 {
        build.parse().unwrap_or(0)
    }

    #[tauri::command]
    pub fn app_version(app: AppHandle) -> AppVersion {
        AppVersion {
            version: app.package_info().version.to_string(),
            build: build_number(),
        }
    }

    #[tauri::command(async)]
    pub async fn check_update(
        app: AppHandle,
        pending: State<'_, Pending>,
    ) -> Result<Option<UpdateInfo>> {
        let local = build_number();
        let update = app
            .updater_builder()
            .version_comparator(move |current, remote| {
                let remote = remote.version;
                is_newer(
                    (current.major, current.minor, current.patch, local),
                    (
                        remote.major,
                        remote.minor,
                        remote.patch,
                        build_of(remote.build.as_str()),
                    ),
                )
            })
            .build()
            .map_err(|e| e.to_string())?
            .check()
            .await
            .map_err(|e| format!("Could not check for updates: {e}"))?;
        let info = update.as_ref().map(|u| {
            let (version, build) = u.version.split_once('+').unwrap_or((&u.version, "0"));
            UpdateInfo {
                version: version.to_string(),
                build: build_of(build),
                notes: u.body.clone(),
            }
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

#[cfg(test)]
mod tests {
    use super::is_newer;

    #[test]
    fn orders_versions_then_builds() {
        assert!(is_newer((0, 1, 0, 41), (0, 1, 0, 42)));
        assert!(!is_newer((0, 1, 0, 42), (0, 1, 0, 42)));
        assert!(!is_newer((0, 1, 0, 43), (0, 1, 0, 42)));
        assert!(is_newer((0, 1, 0, 99), (0, 2, 0, 1)));
        assert!(!is_newer((0, 2, 0, 0), (0, 1, 9, 500)));
        // A local build (0) is behind any CI build of the same version.
        assert!(is_newer((0, 1, 0, 0), (0, 1, 0, 1)));
    }
}
