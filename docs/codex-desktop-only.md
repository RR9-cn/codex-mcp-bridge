# Codex Desktop-only MCP (local adaptation)

This entry exposes the running Codex Desktop through STDIO or Streamable HTTP.
It does not require Claude Desktop, Claude Code, or either application's account
files. It uses upstream's existing local protocol-1 native relay, rather than
the account-bound Claude coordination workflow. Codex Desktop owns execution,
conversation state, approvals, and model configuration.

## Connect

Keep Codex Desktop running, with `codex-native-relay` loaded. Its existing MCP
entry must forward `CODEX_APP_TOOLS_PIPE_PATH` through `env_vars`. The native
pipe is transient and must never be copied into the external client config.

Use the following entry in a local MCP client:

```json
{
  "mcpServers": {
    "codex-desktop": {
      "command": "C:/nodejs/node.exe",
      "args": ["D:/fws-repo-cache/codex-mcp-bridge/src/codex-desktop-mcp.mjs"],
      "env": {
        "CODEX_DESKTOP_ALLOWED_ROOTS": "D:/fws-repo-cache",
        "CODEX_DESKTOP_RECEIPT_DIR": "D:/fws-repo-cache/codex-mcp-bridge-local-state"
      }
    }
  }
}
```

Alternatively invoke the installed `codex-desktop-mcp` command with the same
environment. Windows allowed roots are separated by semicolons; macOS roots
are separated by colons. Directories must exist. Resolved directory boundaries
are checked before reading a chat or dispatching a write.

## Streamable HTTP

STDIO remains the default. To run a persistent local HTTP listener:

```powershell
node D:/fws-repo-cache/codex-mcp-bridge/src/codex-desktop-local.mjs --transport http --port 8792
```

The local launcher supplies the same directory and receipt defaults used by the
installed local-client configuration. For custom scope, set
`CODEX_DESKTOP_ALLOWED_ROOTS` and `CODEX_DESKTOP_RECEIPT_DIR` first, or launch
`src/codex-desktop-mcp.mjs` directly with those environment settings.
`CODEX_DESKTOP_TRANSPORT=http` and `CODEX_DESKTOP_HTTP_PORT=8792` are also supported.

Connect a Streamable HTTP MCP client to `http://127.0.0.1:8792/mcp`. In Doubao
Work's connector editor, select HTTP and enter that URL. Other clients may
require a transport/type field in addition to the URL; use their HTTP schema.
Changing an existing STDIO client to HTTP is optional.

HTTP uses the installed MCP SDK's stateless transport, with SSE POST responses
and one shared Desktop service. There is no in-memory MCP session registry.
Request UUID receipts still prevent write replay across requests/client restarts.
Task progress continues to use `codex_wait_thread`; unsolicited live Codex
event push is not implemented by this transport change.

GET `/mcp` returns 405 intentionally: the endpoint is an MCP POST endpoint,
not a browser page or the old `/sse` transport. GET `/healthz` returns listener
health only; use `codex_desktop_status` to verify the actual Desktop relay.
The server binds only to `127.0.0.1`, validates Host and Origin, and limits
request bodies to 128 KiB. No remote listener or wildcard CORS is provided.
The foreground command stops with Ctrl+C. Background launches must be stopped
by their recorded process ID after verifying it is this Node listener.

## Tools

- `codex_desktop_status`: verify live connectivity.
- `codex_list_projects`: discover allowed saved local projects.
- `codex_list_threads`: list recent allowed local chats.
- `codex_read_thread`: read paginated chat history.
- `codex_create_thread`: create an explicitly requested chat in a saved project.
- `codex_send_message`: send an authorized prompt to an existing chat.
- `codex_wait_thread`: receive an immediate progress/result snapshot.

Creation and sends require a UUID `requestId`. Persist that UUID and use it
again if the MCP client reconnects. Completed receipts return the previous
result, while pending/unknown receipts never dispatch again. Changed arguments
with the same UUID are rejected. A successful send acknowledgement does not
mean the task is complete; use `codex_wait_thread` and inspect the final turn.
The scope filter is applied after Desktop's native list limit, so a sparse
list is not proof that no other eligible chats exist.

## Boundaries

### Default execution permissions on this installation

The native `create_thread` path inherits the calling relay executor chat's
permissions; the permission choice displayed for ordinary new Desktop chats
does not necessarily govern this native path. Setting global `config.toml`
defaults alone did not change native creation in the measured Desktop build.

Windows acceptance used a dedicated, verified Full access Desktop relay
executor. Its machine-local ID is persisted in `CODEX_HOME/native-relay.json`;
configure your own executor rather than copying another installation's ID.
A new chat created
through the running HTTP MCP then recorded `sandbox_policy.type =
danger-full-access` and `approval_policy = never`. Temporary global default
configuration edits used for diagnosis were reverted; no machine-wide
requirements policy was edited.

Keep the relay executor chat available and in Full access mode. Do not send
work to that same executor through its own relay. Existing target chats may
retain their own previous permissions when continued. The MCP directory
allowlist is a separate control and remains in place.

This is a trusted local-user integration. The HTTP listener is loopback-only and does
not perform the original bridge's cross-application account attestation.
Native Desktop APIs remain private and can change with Desktop updates.
External clients require the companion to be loaded by Desktop; closing
Desktop removes that live execution path. Hosted/remote MCP access is outside
this adaptation. This entry does not launch a separate app-server or modify
the Desktop account's authentication.

## Verification

```powershell
node --test test/codex-desktop-service.test.mjs test/codex-desktop-http.test.mjs
```

These tests cover scope rejection, persistent write deduplication, ambiguous
delivery, and concurrent duplicate sends. Windows live acceptance additionally
created a native Desktop chat, received `SAVED`, then asked the same chat to
recall a per-run random codeword through a generic MCP client.
