//! Register Lumen's local companion with the ChatGPT desktop app's shared MCP settings.

use crate::store::Result;
use toml_edit::{value, DocumentMut, Item, Table};

fn parse(text: &str) -> Result<DocumentMut> {
    text.parse().map_err(|_| {
        "ChatGPT's local settings are not valid TOML, so Lumen left them unchanged.".into()
    })
}

pub fn with_server(text: &str, command: &str, library: &str) -> Result<String> {
    let mut config = parse(text)?;
    let mut table = Table::new();
    table.set_implicit(true);
    let servers = config
        .entry("mcp_servers")
        .or_insert(Item::Table(table))
        .as_table_like_mut()
        .ok_or("ChatGPT's mcp_servers setting is not a table, so Lumen left it unchanged.")?;
    let server = servers
        .entry("lumen")
        .or_insert(Item::Table(Table::new()))
        .as_table_like_mut()
        .ok_or("ChatGPT's Lumen setting is not a table, so Lumen left it unchanged.")?;
    // Replace transport settings while preserving the user's existing tool approval policy.
    for key in [
        "args",
        "url",
        "auth",
        "oauth",
        "bearer_token_env_var",
        "http_headers",
        "env_http_headers",
        "http_headers_helper",
        "experimental_environment",
        "cwd",
    ] {
        server.remove(key);
    }
    server.insert("command", value(command));
    server.insert("enabled", value(true));
    let env = server
        .entry("env")
        .or_insert(Item::Table(Table::new()))
        .as_table_like_mut()
        .ok_or("ChatGPT's Lumen environment is not a table, so Lumen left it unchanged.")?;
    env.insert("LUMEN_LIBRARY", value(library));
    env.insert("LUMEN_MCP_COLLECTION", value("From ChatGPT"));
    Ok(config.to_string())
}

pub fn without_server(text: &str) -> Result<String> {
    let mut config = parse(text)?;
    if let Some(servers) = config.get_mut("mcp_servers") {
        servers
            .as_table_like_mut()
            .ok_or("ChatGPT's mcp_servers setting is not a table, so Lumen left it unchanged.")?
            .remove("lumen");
    }
    Ok(config.to_string())
}

pub fn registration(text: &str, command: &str, library: &str) -> Result<(bool, bool)> {
    let config = parse(text)?;
    let Some(servers) = config.get("mcp_servers") else {
        return Ok((false, false));
    };
    let servers = servers
        .as_table_like()
        .ok_or("ChatGPT's mcp_servers setting is not a table.")?;
    let Some(server) = servers.get("lumen") else {
        return Ok((false, false));
    };
    let server = server
        .as_table_like()
        .ok_or("ChatGPT's Lumen setting is not a table.")?;
    let env = server.get("env").and_then(Item::as_table_like);
    let connected = server.get("command").and_then(Item::as_str) == Some(command)
        && server.get("enabled").and_then(Item::as_bool) != Some(false)
        && server.get("url").is_none()
        && server.get("experimental_environment").is_none()
        && server
            .get("args")
            .and_then(Item::as_array)
            .is_none_or(|a| a.is_empty())
        && env
            .and_then(|e| e.get("LUMEN_LIBRARY"))
            .and_then(Item::as_str)
            == Some(library)
        && env
            .and_then(|e| e.get("LUMEN_MCP_COLLECTION"))
            .and_then(Item::as_str)
            == Some("From ChatGPT");
    Ok((connected, !connected))
}

#[cfg(feature = "desktop")]
pub mod commands {
    use super::*;
    use crate::connect::commands::server_path;
    use crate::store::{atomic_write, default_path};
    use serde::Serialize;
    use std::path::PathBuf;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct Status {
        installed: bool,
        connected: bool,
        other_path: bool,
        server_path: String,
    }

    fn config_path() -> Result<PathBuf> {
        let home = std::env::var_os("CODEX_HOME")
            .filter(|p| !p.is_empty())
            .map(PathBuf::from)
            .or_else(|| dirs::home_dir().map(|p| p.join(".codex")))
            .ok_or("Cannot find ChatGPT's local settings folder.")?;
        if !home.is_absolute() {
            return Err("CODEX_HOME must be an absolute path.".into());
        }
        Ok(home.join("config.toml"))
    }

    fn read_config() -> Result<String> {
        match std::fs::read_to_string(config_path()?) {
            Ok(text) => Ok(text),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
            Err(_) => {
                Err("ChatGPT's local settings could not be read. Lumen left them unchanged.".into())
            }
        }
    }

    #[tauri::command(async)]
    pub fn chatgpt_status() -> Result<Status> {
        let server = server_path()?.to_string_lossy().into_owned();
        let library = default_path()?.to_string_lossy().into_owned();
        let (connected, other_path) = registration(&read_config()?, &server, &library)?;
        let installed = config_path()?.parent().is_some_and(|p| p.is_dir())
            || cfg!(target_os = "macos")
                && (std::path::Path::new("/Applications/ChatGPT.app").is_dir()
                    || dirs::home_dir()
                        .is_some_and(|p| p.join("Applications/ChatGPT.app").is_dir()));
        Ok(Status {
            installed,
            connected,
            other_path,
            server_path: server,
        })
    }

    #[tauri::command(async)]
    pub fn connect_chatgpt() -> Result<Status> {
        let text = with_server(
            &read_config()?,
            &server_path()?.to_string_lossy(),
            &default_path()?.to_string_lossy(),
        )?;
        atomic_write(&config_path()?, text.as_bytes())?;
        chatgpt_status()
    }

    #[tauri::command(async)]
    pub fn disconnect_chatgpt() -> Result<Status> {
        atomic_write(&config_path()?, without_server(&read_config()?)?.as_bytes())?;
        chatgpt_status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    const COMMAND: &str = "/Applications/Lumen.app/Contents/MacOS/lumen-mcp";
    const LIBRARY: &str = "/Users/example/Library/Application Support/app.lumen.desktop";

    #[test]
    fn preserves_other_servers_settings_comments_and_approval_policy() {
        let original = "# My settings\nmodel = \"example-model\"\n\n[mcp_servers.other]\ncommand = \"other-mcp\" # keep me\n\n[mcp_servers.lumen]\ncommand = \"/old/lumen-mcp\"\ndefault_tools_approval_mode = \"prompt\"\n";
        let added = with_server(original, COMMAND, LIBRARY).unwrap();
        assert!(added.starts_with("# My settings\nmodel = \"example-model\""));
        assert!(added.contains("command = \"other-mcp\" # keep me"));
        assert!(added.contains("default_tools_approval_mode = \"prompt\""));
        assert_eq!(
            registration(&added, COMMAND, LIBRARY).unwrap(),
            (true, false)
        );
        let removed = without_server(&added).unwrap();
        assert!(!removed.contains("mcp_servers.lumen"));
        assert!(removed.contains("command = \"other-mcp\" # keep me"));
    }

    #[test]
    fn handles_paths_with_quotes_spaces_and_inline_tables() {
        let command = "/Users/example/My \"Lumen\"/lumen-mcp";
        let original = "mcp_servers = { other = { command = 'other-mcp' } }\n";
        let added = with_server(original, command, LIBRARY).unwrap();
        assert_eq!(
            registration(&added, command, LIBRARY).unwrap(),
            (true, false)
        );
        assert!(without_server(&added).unwrap().contains("other-mcp"));
    }

    #[test]
    fn reconnects_disabled_or_moved_servers_and_uses_the_current_library() {
        let original = with_server("", COMMAND, LIBRARY).unwrap();
        assert_eq!(
            registration(&original, COMMAND, "/other-library").unwrap(),
            (false, true)
        );
        let disabled = original.replace("enabled = true", "enabled = false");
        assert_eq!(
            registration(&disabled, COMMAND, LIBRARY).unwrap(),
            (false, true)
        );
        let updated = with_server(&disabled, "/new/lumen-mcp", "/new-library").unwrap();
        assert_eq!(
            registration(&updated, "/new/lumen-mcp", "/new-library").unwrap(),
            (true, false)
        );
        let http = "[mcp_servers.lumen]\nurl = 'https://example.com/mcp'\nargs = ['--old']\n";
        assert_eq!(
            registration(
                &with_server(http, COMMAND, LIBRARY).unwrap(),
                COMMAND,
                LIBRARY
            )
            .unwrap(),
            (true, false)
        );
    }

    #[test]
    fn refuses_malformed_settings_without_replacing_them() {
        for original in [
            "not TOML",
            "mcp_servers = 5",
            "[mcp_servers]\nlumen = 5",
            "[mcp_servers.lumen]\nenv = 5",
        ] {
            assert!(with_server(original, COMMAND, LIBRARY).is_err());
        }
    }
}
