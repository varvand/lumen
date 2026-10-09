//! Ask a question about a practice card through a chat app's own command-line tool.
//!
//! Lumen runs the Claude Code (`claude`) or Codex (`codex`) CLI the user already signed in to,
//! so answers come from their own subscription and Lumen never holds an API key. Each call is
//! one stateless, tool-free turn in an empty folder: the full conversation is in the prompt.

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Provider {
    Claude,
    Codex,
}

impl Provider {
    pub const ALL: [Provider; 2] = [Provider::Claude, Provider::Codex];

    pub fn binary(self) -> &'static str {
        match self {
            Provider::Claude => "claude",
            Provider::Codex => "codex",
        }
    }

    /// Arguments for one answer read from stdin. Claude prints it; Codex writes it to `output`.
    /// `light` picks a smaller, cheaper model for simple matching work.
    pub fn args(self, output: &Path, light: bool) -> Vec<String> {
        let args: &[&str] = match self {
            Provider::Claude => &[
                "-p",
                "--tools",
                "",
                "--strict-mcp-config",
                "--no-session-persistence",
                "--output-format",
                "text",
            ],
            Provider::Codex => &[
                "exec",
                "--skip-git-repo-check",
                "--ephemeral",
                "--sandbox",
                "read-only",
                "--color",
                "never",
            ],
        };
        let mut args: Vec<String> = args.iter().map(|a| a.to_string()).collect();
        if light {
            match self {
                Provider::Claude => args.extend(["--model".into(), "haiku".into()]),
                Provider::Codex => {
                    args.extend(["-c".into(), "model_reasoning_effort=\"low\"".into()])
                }
            }
        }
        if self == Provider::Codex {
            args.push("-o".into());
            args.push(output.to_string_lossy().into_owned());
            args.push("-".into());
        }
        args
    }
}

/// Folders searched for the CLIs. Apps opened from the Dock get a minimal `PATH`, so the
/// usual install locations are added to whatever `PATH` holds.
pub fn search_path(path: Option<&std::ffi::OsStr>, home: Option<&Path>) -> Vec<PathBuf> {
    let mut dirs: Vec<PathBuf> = path
        .map(|p| std::env::split_paths(p).collect())
        .unwrap_or_default();
    let mut extra: Vec<PathBuf> = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"]
        .iter()
        .map(PathBuf::from)
        .collect();
    if let Some(home) = home {
        for dir in [
            ".local/bin",
            ".claude/local",
            ".npm-global/bin",
            ".bun/bin",
            ".volta/bin",
        ] {
            extra.push(home.join(dir));
        }
    }
    for dir in extra {
        if !dirs.contains(&dir) {
            dirs.push(dir);
        }
    }
    dirs
}

pub fn find(binary: &str, dirs: &[PathBuf]) -> Option<PathBuf> {
    dirs.iter().map(|d| d.join(binary)).find(|p| p.is_file())
}

/// The most useful line of a failed run: the last `ERROR:` line if there is one, otherwise
/// the last non-empty line.
pub fn failure_reason(stderr: &str, stdout: &str) -> String {
    let lines = || stderr.lines().chain(stdout.lines()).map(str::trim);
    lines()
        .filter_map(|l| l.strip_prefix("ERROR:").map(str::trim))
        .last()
        .or_else(|| lines().filter(|l| !l.is_empty()).last())
        .unwrap_or("The chat app stopped without an answer.")
        .to_string()
}

#[cfg(feature = "desktop")]
pub mod commands {
    use super::{failure_reason, find, search_path, Provider};
    use crate::store::Result;
    use std::io::{Read, Write};
    use std::path::PathBuf;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    const TIMEOUT: Duration = Duration::from_secs(300);

    fn dirs() -> Vec<PathBuf> {
        search_path(
            std::env::var_os("PATH").as_deref(),
            dirs::home_dir().as_deref(),
        )
    }

    /// The chat apps whose CLI is installed, in display order.
    #[tauri::command(async)]
    pub fn assistant_providers() -> Vec<Provider> {
        let dirs = dirs();
        Provider::ALL
            .into_iter()
            .filter(|p| find(p.binary(), &dirs).is_some())
            .collect()
    }

    #[tauri::command(async)]
    pub fn ask_assistant(
        provider: Provider,
        prompt: String,
        light: Option<bool>,
    ) -> Result<String> {
        let dirs = dirs();
        let binary = find(provider.binary(), &dirs).ok_or_else(|| {
            format!(
                "Lumen can’t find the `{}` command on this computer.",
                provider.binary()
            )
        })?;
        let work = tempfile::tempdir().map_err(|e| e.to_string())?;
        let output = work.path().join("answer.md");
        let path = std::env::join_paths(&dirs).map_err(|e| e.to_string())?;
        let mut child = Command::new(binary)
            .args(provider.args(&output, light.unwrap_or(false)))
            .current_dir(work.path())
            .env("PATH", path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Could not start `{}`: {e}", provider.binary()))?;

        let mut stdin = child.stdin.take().expect("stdin is piped");
        let writer = std::thread::spawn(move || stdin.write_all(prompt.as_bytes()));
        let read = |mut pipe: Box<dyn Read + Send>| {
            std::thread::spawn(move || {
                let mut text = String::new();
                let _ = pipe.read_to_string(&mut text);
                text
            })
        };
        let stdout = read(Box::new(child.stdout.take().expect("stdout is piped")));
        let stderr = read(Box::new(child.stderr.take().expect("stderr is piped")));

        let started = Instant::now();
        let status = loop {
            if let Some(status) = child.try_wait().map_err(|e| e.to_string())? {
                break status;
            }
            if started.elapsed() > TIMEOUT {
                let _ = child.kill();
                let _ = child.wait();
                return Err("The chat app took too long to answer. Try again.".into());
            }
            std::thread::sleep(Duration::from_millis(100));
        };
        let _ = writer.join();
        let stdout = stdout.join().unwrap_or_default();
        let stderr = stderr.join().unwrap_or_default();
        if !status.success() {
            return Err(failure_reason(&stderr, &stdout));
        }
        let answer = match provider {
            Provider::Claude => stdout,
            Provider::Codex => std::fs::read_to_string(&output).unwrap_or_default(),
        };
        let answer = answer.trim();
        if answer.is_empty() {
            return Err(failure_reason(
                &stderr,
                "The chat app returned an empty answer.",
            ));
        }
        Ok(answer.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn claude_runs_without_tools_and_codex_writes_its_answer_to_a_file() {
        let out = Path::new("/tmp/answer.md");
        let claude = Provider::Claude.args(out, false);
        assert_eq!(&claude[..3], ["-p", "--tools", ""]);
        assert!(!claude.contains(&"--model".to_string()));
        let codex = Provider::Codex.args(out, false);
        assert_eq!(codex[0], "exec");
        assert!(codex.windows(2).any(|w| w == ["--sandbox", "read-only"]));
        assert_eq!(&codex[codex.len() - 3..], ["-o", "/tmp/answer.md", "-"]);
    }

    #[test]
    fn light_requests_use_a_smaller_model() {
        let out = Path::new("/tmp/answer.md");
        let claude = Provider::Claude.args(out, true);
        assert!(claude.windows(2).any(|w| w == ["--model", "haiku"]));
        let codex = Provider::Codex.args(out, true);
        assert!(codex
            .windows(2)
            .any(|w| w == ["-c", "model_reasoning_effort=\"low\""]));
        // The prompt still arrives on stdin after the output file.
        assert_eq!(&codex[codex.len() - 3..], ["-o", "/tmp/answer.md", "-"]);
    }

    #[test]
    fn search_path_keeps_path_order_and_adds_install_folders_once() {
        let path = std::env::join_paths(["/a", "/opt/homebrew/bin"]).unwrap();
        let dirs = search_path(Some(&path), Some(Path::new("/home/me")));
        assert_eq!(dirs[0], PathBuf::from("/a"));
        assert_eq!(dirs[1], PathBuf::from("/opt/homebrew/bin"));
        assert_eq!(
            dirs.iter().filter(|d| d.ends_with("homebrew/bin")).count(),
            1
        );
        assert!(dirs.contains(&PathBuf::from("/home/me/.local/bin")));
    }

    #[test]
    fn failure_reason_prefers_the_last_error_line() {
        let stderr = "model: x\nERROR: first\nERROR: You’ve hit your usage limit.\n";
        assert_eq!(failure_reason(stderr, ""), "You’ve hit your usage limit.");
        assert_eq!(failure_reason("", "Not logged in\n\n"), "Not logged in");
        assert_eq!(
            failure_reason("", ""),
            "The chat app stopped without an answer."
        );
    }
}
