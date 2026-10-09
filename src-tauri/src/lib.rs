pub mod assistant;
pub mod chatgpt;
pub mod connect;
pub mod ollama;
pub mod protocol;
pub mod store;
pub mod updates;
pub mod vault;

#[cfg(feature = "desktop")]
mod desktop {
    use super::assistant::commands as assistant;
    use super::chatgpt::commands as chatgpt;
    use super::connect::commands as connect;
    use super::ollama::commands as ollama;
    use super::store::{self, Attempt, Library, Note, Result, Store};
    use super::updates::commands as updates;
    use std::path::PathBuf;
    use std::sync::Mutex;

    /// One SQLite connection for the window's lifetime. It is opened on first use, so an
    /// unreadable library surfaces as a recoverable error in the UI instead of a startup
    /// panic, and a failed open is retried on the next command.
    struct AppState {
        path: PathBuf,
        store: Mutex<Option<Store>>,
    }
    impl AppState {
        fn with_store<T>(&self, f: impl FnOnce(&mut Store) -> Result<T>) -> Result<T> {
            let mut guard = self
                .store
                .lock()
                .map_err(|_| "The library is unavailable. Restart Lumen.".to_string())?;
            if guard.is_none() {
                *guard = Some(Store::open(&self.path)?);
            }
            f(guard.as_mut().expect("store was just opened"))
        }
    }

    // `async` runs these on Tauri's worker pool, so disk and database work never blocks the
    // main thread that drives the window.
    #[tauri::command(async)]
    fn load_library(state: tauri::State<AppState>, seeds: Vec<Note>) -> Result<Library> {
        state.with_store(|s| s.load(seeds))
    }
    #[tauri::command(async)]
    fn save_note(state: tauri::State<AppState>, note: Note) -> Result<Note> {
        state.with_store(|s| s.save(note))
    }
    #[tauri::command(async)]
    fn record_attempt(state: tauri::State<AppState>, attempt: Attempt) -> Result<()> {
        state.with_store(|s| s.record(attempt))
    }
    #[tauri::command(async)]
    fn export_markdown(path: String, markdown: String) -> Result<()> {
        let path = PathBuf::from(path);
        if path.extension().and_then(|v| v.to_str()) != Some("md") {
            return Err("Choose a .md file for export.".into());
        }
        store::atomic_write(&path, markdown.as_bytes())
    }
    pub fn run() {
        let path = store::default_path().expect("Cannot determine your library location");
        tauri::Builder::default()
            .plugin(tauri_plugin_dialog::init())
            .plugin(tauri_plugin_opener::init())
            .plugin(tauri_plugin_updater::Builder::new().build())
            .manage(updates::Pending::default())
            .manage(AppState {
                path,
                store: Mutex::new(None),
            })
            .invoke_handler(tauri::generate_handler![
                load_library,
                save_note,
                record_attempt,
                export_markdown,
                updates::app_version,
                updates::check_update,
                updates::install_update,
                assistant::assistant_providers,
                assistant::ask_assistant,
                ollama::ollama_models,
                connect::claude_status,
                connect::connect_claude,
                connect::disconnect_claude,
                chatgpt::chatgpt_status,
                chatgpt::connect_chatgpt,
                chatgpt::disconnect_chatgpt,
                super::vault::read_markdown_folder
            ])
            .run(tauri::generate_context!())
            .expect("Lumen could not start");
    }
}
#[cfg(feature = "desktop")]
pub use desktop::run;
