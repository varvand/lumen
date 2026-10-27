pub mod assistant;
pub mod attachments;
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
    use super::attachments::{Attachment, PdfText};
    use super::chatgpt::commands as chatgpt;
    use super::connect::commands as connect;
    use super::ollama::commands as ollama;
    use super::store::{self, Attempt, Library, Note, Result, Store};
    use super::updates::commands as updates;
    use std::path::PathBuf;
    use std::sync::Mutex;

    /// Decode the %XX escapes of a header value (the name is sent URI-encoded to stay ASCII).
    fn urlencoding_decode(value: &str) -> String {
        let bytes = value.as_bytes();
        let mut out = Vec::with_capacity(bytes.len());
        let mut i = 0;
        while i < bytes.len() {
            let hex = (bytes[i] == b'%' && i + 2 < bytes.len())
                .then(|| value.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()))
                .flatten();
            match hex {
                Some(byte) => {
                    out.push(byte);
                    i += 3;
                }
                None => {
                    out.push(bytes[i]);
                    i += 1;
                }
            }
        }
        String::from_utf8_lossy(&out).into_owned()
    }

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
    fn add_attachment(state: tauri::State<AppState>, path: String) -> Result<Attachment> {
        state.with_store(|s| s.add_attachment(&PathBuf::from(path)))
    }
    /// A PDF dropped onto a note arrives as raw bytes, with its file name in the `name` header.
    #[tauri::command(async)]
    fn add_attachment_bytes(
        state: tauri::State<AppState>,
        request: tauri::ipc::Request<'_>,
    ) -> Result<Attachment> {
        let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
            return Err("Expected the PDF's bytes.".into());
        };
        let name = request
            .headers()
            .get("name")
            .and_then(|v| v.to_str().ok())
            .map(urlencoding_decode)
            .unwrap_or_default();
        state.with_store(|s| s.add_attachment_bytes(&name, bytes))
    }
    #[tauri::command(async)]
    fn list_attachments(state: tauri::State<AppState>) -> Result<Vec<Attachment>> {
        state.with_store(|s| s.attachments())
    }
    /// Raw bytes, so a large PDF is not encoded as a JSON array of numbers.
    #[tauri::command(async)]
    fn read_attachment(
        state: tauri::State<AppState>,
        name: String,
    ) -> Result<tauri::ipc::Response> {
        state
            .with_store(|s| s.read_attachment(&name))
            .map(tauri::ipc::Response::new)
    }
    #[tauri::command(async)]
    fn pdf_texts(state: tauri::State<AppState>) -> Result<Vec<PdfText>> {
        state.with_store(|s| s.pdf_texts())
    }
    #[tauri::command(async)]
    fn save_pdf_text(state: tauri::State<AppState>, text: PdfText) -> Result<()> {
        state.with_store(|s| s.save_pdf_text(text))
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
                add_attachment,
                add_attachment_bytes,
                list_attachments,
                read_attachment,
                pdf_texts,
                save_pdf_text,
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
