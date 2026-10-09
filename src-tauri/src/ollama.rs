//! Ask a model served by a local Ollama (https://ollama.com) instead of a chat app.
//!
//! Ollama listens on `127.0.0.1:11434` unless `OLLAMA_HOST` says otherwise. Like the chat
//! apps, each call is one stateless turn with the whole conversation in the prompt, and
//! nothing leaves the computer.

use serde_json::{json, Value};

pub const DEFAULT_HOST: &str = "http://127.0.0.1:11434";
/// Ollama's default context is too short for a note plus a conversation.
const CONTEXT_TOKENS: u32 = 16_384;

/// The server address from an `OLLAMA_HOST` value such as `0.0.0.0`, `localhost:8080` or
/// `http://box:11434`. A wildcard bind address is reached through the loopback address.
pub fn base_url(host: Option<&str>) -> String {
    let Some(host) = host.map(str::trim).filter(|h| !h.is_empty()) else {
        return DEFAULT_HOST.into();
    };
    let (scheme, rest) = match host.split_once("://") {
        Some((scheme, rest)) => (scheme, rest),
        None => ("http", host),
    };
    let rest = rest.trim_end_matches('/');
    let (name, port) = match rest.rsplit_once(':') {
        Some((name, port)) if port.chars().all(|c| c.is_ascii_digit()) => (name, port),
        _ => (rest, "11434"),
    };
    let name = match name {
        "" | "0.0.0.0" => "127.0.0.1",
        name => name,
    };
    format!("{scheme}://{name}:{port}")
}

/// Model names from an `/api/tags` reply, sorted.
pub fn model_names(tags: &Value) -> Vec<String> {
    let mut names: Vec<String> = tags["models"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| m["name"].as_str().map(str::to_string))
        .collect();
    names.sort();
    names
}

pub fn chat_request(model: &str, prompt: &str) -> Value {
    json!({
        "model": model,
        "messages": [{ "role": "user", "content": prompt }],
        "stream": false,
        "options": { "num_ctx": CONTEXT_TOKENS },
    })
}

/// The answer from an `/api/chat` reply, without any reasoning a thinking model left inline.
pub fn chat_answer(reply: &Value) -> Result<String, String> {
    if let Some(error) = reply["error"].as_str() {
        return Err(format!("Ollama: {error}"));
    }
    let content = reply["message"]["content"].as_str().unwrap_or_default();
    let answer = strip_thinking(content).trim().to_string();
    if answer.is_empty() {
        return Err("Ollama returned an empty answer.".into());
    }
    Ok(answer)
}

fn strip_thinking(text: &str) -> &str {
    match text.find("</think>") {
        Some(end) if text.trim_start().starts_with("<think>") => &text[end + "</think>".len()..],
        _ => text,
    }
}

#[cfg(feature = "desktop")]
pub mod commands {
    use super::{base_url, chat_answer, chat_request, model_names};
    use crate::store::Result;
    use serde_json::Value;
    use std::time::Duration;

    fn url(path: &str) -> String {
        format!(
            "{}{path}",
            base_url(std::env::var("OLLAMA_HOST").ok().as_deref())
        )
    }

    pub async fn models() -> Result<Vec<String>> {
        let client = reqwest::Client::new();
        let reply: Value = client
            .get(url("/api/tags"))
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .map_err(|_| "Ollama isn’t running on this computer.".to_string())?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        Ok(model_names(&reply))
    }

    pub async fn chat(model: &str, prompt: &str) -> Result<String> {
        let client = reqwest::Client::new();
        let reply: Value = client
            .post(url("/api/chat"))
            .timeout(Duration::from_secs(600))
            .json(&chat_request(model, prompt))
            .send()
            .await
            .map_err(|e| {
                if e.is_timeout() {
                    "Ollama took too long to answer. Try a smaller model.".to_string()
                } else {
                    "Lumen couldn’t reach Ollama. Is it running?".to_string()
                }
            })?
            .json()
            .await
            .map_err(|e| e.to_string())?;
        chat_answer(&reply)
    }

    /// The models Ollama has downloaded, or an error when it isn't running.
    #[tauri::command]
    pub async fn ollama_models() -> Result<Vec<String>> {
        models().await
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn base_url_reads_ollama_host_values() {
        assert_eq!(base_url(None), DEFAULT_HOST);
        assert_eq!(base_url(Some("0.0.0.0")), "http://127.0.0.1:11434");
        assert_eq!(base_url(Some("localhost:8080")), "http://localhost:8080");
        assert_eq!(base_url(Some("https://box:9000/")), "https://box:9000");
    }

    #[test]
    fn model_names_are_sorted_and_tolerate_missing_fields() {
        let tags =
            json!({ "models": [{ "name": "qwen3:8b" }, { "size": 1 }, { "name": "gemma3" }] });
        assert_eq!(model_names(&tags), ["gemma3", "qwen3:8b"]);
        assert!(model_names(&json!({})).is_empty());
    }

    #[test]
    fn chat_request_is_one_stateless_turn() {
        let body = chat_request("gemma3", "Hi");
        assert_eq!(body["stream"], false);
        assert_eq!(body["messages"][0]["content"], "Hi");
        assert_eq!(body["options"]["num_ctx"], CONTEXT_TOKENS);
    }

    #[test]
    fn chat_answer_drops_inline_reasoning_and_reports_errors() {
        let reply = json!({ "message": { "content": "<think>\nhmm\n</think>\n\nThe answer." } });
        assert_eq!(chat_answer(&reply).unwrap(), "The answer.");
        let reply = json!({ "message": { "content": "No <think> here." } });
        assert_eq!(chat_answer(&reply).unwrap(), "No <think> here.");
        let error = json!({ "error": "model \"x\" not found" });
        assert_eq!(
            chat_answer(&error).unwrap_err(),
            "Ollama: model \"x\" not found"
        );
        assert!(chat_answer(&json!({ "message": { "content": "  " } })).is_err());
    }
}
