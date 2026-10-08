//! Register the bundled `lumen-mcp` companion with Claude Desktop.
//!
//! Claude Desktop reads stdio MCP servers from `claude_desktop_config.json`. Only the
//! `mcpServers.lumen` entry is ever added or removed; every other setting is kept as is.

use serde_json::{json, Map, Value};

pub const SERVER: &str = "lumen";

/// The config with Lumen's entry pointing at `command`. Fails on a config that is not an
/// object, rather than replacing something the user wrote.
pub fn with_server(mut config: Value, command: &str) -> Result<Value, String> {
    let root = config
        .as_object_mut()
        .ok_or("Claude's config is not a JSON object, so Lumen left it unchanged.")?;
    let servers = root
        .entry("mcpServers")
        .or_insert_with(|| Value::Object(Map::new()))
        .as_object_mut()
        .ok_or("Claude's mcpServers setting is not a JSON object, so Lumen left it unchanged.")?;
    servers.insert(SERVER.into(), json!({ "command": command }));
    Ok(config)
}

/// The config without Lumen's entry.
pub fn without_server(mut config: Value) -> Value {
    if let Some(servers) = config.get_mut("mcpServers").and_then(Value::as_object_mut) {
        servers.remove(SERVER);
    }
    config
}

/// The command Lumen's entry currently runs, if any.
pub fn registered_command(config: &Value) -> Option<&str> {
    config["mcpServers"][SERVER]["command"].as_str()
}

#[cfg(feature = "desktop")]
pub mod commands {
    use super::{registered_command, with_server, without_server};
    use crate::store::{atomic_write, Result};
    use serde::Serialize;
    use serde_json::Value;
    use std::path::PathBuf;

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct ClaudeStatus {
        /// Claude Desktop's settings folder exists.
        installed: bool,
        /// Lumen is registered with this app's companion.
        connected: bool,
        /// Lumen is registered, but with a different companion path.
        other_path: bool,
        /// The bundled companion, for Claude Code and other MCP clients.
        server_path: String,
    }

    fn config_path() -> Result<PathBuf> {
        Ok(dirs::config_dir()
            .ok_or("Cannot find your settings folder.")?
            .join("Claude")
            .join("claude_desktop_config.json"))
    }
    fn server_path() -> Result<PathBuf> {
        let exe = std::env::current_exe().map_err(|e| e.to_string())?;
        let path = exe.with_file_name(format!("lumen-mcp{}", std::env::consts::EXE_SUFFIX));
        if !path.is_file() {
            return Err("The Lumen MCP companion is missing from this build.".into());
        }
        Ok(path)
    }
    fn read_config() -> Result<Value> {
        match std::fs::read_to_string(config_path()?) {
            Ok(text) if text.trim().is_empty() => Ok(Value::Object(Default::default())),
            Ok(text) => serde_json::from_str(&text).map_err(|e| {
                format!("Claude's config could not be read ({e}), so Lumen left it unchanged.")
            }),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                Ok(Value::Object(Default::default()))
            }
            Err(e) => Err(e.to_string()),
        }
    }
    fn write_config(config: &Value) -> Result<()> {
        let text = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
        atomic_write(&config_path()?, format!("{text}\n").as_bytes())
    }

    #[tauri::command(async)]
    pub fn claude_status() -> Result<ClaudeStatus> {
        let server = server_path()?.to_string_lossy().into_owned();
        let installed = config_path()?.parent().is_some_and(|dir| dir.is_dir());
        let config = if installed {
            read_config()?
        } else {
            Value::Null
        };
        let registered = registered_command(&config);
        Ok(ClaudeStatus {
            installed,
            connected: registered == Some(server.as_str()),
            other_path: registered.is_some_and(|c| c != server),
            server_path: server,
        })
    }
    #[tauri::command(async)]
    pub fn connect_claude() -> Result<ClaudeStatus> {
        let server = server_path()?;
        let config = with_server(read_config()?, &server.to_string_lossy())?;
        write_config(&config)?;
        claude_status()
    }
    #[tauri::command(async)]
    pub fn disconnect_claude() -> Result<ClaudeStatus> {
        write_config(&without_server(read_config()?))?;
        claude_status()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn adds_and_removes_only_lumen() {
        let config = json!({"theme":"dark","mcpServers":{"other":{"command":"x"}}});
        let added = with_server(config.clone(), "/A/lumen-mcp").unwrap();
        assert_eq!(registered_command(&added), Some("/A/lumen-mcp"));
        assert_eq!(added["mcpServers"]["other"]["command"], "x");
        assert_eq!(added["theme"], "dark");
        assert_eq!(without_server(added), config);
    }

    #[test]
    fn creates_the_servers_section_and_updates_a_moved_app() {
        let added = with_server(json!({}), "/old/lumen-mcp").unwrap();
        let moved = with_server(added, "/new/lumen-mcp").unwrap();
        assert_eq!(registered_command(&moved), Some("/new/lumen-mcp"));
        assert_eq!(moved["mcpServers"].as_object().unwrap().len(), 1);
    }

    #[test]
    fn refuses_configs_it_does_not_understand() {
        assert!(with_server(json!([1, 2]), "/a").is_err());
        assert!(with_server(json!({"mcpServers": "nope"}), "/a").is_err());
        assert_eq!(
            without_server(json!({"mcpServers": "nope"})),
            json!({"mcpServers": "nope"})
        );
    }
}
