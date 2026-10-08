# Capture from ChatGPT

## Use your subscription now

1. In Lumen, open **Settings → Chat apps** and copy the summary prompt.
2. Paste it into the ChatGPT conversation you want to keep.
3. Download the resulting Markdown or copy its text.
4. Import the `.md` file or paste it into Lumen's Capture dialog. It arrives in Inbox.

This works without connecting any account to Lumen. The app does not itself summarize arbitrary pasted transcripts: the summary is generated in your ChatGPT conversation.

## Claude

Claude Desktop and Claude Code run the companion locally, so no tunnel or account setup is needed. In Lumen, open **Settings → Chat apps**:

- **Claude Desktop:** choose **Connect**, then quit and reopen Claude Desktop. Lumen adds only an `mcpServers.lumen` entry to `claude_desktop_config.json` and leaves the rest of the file unchanged. **Disconnect** removes that entry.
- **Claude Code:** copy the shown `claude mcp add` command and run it once.

Then ask in any chat: “Save a short summary of this chat to Lumen.”

## Automate the save using MCP

The included `lumen-mcp` executable is a stdio MCP server. It advertises one tool, `save_note`, which creates a Markdown note and optional recall, explanation, and application questions. Notes land in the Inbox, in a collection named after the chat app (for example **From Claude**) unless the chat picks one. Older setups that call `save_learning_note` keep working. Identical calls are deduplicated. It cannot read your entire library, delete notes, or browse chat history. It has no inference model and asks for no OpenAI model API key.

Build the companion:

```sh
cargo build --release --manifest-path src-tauri/Cargo.toml --no-default-features --bin lumen-mcp
```

The executable is `src-tauri/target/release/lumen-mcp` (`lumen-mcp.exe` on Windows).

For Codex, add the built executable as a stdio MCP server in your MCP settings. An example configuration, after substituting the absolute project path:

```toml
[mcp_servers.lumen]
command = "/absolute/path/to/lumen/src-tauri/target/release/lumen-mcp"
```

If using a custom data directory, set `LUMEN_LIBRARY` in that server's environment and use the same value when launching Lumen. Use the executable directly; npm scripts can print non-protocol text to stdout and are unsuitable as an MCP client command. `npm run mcp` is only a terminal development convenience.

For ChatGPT, a cloud chat needs a connection to the local stdio process. OpenAI documents a **Secure MCP Tunnel**, whose client can forward to a private stdio MCP server. Create the tunnel and configure its client according to the current documentation, pointing its stdio command at the built `lumen-mcp` binary. Then add the tunnel as a custom MCP plugin in ChatGPT and select the Lumen tool in the conversation.

The tunnel itself requires a Platform tunnel identity, permissions, and a runtime API key. That is transport configuration, separate from model inference billing. If you want no Platform configuration at all, use the manual Markdown workflow above. This project does not create a tunnel, install a connector, generate credentials, or expose a network listener automatically.

After connection, ask: “Save the useful ideas from this conversation to Lumen.” ChatGPT generates the summary with your subscription and calls the save tool. When you return to Lumen, its focus refresh picks up the new inbox note. Review and keep it, then choose Reference, Remember, or Apply.

Documentation checked October 8, 2026:

- [Add a custom MCP server](https://developers.openai.com/api/docs/guides/custom-mcp-server)
- [Secure MCP Tunnel](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels)
- [Sign in with ChatGPT plan usage](https://developers.openai.com/siwc/token-sharing-open-source): model access does not grant access to existing ChatGPT conversations.

Availability depends on your account and workspace. The companion can be tested locally; account-side connectivity needs to be completed and verified in your own ChatGPT settings.
