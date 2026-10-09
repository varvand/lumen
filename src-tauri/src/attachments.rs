//! PDFs kept beside the notes, in the library's `attachments` folder. Notes refer to them by
//! file name, as `[[Lecture 5.pdf]]` or `![[Lecture 5.pdf]]`, the way Obsidian does. Text
//! extracted from a PDF is cached in SQLite so search does not read the PDF again.
use crate::store::{atomic_write, Result, Store};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

/// Lecture decks get large; anything past this is more likely a mistake than a handout.
pub const MAX_PDF_BYTES: u64 = 300 * 1024 * 1024;
/// Extracted text kept for search, across all pages of one PDF.
const MAX_TEXT_BYTES: usize = 8_000_000;
const MAX_NAME_BYTES: usize = 200;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    pub name: String,
    pub size: u64,
    pub added_at: i64,
}

/// The text of each page of a PDF, for the file size it was read from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PdfText {
    pub name: String,
    pub size: u64,
    pub pages: Vec<String>,
}

fn is_pdf_name(name: &str) -> bool {
    name.len() > 4 && name[name.len() - 4..].eq_ignore_ascii_case(".pdf")
}

/// A file name inside the attachments folder: no folders, no hidden files, ends in `.pdf`.
pub fn validate_name(name: &str) -> Result<()> {
    if name.len() > MAX_NAME_BYTES
        || !is_pdf_name(name)
        || name.starts_with('.')
        || name.trim() != name
        || name.chars().any(|c| c == '/' || c == '\\' || c.is_control())
    {
        return Err("Invalid attachment name".into());
    }
    Ok(())
}

/// A safe name for a copied file, keeping what the person called it where possible.
pub fn clean_name(file_name: &str) -> String {
    let mut name: String = file_name
        .chars()
        .map(|c| match c {
            '/' | '\\' | ':' => '-',
            c if c.is_control() => ' ',
            c => c,
        })
        .collect();
    name = name.trim().trim_start_matches('.').trim().to_string();
    if !is_pdf_name(&name) {
        name.push_str(".pdf");
    }
    if name.len() > MAX_NAME_BYTES {
        let mut stem = name[..name.len() - 4].to_string();
        while stem.len() > MAX_NAME_BYTES - 4 {
            stem.pop();
        }
        name = format!("{}.pdf", stem.trim_end());
    }
    if name.len() <= 4 {
        "Document.pdf".into()
    } else {
        name
    }
}

/// "Lecture.pdf", then "Lecture 2.pdf", "Lecture 3.pdf", …
fn numbered(name: &str, n: u32) -> String {
    if n < 2 {
        return name.to_string();
    }
    format!("{} {}.pdf", &name[..name.len() - 4], n)
}

impl Store {
    fn attachments_dir(&self) -> PathBuf {
        self.root.join("attachments")
    }

    /// Copy a PDF into the library. Adding the same file again returns the copy already there.
    pub fn add_attachment(&mut self, source: &Path) -> Result<Attachment> {
        let metadata = fs::metadata(source).map_err(err)?;
        if !metadata.is_file() {
            return Err("Choose a PDF file.".into());
        }
        if metadata.len() > MAX_PDF_BYTES {
            return Err("This PDF is larger than 300 MB.".into());
        }
        let bytes = fs::read(source).map_err(err)?;
        if !bytes.starts_with(b"%PDF-") {
            return Err("This file is not a PDF.".into());
        }
        let wanted = clean_name(
            &source
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default(),
        );
        let dir = self.attachments_dir();
        fs::create_dir_all(&dir).map_err(err)?;
        for n in 1..10_000 {
            let name = numbered(&wanted, n);
            if validate_name(&name).is_err() {
                break;
            }
            let path = dir.join(&name);
            match fs::symlink_metadata(&path) {
                Err(_) => {
                    atomic_write(&path, &bytes)?;
                    return self.attachment(&name);
                }
                Ok(existing)
                    if existing.is_file()
                        && existing.len() == bytes.len() as u64
                        && fs::read(&path).map_err(err)? == bytes =>
                {
                    return self.attachment(&name);
                }
                Ok(_) => continue,
            }
        }
        Err("Could not find a free name for this PDF.".into())
    }

    fn attachment(&self, name: &str) -> Result<Attachment> {
        validate_name(name)?;
        let metadata = fs::symlink_metadata(self.attachments_dir().join(name)).map_err(err)?;
        if !metadata.is_file() {
            return Err("Attachment not found".into());
        }
        let added_at = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or_default();
        Ok(Attachment {
            name: name.to_string(),
            size: metadata.len(),
            added_at,
        })
    }

    /// PDFs in the attachments folder, by name. Folders, links, and other files are skipped.
    pub fn attachments(&self) -> Result<Vec<Attachment>> {
        let dir = self.attachments_dir();
        if !dir.exists() {
            return Ok(Vec::new());
        }
        let mut found = Vec::new();
        for entry in fs::read_dir(dir).map_err(err)? {
            let name = entry.map_err(err)?.file_name().to_string_lossy().into_owned();
            if validate_name(&name).is_ok() {
                if let Ok(attachment) = self.attachment(&name) {
                    found.push(attachment);
                }
            }
        }
        found.sort_by_key(|a| a.name.to_lowercase());
        Ok(found)
    }

    pub fn read_attachment(&self, name: &str) -> Result<Vec<u8>> {
        let attachment = self.attachment(name)?;
        if attachment.size > MAX_PDF_BYTES {
            return Err("This PDF is larger than 300 MB.".into());
        }
        fs::read(self.attachments_dir().join(name)).map_err(err)
    }

    /// Cached text for PDFs that are still there and unchanged since it was read.
    pub fn pdf_texts(&self) -> Result<Vec<PdfText>> {
        let current = self.attachments()?;
        let mut texts = Vec::new();
        for attachment in current {
            let row: Option<(i64, String)> = self
                .conn
                .query_row(
                    "SELECT size, pages FROM pdf_text WHERE name = ?1",
                    [&attachment.name],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()
                .map_err(err)?;
            if let Some((size, pages)) = row {
                if size as u64 == attachment.size {
                    texts.push(PdfText {
                        name: attachment.name,
                        size: attachment.size,
                        pages: serde_json::from_str(&pages).map_err(err)?,
                    });
                }
            }
        }
        Ok(texts)
    }

    pub fn save_pdf_text(&self, text: PdfText) -> Result<()> {
        let attachment = self.attachment(&text.name)?;
        if attachment.size != text.size {
            return Err("The PDF changed while it was being read.".into());
        }
        let pages = serde_json::to_string(&text.pages).map_err(err)?;
        if pages.len() > MAX_TEXT_BYTES {
            return Err("The PDF has too much text to index.".into());
        }
        self.conn
            .execute(
                "INSERT INTO pdf_text (name, size, pages) VALUES (?1, ?2, ?3) ON CONFLICT(name) DO UPDATE SET size=excluded.size, pages=excluded.pages",
                params![text.name, text.size as i64, pages],
            )
            .map_err(err)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pdf(dir: &Path, name: &str, body: &str) -> PathBuf {
        let path = dir.join(name);
        fs::write(&path, format!("%PDF-1.4\n{body}")).unwrap();
        path
    }

    #[test]
    fn names_stay_inside_the_folder_and_end_in_pdf() {
        assert_eq!(clean_name("Lecture 5.pdf"), "Lecture 5.pdf");
        assert_eq!(clean_name("../../etc/passwd"), "-..-etc-passwd.pdf");
        assert_eq!(clean_name(".hidden.PDF"), "hidden.PDF");
        assert_eq!(clean_name(""), "Document.pdf");
        assert!(clean_name(&"a".repeat(400)).len() <= MAX_NAME_BYTES);
        assert!(validate_name("Notes.pdf").is_ok());
        for bad in ["../x.pdf", "a/b.pdf", ".x.pdf", "x.txt", " x.pdf", "a\\b.pdf"] {
            assert!(validate_name(bad).is_err(), "{bad}");
        }
    }

    #[test]
    fn copies_pdfs_reuses_identical_files_and_numbers_different_ones() {
        let library = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let mut store = Store::open(library.path()).unwrap();
        let first = store
            .add_attachment(&pdf(outside.path(), "Lecture.pdf", "one"))
            .unwrap();
        assert_eq!(first.name, "Lecture.pdf");
        let again = store
            .add_attachment(&pdf(outside.path(), "Lecture.pdf", "one"))
            .unwrap();
        assert_eq!(again.name, "Lecture.pdf");
        let other = store
            .add_attachment(&pdf(outside.path(), "Lecture.pdf", "two"))
            .unwrap();
        assert_eq!(other.name, "Lecture 2.pdf");
        let names: Vec<_> = store.attachments().unwrap().into_iter().map(|a| a.name).collect();
        assert_eq!(names, ["Lecture 2.pdf", "Lecture.pdf"]);
        assert_eq!(
            store.read_attachment("Lecture 2.pdf").unwrap(),
            b"%PDF-1.4\ntwo"
        );
    }

    #[test]
    fn rejects_files_that_are_not_pdfs_and_names_outside_the_folder() {
        let library = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let mut store = Store::open(library.path()).unwrap();
        let fake = outside.path().join("fake.pdf");
        fs::write(&fake, "not a pdf").unwrap();
        assert!(store.add_attachment(&fake).is_err());
        assert!(store.add_attachment(outside.path()).is_err());
        assert!(store.read_attachment("../library.sqlite3").is_err());
        assert!(store.read_attachment("missing.pdf").is_err());
    }

    #[test]
    fn caches_text_until_the_pdf_changes() {
        let library = tempfile::tempdir().unwrap();
        let outside = tempfile::tempdir().unwrap();
        let mut store = Store::open(library.path()).unwrap();
        let added = store
            .add_attachment(&pdf(outside.path(), "Waves.pdf", "v1"))
            .unwrap();
        let text = PdfText {
            name: added.name.clone(),
            size: added.size,
            pages: vec!["Snell's law".into(), "Total internal reflection".into()],
        };
        store.save_pdf_text(text.clone()).unwrap();
        assert_eq!(store.pdf_texts().unwrap(), [text]);
        fs::write(library.path().join("attachments/Waves.pdf"), "%PDF-1.4\nlonger v2").unwrap();
        assert!(store.pdf_texts().unwrap().is_empty());
        assert!(store
            .save_pdf_text(PdfText {
                name: "Waves.pdf".into(),
                size: added.size,
                pages: vec![],
            })
            .is_err());
    }
}
