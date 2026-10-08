#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {NativeDesktopRelay} from './native-relay.mjs';
import {CodexDesktopService} from './codex-desktop-service.mjs';

// Uses the upstream local protocol-1 relay, not the Claude/account-bound workflow.
export function createDesktopService(env=process.env) {
 const roots=(env.CODEX_DESKTOP_ALLOWED_ROOTS??'').split(path.delimiter).filter(Boolean);
 return new CodexDesktopService({relay:new NativeDesktopRelay({env,timeoutMs:20000}),roots,receiptDir:env.CODEX_DESKTOP_RECEIPT_DIR??path.join(os.homedir(),'.codex','desktop-mcp-receipts')});
}
export function createDesktopMcpServer(service) {
const mcp=new McpServer({name:'codex-desktop',version:'0.2.0'},{instructions:'Control the running local Codex Desktop through its native relay. A send acknowledgement is not task completion: poll codex_wait_thread. Send/create require explicit user authorization and a fresh requestId UUID; preserve that UUID on retries. An unknown receipt must never be retried with a new UUID without inspecting the original task. No Claude client or account is required.'});
function tool(name,description,schema,run,readOnly=true) {
 mcp.registerTool(name,{description,inputSchema:schema,annotations:{readOnlyHint:readOnly,openWorldHint:false}},async args=>{
  try{const r=await run(args);return {content:[{type:'text',text:JSON.stringify(r)}],structuredContent:r};}
  catch(e){return {isError:true,content:[{type:'text',text:JSON.stringify({error:e.code??'DESKTOP_MCP_ERROR',message:e.message})}]};}
 });
}
tool('codex_desktop_status','Check the live Desktop relay and allowed directory scope.',{},async()=>({connected:true,allowedRoots:service.roots,projectCount:(await service.projects()).projects.length,backend:'codex-desktop-native-relay',requiresClaude:false}));
tool('codex_list_projects','List allowed saved local Codex Desktop projects.',{},()=>service.projects());
tool('codex_list_threads','List recent allowed Codex Desktop chats. Limit applies before directory filtering.',{limit:z.number().int().min(1).max(50).default(20)},a=>service.list(a.limit));
tool('codex_read_thread','Read a local Desktop chat in an allowed directory.',{threadId:z.string().min(1),turnLimit:z.number().int().min(1).max(10).default(3),cursor:z.string().optional(),includeOutputs:z.boolean().default(false),maxOutputCharsPerItem:z.number().int().min(1).max(16000).default(4000)},a=>service.read(a));
tool('codex_send_message','Send an explicitly authorized prompt to an existing Desktop chat once. Poll for completion.',{threadId:z.string().min(1),prompt:z.string().min(1),requestId:z.string().uuid()},a=>service.send(a),false);
tool('codex_create_thread','Create an explicitly requested Desktop chat in an allowed saved local project, with its initial prompt.',{projectId:z.string().min(1),prompt:z.string().min(1),title:z.string().optional(),requestId:z.string().uuid()},a=>service.create(a),false);
tool('codex_wait_thread','Get an immediate compact progress/result snapshot; preserve afterCursor for later polls.',{threadId:z.string().min(1),afterCursor:z.string().optional()},a=>service.wait(a));
return mcp;
}
