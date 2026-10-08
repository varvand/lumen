//! Read a folder of Markdown notes, such as an Obsidian vault, for import.
//!
//! Hidden folders (`.obsidian`, `.trash`, `.git`) are skipped and symlinks are never
//! followed, so a vault cannot pull in files from outside itself.

use crate::store::Result;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

const MAX_NOTE_BYTES: u64 = 2_000_000;
const MAX_TOTAL_BYTES: u64 = 500_000_000;
const MAX_ENTRIES: usize = 100_000;

#[derive(Serialize, Debug, PartialEq)]
pub struct VaultFile {
    /// Path inside the folder, with forward slashes.
    pub path: String,
    pub text: String,
    pub created: Option<u64>,
    pub modified: Option<u64>,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Vault {
    pub name: String,
    pub files: Vec<VaultFile>,
    /// Markdown files left out because they are too large or not UTF-8.
    pub skipped: Vec<String>,
    /// Attachments and other non-Markdown files.
    pub other_files: usize,
}

fn millis(time: std::io::Result<std::time::SystemTime>) -> Option<u64> {
    let since = time.ok()?.duration_since(UNIX_EPOCH).ok()?;
    u64::try_from(since.as_millis()).ok()
}

pub fn read(root: &Path) -> Result<Vault> {
    if !root.is_dir() {
        return Err("Choose a folder to import.".into());
    }
    let name = root
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Imported".into());
    let mut vault = Vault {
        name,
        files: vec![],
        skipped: vec![],
        other_files: 0,
    };
    let (mut entries, mut total) = (0usize, 0u64);
    let mut pending = vec![(root.to_path_buf(), String::new())];
    while let Some((dir, prefix)) = pending.pop() {
        let mut children: Vec<_> = fs::read_dir(&dir)
            .map_err(|e| format!("Could not read {}: {e}", dir.display()))?
            .filter_map(|e| e.ok())
            .collect();
        children.sort_by_key(|e| e.file_name());
        for entry in children {
            entries += 1;
            if entries > MAX_ENTRIES {
                return Err("This folder has too many files to import at once.".into());
            }
            let file_name = entry.file_name().to_string_lossy().into_owned();
            if file_name.starts_with('.') || file_name == "node_modules" {
                continue;
            }
            let path = format!("{prefix}{file_name}");
            // symlink_metadata does not follow links; links are skipped entirely.
            let Ok(meta) = entry.path().symlink_metadata() else {
                continue;
            };
            if meta.is_dir() {
                pending.push((entry.path(), format!("{path}/")));
            } else if !meta.is_file() {
                continue;
            } else if !file_name.to_lowercase().ends_with(".md") {
                vault.other_files += 1;
            } else if meta.len() > MAX_NOTE_BYTES || total + meta.len() > MAX_TOTAL_BYTES {
                vault.skipped.push(path);
            } else {
                match fs::read_to_string(entry.path()) {
                    Ok(text) => {
                        total += meta.len();
                        vault.files.push(VaultFile {
                            path,
                            text,
                            created: millis(meta.created()),
                            modified: millis(meta.modified()),
                        });
                    }
                    Err(_) => vault.skipped.push(path),
                }
            }
        }
    }
    vault.files.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(vault)
}

#[cfg(feature = "desktop")]
#[tauri::command(async)]
pub fn read_markdown_folder(path: String) -> Result<Vault> {
    read(Path::new(&path))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_markdown_and_skips_hidden_folders_and_attachments() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("My Vault");
        fs::create_dir_all(root.join("Physics/Waves")).unwrap();
        fs::create_dir_all(root.join(".obsidian")).unwrap();
        fs::create_dir_all(root.join(".trash")).unwrap();
        fs::write(root.join("Home.md"), "# Home").unwrap();
        fs::write(root.join("Physics/Waves/Light.MD"), "light").unwrap();
        fs::write(root.join("Physics/diagram.png"), [0u8, 1, 2]).unwrap();
        fs::write(root.join(".obsidian/workspace.md"), "x").unwrap();
        fs::write(root.join(".trash/old.md"), "x").unwrap();
        fs::write(root.join("big.md"), vec![b'a'; 2_000_001]).unwrap();
        fs::write(root.join("binary.md"), [0xffu8, 0xfe, 0x00]).unwrap();

        let vault = read(&root).unwrap();
        assert_eq!(vault.name, "My Vault");
        let paths: Vec<_> = vault.files.iter().map(|f| f.path.as_str()).collect();
        assert_eq!(paths, ["Home.md", "Physics/Waves/Light.MD"]);
        assert_eq!(vault.files[0].text, "# Home");
        assert!(vault.files[0].modified.is_some());
        assert_eq!(vault.other_files, 1);
        let mut skipped = vault.skipped.clone();
        skipped.sort();
        assert_eq!(skipped, ["big.md", "binary.md"]);
    }

    #[cfg(unix)]
    #[test]
    fn never_follows_symlinks_out_of_the_vault() {
        let dir = tempfile::tempdir().unwrap();
        let outside = dir.path().join("outside");
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.md"), "secret").unwrap();
        let root = dir.path().join("vault");
        fs::create_dir_all(&root).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        std::os::unix::fs::symlink(outside.join("secret.md"), root.join("note.md")).unwrap();
        assert!(read(&root).unwrap().files.is_empty());
    }

    #[test]
    fn rejects_a_file_path() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("a.md");
        fs::write(&file, "x").unwrap();
        assert!(read(&file).is_err());
    }
}
