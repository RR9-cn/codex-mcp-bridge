#!/usr/bin/env node
// Local-client launcher for hosts whose MCP form does not import environment JSON.
// Explicit environment settings still take precedence.
process.env.CODEX_DESKTOP_ALLOWED_ROOTS ??= 'D:/fws-repo-cache';
process.env.CODEX_DESKTOP_RECEIPT_DIR ??= 'D:/fws-repo-cache/codex-mcp-bridge-local-state';
await import('./codex-desktop-mcp.mjs');
