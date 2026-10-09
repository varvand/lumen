use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub type Result<T> = std::result::Result<T, String>;
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
pub fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub kind: String,
    pub question: String,
    pub answer: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub collection: String,
    pub tags: Vec<String>,
    pub intent: String,
    pub pinned: bool,
    pub inbox: bool,
    pub trashed: bool,
    pub created_at: i64,
    pub updated_at: i64,
    pub revision: u64,
    pub prompts: Vec<Prompt>,
    pub source: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Attempt {
    pub id: String,
    pub note_id: String,
    pub prompt_id: String,
    pub kind: String,
    pub response: String,
    pub rating: String,
    pub reviewed_at: i64,
    pub due_at: i64,
    pub interval_days: u32,
}
#[derive(Debug, Serialize)]
pub struct Library {
    pub notes: Vec<Note>,
    pub attempts: Vec<Attempt>,
    pub path: String,
}

pub fn default_path() -> Result<PathBuf> {
    if let Some(value) = std::env::var_os("LUMEN_LIBRARY") {
        let path = PathBuf::from(value);
        if !path.is_absolute() {
            return Err("LUMEN_LIBRARY must be an absolute path".into());
        }
        return Ok(path);
    }
    dirs::data_dir()
        .map(|p| p.join("app.lumen.desktop"))
        .ok_or("No application data directory found".into())
}
pub fn validate_id(id: &str) -> Result<()> {
    if id.is_empty()
        || id.len() > 128
        || !id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid note identifier".into());
    }
    Ok(())
}
pub fn validate(note: &Note) -> Result<()> {
    validate_id(&note.id)?;
    if note.body.len() > 2_000_000 || note.title.len() > 500 || note.title.contains(['\n', '\r']) {
        return Err("Note is too large or its title contains a line break".into());
    }
    if !["reference", "remember", "apply"].contains(&note.intent.as_str()) {
        return Err("Unknown learning goal".into());
    }
    if note.prompts.len() > 100 {
        return Err("A note can have at most 100 questions".into());
    }
    let mut ids = std::collections::HashSet::new();
    for prompt in &note.prompts {
        validate_id(&prompt.id)?;
        if !ids.insert(&prompt.id)
            || !["recall", "explain", "apply"].contains(&prompt.kind.as_str())
            || prompt.question.trim().is_empty()
            || prompt.answer.trim().is_empty()
        {
            return Err("Invalid practice question".into());
        }
    }
    Ok(())
}
pub fn note_markdown(note: &Note) -> String {
    format!("# {}\n\n{}\n", note.title, note.body)
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().ok_or("Invalid file destination")?;
    // Never follow a substituted symlink when replacing a note.
    if path
        .symlink_metadata()
        .map(|m| m.file_type().is_symlink())
        .unwrap_or(false)
    {
        return Err("Refusing to overwrite a symbolic link".into());
    }
    let mut temp = tempfile::NamedTempFile::new_in(parent).map_err(err)?;
    temp.write_all(bytes).map_err(err)?;
    temp.as_file().sync_all().map_err(err)?;
    temp.persist(path).map_err(err)?;
    Ok(())
}

pub struct Store {
    pub(crate) root: PathBuf,
    pub(crate) conn: Connection,
}
impl Store {
    pub fn open(root: &Path) -> Result<Self> {
        fs::create_dir_all(root.join("notes")).map_err(err)?;
        let conn = Connection::open(root.join("library.sqlite3")).map_err(err)?;
        conn.busy_timeout(std::time::Duration::from_secs(5))
            .map_err(err)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS file_snapshots (id TEXT PRIMARY KEY, content TEXT NOT NULL); CREATE TABLE IF NOT EXISTS attempts (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pdf_text (name TEXT PRIMARY KEY, size INTEGER NOT NULL, pages TEXT NOT NULL);").map_err(err)?;
        Ok(Self {
            root: root.to_path_buf(),
            conn,
        })
    }
    pub fn get(&self, id: &str) -> Result<Option<Note>> {
        validate_id(id)?;
        let raw: Option<String> = self
            .conn
            .query_row("SELECT payload FROM notes WHERE id = ?1", [id], |row| {
                row.get(0)
            })
            .optional()
            .map_err(err)?;
        raw.map(|s| serde_json::from_str(&s).map_err(err))
            .transpose()
    }
    pub fn save(&mut self, mut note: Note) -> Result<Note> {
        validate(&note)?;
        let path = self.root.join("notes").join(format!("{}.md", note.id));
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(err)?;
        let raw: Option<String> = tx
            .query_row("SELECT payload FROM notes WHERE id = ?1", [&note.id], |r| {
                r.get(0)
            })
            .optional()
            .map_err(err)?;
        if let Some(raw) = raw {
            let old: Note = serde_json::from_str(&raw).map_err(err)?;
            if old.revision != note.revision {
                return Err("This note changed elsewhere. Export your draft, then reload before editing again.".into());
            }
            let disk = fs::read_to_string(&path).map_err(err)?;
            let snapshot: Option<String> = tx
                .query_row(
                    "SELECT content FROM file_snapshots WHERE id=?1",
                    [&note.id],
                    |r| r.get(0),
                )
                .optional()
                .map_err(err)?;
            if disk != snapshot.unwrap_or_else(|| note_markdown(&old)) {
                return Err("The Markdown file changed outside Lumen. Export your draft, then reload to keep both versions.".into());
            }
        } else if note.revision != 0 || path.exists() {
            return Err(
                "A note with this identifier already exists or has an invalid revision".into(),
            );
        }
        note.revision += 1;
        note.updated_at = now();
        atomic_write(&path, note_markdown(&note).as_bytes())?;
        tx.execute("INSERT INTO notes (id,payload) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload", params![note.id, serde_json::to_string(&note).map_err(err)?]).map_err(err)?;
        tx.execute("INSERT INTO file_snapshots (id,content) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET content=excluded.content",params![note.id,note_markdown(&note)]).map_err(err)?;
        tx.commit().map_err(err)?;
        Ok(note)
    }
    pub fn load(&mut self, seeds: Vec<Note>) -> Result<Library> {
        let seeded: bool = self
            .conn
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM meta WHERE key='seeded')",
                [],
                |r| r.get(0),
            )
            .map_err(err)?;
        if !seeded && !seeds.is_empty() {
            for seed in seeds {
                if self.get(&seed.id)?.is_none() {
                    self.save(seed)?;
                }
            }
            self.conn
                .execute("INSERT OR IGNORE INTO meta VALUES ('seeded','true')", [])
                .map_err(err)?;
        }
        let tx = self
            .conn
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(err)?;
        let raws: Vec<String> = {
            let mut stmt = tx.prepare("SELECT payload FROM notes").map_err(err)?;
            let rows = stmt.query_map([], |r| r.get(0)).map_err(err)?;
            rows.collect::<std::result::Result<Vec<_>, _>>()
                .map_err(err)?
        };
        let mut snapshots: HashMap<String, String> = {
            let mut stmt = tx
                .prepare("SELECT id, content FROM file_snapshots")
                .map_err(err)?;
            let rows = stmt
                .query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
                .map_err(err)?;
            rows.collect::<std::result::Result<_, _>>().map_err(err)?
        };
        let mut notes = Vec::new();
        for raw in raws {
            let mut note: Note = serde_json::from_str(&raw).map_err(err)?;
            validate_id(&note.id)?;
            let path = self.root.join("notes").join(format!("{}.md", note.id));
            let metadata = fs::symlink_metadata(&path).map_err(|e| {
                format!(
                    "Cannot read {}: {}. Restore the file from a backup before reloading.",
                    path.display(),
                    e
                )
            })?;
            if metadata.file_type().is_symlink() || metadata.len() > 2_001_000 {
                return Err("A note was replaced by a symlink or exceeds the size limit".into());
            }
            let disk = fs::read_to_string(path).map_err(err)?;
            let snapshot = snapshots.remove(&note.id);
            let unchanged = disk == snapshot.unwrap_or_else(|| note_markdown(&note));
            if !unchanged {
                let (title, body) = parse_markdown(&disk, &note.title);
                note.title = title;
                note.body = body;
                note.revision += 1;
                note.updated_at = now();
                tx.execute(
                    "UPDATE notes SET payload=?1 WHERE id=?2",
                    params![serde_json::to_string(&note).map_err(err)?, note.id],
                )
                .map_err(err)?;
                tx.execute("INSERT INTO file_snapshots (id,content) VALUES (?1,?2) ON CONFLICT(id) DO UPDATE SET content=excluded.content",params![note.id,disk]).map_err(err)?;
            }
            notes.push(note);
        }
        let attempts = {
            let mut stmt = tx.prepare("SELECT payload FROM attempts").map_err(err)?;
            let rows = stmt.query_map([], |r| r.get::<_, String>(0)).map_err(err)?;
            let mut items = Vec::new();
            for row in rows {
                items.push(serde_json::from_str(&row.map_err(err)?).map_err(err)?);
            }
            items
        };
        tx.commit().map_err(err)?;
        Ok(Library {
            notes,
            attempts,
            path: self.root.to_string_lossy().into_owned(),
        })
    }
    pub fn record(&self, attempt: Attempt) -> Result<()> {
        validate_id(&attempt.id)?;
        if !["again", "effort", "got-it"].contains(&attempt.rating.as_str())
            || attempt.response.len() > 100_000
            || attempt.due_at <= attempt.reviewed_at
            || attempt.interval_days > 180
        {
            return Err("Invalid review result".into());
        }
        let note = self
            .get(&attempt.note_id)?
            .ok_or("Review note was not found")?;
        if !note
            .prompts
            .iter()
            .any(|p| p.id == attempt.prompt_id && p.kind == attempt.kind)
        {
            return Err("Review question was not found".into());
        }
        self.conn
            .execute(
                "INSERT OR IGNORE INTO attempts (id,payload) VALUES (?1,?2)",
                params![attempt.id, serde_json::to_string(&attempt).map_err(err)?],
            )
            .map_err(err)?;
        Ok(())
    }
}
pub fn parse_markdown(text: &str, fallback: &str) -> (String, String) {
    if let Some(rest) = text.strip_prefix("# ") {
        if let Some((title, body)) = rest.split_once('\n') {
            let body = body.strip_prefix('\n').unwrap_or(body);
            return (
                title.trim().to_string(),
                body.strip_suffix('\n').unwrap_or(body).to_string(),
            );
        }
        return (rest.trim().to_string(), String::new());
    }
    (
        fallback.to_string(),
        text.strip_suffix('\n').unwrap_or(text).to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    fn note() -> Note {
        Note {
            id: "test-note".into(),
            title: "An equation".into(),
            body: "$$\\int_0^1 x\\,dx$$\n\nA thought.".into(),
            collection: "Math".into(),
            tags: vec![],
            intent: "reference".into(),
            pinned: false,
            inbox: false,
            trashed: false,
            created_at: now(),
            updated_at: now(),
            revision: 0,
            prompts: vec![],
            source: String::new(),
        }
    }
    #[test]
    fn roundtrip_and_reject_stale_saves() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(dir.path()).unwrap();
        let saved = s.save(note()).unwrap();
        assert!(dir.path().join("notes/test-note.md").exists());
        assert_eq!(s.load(vec![]).unwrap().notes[0].body, saved.body);
        let mut edit = saved.clone();
        edit.body.push_str(" Updated.");
        s.save(edit).unwrap();
        assert!(s.save(saved).unwrap_err().contains("changed elsewhere"));
    }
    #[test]
    fn external_edit_is_detected_and_imported() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(dir.path()).unwrap();
        let saved = s.save(note()).unwrap();
        fs::write(
            dir.path().join("notes/test-note.md"),
            "# Changed outside\n\nNew text\n",
        )
        .unwrap();
        assert!(s.save(saved).is_err());
        let library = s.load(vec![]).unwrap();
        assert_eq!(library.notes[0].title, "Changed outside");
        assert_eq!(library.notes[0].body, "New text");
        s.save(library.notes[0].clone()).unwrap();
    }
    #[test]
    fn long_lived_store_sees_writes_from_another_connection() {
        // The desktop app keeps one connection open while the MCP companion writes separately.
        let dir = tempfile::tempdir().unwrap();
        let mut app = Store::open(dir.path()).unwrap();
        assert!(app.load(vec![]).unwrap().notes.is_empty());
        Store::open(dir.path()).unwrap().save(note()).unwrap();
        let library = app.load(vec![]).unwrap();
        assert_eq!(library.notes.len(), 1);
        app.save(library.notes[0].clone()).unwrap();
    }
    #[test]
    fn rejects_path_traversal_and_preserves_trash() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Store::open(dir.path()).unwrap();
        let mut n = note();
        n.id = "../../escape".into();
        assert!(s.save(n).is_err());
        let mut n = s.save(note()).unwrap();
        n.trashed = true;
        s.save(n).unwrap();
        assert!(s.load(vec![]).unwrap().notes[0].trashed);
        assert!(dir.path().join("notes/test-note.md").exists());
    }
}
