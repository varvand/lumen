use crate::store::{now, parse_markdown, Note, Prompt, Store};
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

pub const INSTRUCTIONS: &str = "Use save_note when the user asks to save, export, send, or capture something to Lumen, such as a summary of the conversation, notes, or ideas. Write the note yourself from the current conversation, in Markdown, preserving important conditions and uncertainty. Unless the user asks for another length, keep it short: roughly 100–250 words, plus one useful example when it helps. Include only sources already in the conversation; never invent citations. When the content is something to learn, add separate recall, explain, and apply prompts with suggested answers. Notes arrive in the user's Lumen inbox.";

/// The tool's current name, and the name earlier versions advertised.
const TOOL: &str = "save_note";
const LEGACY_TOOL: &str = "save_learning_note";

/// What the server knows about the connected chat app, from `initialize`.
#[derive(Default)]
pub struct Session {
    client: Option<String>,
}
impl Session {
    /// Default collection for notes from this client, e.g. "From Claude".
    fn collection(&self) -> String {
        let client = self.client.as_deref().unwrap_or_default().to_lowercase();
        let source = if client.contains("claude") {
            "Claude"
        } else if client.contains("chatgpt") || client.contains("openai") {
            "ChatGPT"
        } else if client.contains("codex") {
            "Codex"
        } else {
            "AI chats"
        };
        format!("From {source}")
    }
}

pub fn tool() -> Value {
    json!({
        "name":TOOL, "title":"Save a note to Lumen",
        "description": INSTRUCTIONS,
        "annotations":{"readOnlyHint":false,"destructiveHint":false,"idempotentHint":true,"openWorldHint":false},
        "inputSchema":{
            "type":"object", "additionalProperties":false,
            "required":["title","markdown"],
            "properties":{
                "title":{"type":"string","minLength":1,"maxLength":500,"description":"A concise note title, without line breaks."},
                "markdown":{"type":"string","minLength":1,"maxLength":2000000,"description":"Markdown summary with examples, uncertainty, and real source links. Use $...$ and $$...$$ for math."},
                "collection":{"type":"string","maxLength":100,"description":"Optional collection name. Defaults to one named after the chat app, e.g. From Claude."},
                "tags":{"type":"array","maxItems":20,"items":{"type":"string","maxLength":80}},
                "source":{"type":"string","maxLength":2000,"description":"Original conversation URL, if known. Never invent it."},
                "prompts":{"type":"array","maxItems":20,"items":{"type":"object","additionalProperties":false,"required":["kind","question","answer"],"properties":{"kind":{"type":"string","enum":["recall","explain","apply"]},"question":{"type":"string","minLength":1,"maxLength":10000},"answer":{"type":"string","minLength":1,"maxLength":20000}}}}
            }
        }
    })
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Capture {
    title: String,
    markdown: String,
    collection: Option<String>,
    tags: Option<Vec<String>>,
    source: Option<String>,
    prompts: Option<Vec<CapturePrompt>>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct CapturePrompt {
    kind: String,
    question: String,
    answer: String,
}

fn capture(store: &mut Store, args: Value, default_collection: String) -> Result<Value, String> {
    let raw = serde_json::to_string(&args).map_err(|e| e.to_string())?;
    let data: Capture = serde_json::from_value(args).map_err(|e| e.to_string())?;
    if data.title.trim().is_empty()
        || data.markdown.trim().is_empty()
        || data.collection.as_ref().is_some_and(|s| s.len() > 100)
        || data.source.as_ref().is_some_and(|s| s.len() > 2000)
        || data
            .tags
            .as_ref()
            .is_some_and(|t| t.len() > 20 || t.iter().any(|s| s.len() > 80))
    {
        return Err("The note is empty or exceeds the field limits.".into());
    }
    let id = Uuid::new_v5(&Uuid::NAMESPACE_OID, raw.as_bytes()).to_string();
    if let Some(note) = store.get(&id)? {
        return Ok(json!({"noteId":note.id,"title":note.title,"status":"already_saved"}));
    }
    let prompts = data.prompts.unwrap_or_default();
    if prompts.len() > 20
        || prompts
            .iter()
            .any(|p| p.question.len() > 10000 || p.answer.len() > 20000)
    {
        return Err("Practice questions exceed the field limits.".into());
    }
    let timestamp = now();
    let (_, body) = parse_markdown(&data.markdown, &data.title);
    let note = Note {
        id: id.clone(),
        title: data.title,
        body,
        collection: data
            .collection
            .filter(|c| !c.trim().is_empty())
            .unwrap_or(default_collection),
        tags: data.tags.unwrap_or_default(),
        source: data.source.unwrap_or_default(),
        intent: "reference".into(),
        pinned: false,
        inbox: true,
        trashed: false,
        created_at: timestamp,
        updated_at: timestamp,
        revision: 0,
        prompts: prompts
            .into_iter()
            .enumerate()
            .map(|(i, p)| Prompt {
                id: format!("{}-{}", id, i),
                kind: p.kind,
                question: p.question,
                answer: p.answer,
            })
            .collect(),
    };
    let saved = store.save(note)?;
    Ok(json!({"noteId":saved.id,"title":saved.title,"status":"saved_to_inbox"}))
}

pub fn handle(store: &mut Store, session: &mut Session, request: Value) -> Option<Value> {
    let id = request.get("id").cloned();
    if request.get("jsonrpc").and_then(Value::as_str) != Some("2.0")
        || !request.get("method").is_some_and(Value::is_string)
    {
        return Some(
            json!({"jsonrpc":"2.0","id":id.unwrap_or(Value::Null),"error":{"code":-32600,"message":"Invalid Request"}}),
        );
    }
    let id = id?; // MCP notifications have no response.
    let method = request["method"].as_str().unwrap_or_default();
    let result = match method {
        "initialize" => {
            session.client = request["params"]["clientInfo"]["name"]
                .as_str()
                .map(str::to_owned);
            let requested = request["params"]["protocolVersion"]
                .as_str()
                .unwrap_or_default();
            let version = if ["2024-11-05", "2025-03-26", "2025-06-18"].contains(&requested) {
                requested
            } else {
                "2025-06-18"
            };
            json!({"protocolVersion":version,"capabilities":{"tools":{}},"serverInfo":{"name":"lumen","version":env!("CARGO_PKG_VERSION")},"instructions":INSTRUCTIONS})
        }
        "ping" => json!({}),
        "tools/list" => json!({"tools":[tool()]}),
        "tools/call" => {
            let name = request["params"]["name"].as_str().unwrap_or_default();
            if name != TOOL && name != LEGACY_TOOL {
                return Some(
                    json!({"jsonrpc":"2.0","id":id,"error":{"code":-32602,"message":"Unknown tool"}}),
                );
            }
            match capture(
                store,
                request["params"]["arguments"].clone(),
                session.collection(),
            ) {
                Ok(saved) => {
                    json!({"content":[{"type":"text","text":saved.to_string()}],"structuredContent":saved,"isError":false})
                }
                Err(message) => json!({"content":[{"type":"text","text":message}],"isError":true}),
            }
        }
        _ => {
            return Some(
                json!({"jsonrpc":"2.0","id":id,"error":{"code":-32601,"message":"Method not found"}}),
            )
        }
    };
    Some(json!({"jsonrpc":"2.0","id":id,"result":result}))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn saves_are_idempotent_and_reference_only() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        let request = json!({"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"save_learning_note","arguments":{"title":"Captured math","markdown":"A formula: $x^2$."}}});
        let a = handle(&mut store, &mut Session::default(), request.clone()).unwrap();
        assert_eq!(a["result"]["isError"], false);
        let b = handle(&mut store, &mut Session::default(), request).unwrap();
        assert_eq!(b["result"]["structuredContent"]["status"], "already_saved");
        let library = store.load(vec![]).unwrap();
        assert_eq!(library.notes.len(), 1);
        assert!(library.notes[0].inbox);
        assert_eq!(library.notes[0].intent, "reference");
    }
    #[test]
    fn collection_follows_the_client_and_legacy_name_still_works() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        let mut session = Session::default();
        handle(
            &mut store,
            &mut session,
            json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"claude-ai","version":"1"}}}),
        );
        let save = |name: &str, title: &str, collection: Option<&str>| {
            let mut args = json!({"title":title,"markdown":"Body"});
            if let Some(c) = collection {
                args["collection"] = json!(c);
            }
            json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":name,"arguments":args}})
        };
        let r = handle(&mut store, &mut session, save("save_note", "One", None)).unwrap();
        assert_eq!(r["result"]["isError"], false);
        let r = handle(
            &mut store,
            &mut session,
            save("save_learning_note", "Two", Some("Physics")),
        )
        .unwrap();
        assert_eq!(r["result"]["isError"], false);
        let mut notes = store.load(vec![]).unwrap().notes;
        notes.sort_by(|a, b| a.title.cmp(&b.title));
        assert_eq!(notes[0].collection, "From Claude");
        assert_eq!(notes[1].collection, "Physics");
        assert_eq!(Session::default().collection(), "From AI chats");
    }
    #[test]
    fn notifications_have_no_response_and_invalid_tools_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mut store = Store::open(dir.path()).unwrap();
        assert!(handle(
            &mut store,
            &mut Session::default(),
            json!({"jsonrpc":"2.0","method":"notifications/initialized"})
        )
        .is_none());
        let r = handle(
            &mut store,
            &mut Session::default(),
            json!({"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"delete_all"}}),
        )
        .unwrap();
        assert_eq!(r["error"]["code"], -32602);
    }
}
