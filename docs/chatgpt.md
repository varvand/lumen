# Send a conversation to Lumen

The chat app writes a Markdown note from your existing conversation. Lumen's `save_note` tool saves the `.md` file locally and adds it to **Inbox**. It cannot read your library, browse chat history, or delete notes.

## ChatGPT desktop on the same computer

1. In Lumen desktop, open **Settings → Chat apps** and click **Connect** beside **ChatGPT desktop**.
2. In ChatGPT desktop, open **Settings → MCP servers**, find **lumen**, and restart the server. Alternatively, restart ChatGPT.
3. Use a local conversation with MCP tools enabled. Ask: “Send the useful ideas from this conversation to Lumen.”

ChatGPT writes the note and calls `save_note`; approve the save if ChatGPT asks. When you return to Lumen, it appears in **Inbox**, under **From ChatGPT**, unless you requested another collection. Review it, keep it, and optionally choose a learning goal.

The connection runs the bundled `lumen-mcp` directly on your computer. It requires no tunnel, public endpoint, API key, or additional account. Lumen makes no model API requests. Generating the summary uses your existing ChatGPT conversation and its normal plan or configured model usage.

Lumen adds or updates only `[mcp_servers.lumen]` in the desktop app's shared local configuration (`~/.codex/config.toml`, or the configured `CODEX_HOME`). Other servers, settings, comments, and Lumen's existing tool approval policy are preserved. The registration sets the companion's library path to match this Lumen installation, including a custom `LUMEN_LIBRARY`. **Disconnect** removes only Lumen's entry; restart the server or app to unload an already running connection.

These settings are shared with Codex CLI and the IDE extension on the same host. The local host connection is distinct from ChatGPT web or a hosted conversation without local tool access. In ChatGPT's composer, `/mcp` shows the host's connected servers. Workspace policy can restrict MCP availability.

## Claude

In **Settings → Chat apps**:

- **Claude Desktop:** choose **Connect**, then quit and reopen Claude Desktop. Lumen changes only the `mcpServers.lumen` entry in `claude_desktop_config.json`. **Disconnect** removes that entry.
- **Claude Code:** copy the shown `claude mcp add` command and run it once.

Then ask: “Send a short summary of this conversation to Lumen.” Notes arrive in **From Claude** unless you choose another collection.

## Manual Markdown import

If the conversation does not have local MCP tools, copy the summary prompt from **Settings → Chat apps → Manual Markdown import**. Paste it into the conversation, then import the generated `.md` file or paste its Markdown into Lumen's **Capture** dialog. It also arrives in Inbox.

## Other local MCP clients

The companion advertises `save_note`, with Markdown, tags, a source URL, and optional recall, explanation, and application questions. Older setups calling `save_learning_note` keep working. Identical repeated saves are deduplicated. New notes are reference-only until you explicitly choose another learning goal.

Build the companion for development:

```sh
cargo build --release --manifest-path src-tauri/Cargo.toml --no-default-features --bin lumen-mcp
```

The executable is `src-tauri/target/release/lumen-mcp` (`lumen-mcp.exe` on Windows). Register the executable directly as a stdio server:

```toml
[mcp_servers.lumen]
command = "/absolute/path/to/lumen/src-tauri/target/release/lumen-mcp"

[mcp_servers.lumen.env]
LUMEN_LIBRARY = "/absolute/path/to/your/lumen-library"
LUMEN_MCP_COLLECTION = "From ChatGPT"
```

For an installed desktop app, **Advanced: connect the save tool** shows the bundled companion path. Avoid `npm run mcp` as a client's command: npm can print non-protocol text to stdout.

Official desktop documentation checked October 8, 2026:

- [ChatGPT desktop MCP support and setup](https://learn.chatgpt.com/docs/extend/mcp)
- [Local configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference)

The process-level capture test initializes the real companion, discovers `save_note`, sends a machine-learning note, and verifies its `.md` file and Inbox metadata through the desktop's existing database connection.
