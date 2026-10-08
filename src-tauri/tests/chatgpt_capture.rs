use lumen_lib::store::Store;
use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};

#[test]
fn chatgpt_saves_markdown_to_the_shared_inbox_through_stdio() {
    let library = tempfile::tempdir().unwrap();
    // Keep the desktop's database connection open while the companion writes separately.
    let mut desktop = Store::open(library.path()).unwrap();
    let mut child = Command::new(env!("CARGO_BIN_EXE_lumen-mcp"))
        .env("LUMEN_LIBRARY", library.path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut input = child.stdin.take().unwrap();
    let mut output = BufReader::new(child.stdout.take().unwrap());
    let mut call = |request: Value| {
        writeln!(input, "{request}").unwrap();
        input.flush().unwrap();
        let mut line = String::new();
        output.read_line(&mut line).unwrap();
        serde_json::from_str::<Value>(&line).unwrap()
    };
    let initialized = call(
        json!({"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","clientInfo":{"name":"ChatGPT","version":"1"}}}),
    );
    assert!(initialized["result"]["instructions"]
        .as_str()
        .unwrap()
        .contains("save_note"));
    let tools = call(json!({"jsonrpc":"2.0","id":2,"method":"tools/list"}));
    assert_eq!(tools["result"]["tools"][0]["name"], "save_note");
    let request = json!({"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"save_note","arguments":{
        "title":"Gradient descent",
        "markdown":"# Gradient descent\n\nUpdate $\\theta$ opposite the gradient.\n\n## Example\nMinimize $f(x)=x^2$: $x_{t+1}=x_t-2\\eta x_t$. A large learning rate can diverge.",
        "tags":["machine-learning","optimization"],
        "prompts":[{"kind":"explain","question":"Why can a large learning rate diverge?","answer":"Each update can overshoot the minimum."}]
    }}});
    let saved = call(request.clone());
    assert_eq!(
        saved["result"]["structuredContent"]["status"],
        "saved_to_inbox"
    );
    let repeated = call(request);
    assert_eq!(
        repeated["result"]["structuredContent"]["status"],
        "already_saved"
    );
    drop(input);
    assert!(child.wait().unwrap().success());

    let notes = desktop.load(vec![]).unwrap().notes;
    assert_eq!(notes.len(), 1);
    let note = &notes[0];
    assert_eq!(note.collection, "From ChatGPT");
    assert!(note.inbox);
    assert_eq!(note.intent, "reference");
    assert_eq!(note.prompts.len(), 1);
    let markdown =
        std::fs::read_to_string(library.path().join("notes").join(format!("{}.md", note.id)))
            .unwrap();
    assert!(markdown.starts_with("# Gradient descent\n"));
    assert!(markdown.contains("A large learning rate can diverge."));
}
