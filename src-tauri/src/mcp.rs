//! Minimal stdio MCP companion. stdout contains only JSON-RPC messages.
use lumen_lib::{
    protocol,
    store::{default_path, Store},
};
use std::io::{self, BufRead, Write};
fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = default_path()?;
    let mut store = Store::open(&root)?;
    let mut session =
        protocol::Session::with_collection(std::env::var("LUMEN_MCP_COLLECTION").ok());
    eprintln!("Lumen MCP ready. Library: {}", root.display());
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();
    // Bound allocation for each incoming line; rejected oversized requests never reach disk.
    let mut input = stdin.lock();
    loop {
        let mut buffer = Vec::new();
        use std::io::Read;
        let count = input
            .by_ref()
            .take(3_000_001)
            .read_until(b'\n', &mut buffer)?;
        if count == 0 {
            break;
        }
        if count > 3_000_000 {
            return Err("MCP message exceeds 3 MB".into());
        }
        if buffer.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let response = match serde_json::from_slice(&buffer) {
            Ok(request) => protocol::handle(&mut store, &mut session, request),
            Err(_) => Some(
                serde_json::json!({"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}),
            ),
        };
        if let Some(response) = response {
            serde_json::to_writer(&mut stdout, &response)?;
            writeln!(stdout)?;
            stdout.flush()?;
        }
    }
    Ok(())
}
