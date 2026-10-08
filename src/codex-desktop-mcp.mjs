#!/usr/bin/env node
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {createDesktopService,createDesktopMcpServer} from './codex-desktop-server.mjs';
import {startDesktopHttpServer} from './codex-desktop-http.mjs';

function parseOptions(args,env=process.env) {
 const options={transport:env.CODEX_DESKTOP_TRANSPORT??'stdio',host:'127.0.0.1',port:Number(env.CODEX_DESKTOP_HTTP_PORT??8792)};
 for(let i=0;i<args.length;i++) {
  const key=args[i];
  if(key==='--help'){options.help=true;continue;}
  if(!['--transport','--host','--port'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error(`Invalid option: ${key}`);
  const value=args[++i];options[key.slice(2)]=key==='--port'?Number(value):value;
 }
 if(!['stdio','http'].includes(options.transport))throw Error('Transport must be stdio or http');
 if(!Number.isInteger(options.port)||options.port<1||options.port>65535)throw Error('Port must be between 1 and 65535');
 if(options.host!=='127.0.0.1')throw Error('This local Desktop bridge only binds to 127.0.0.1');
 return options;
}
const options=parseOptions(process.argv.slice(2));
if(options.help) {
 process.stdout.write('Usage: codex-desktop-mcp [--transport stdio|http] [--port 8792]\nHTTP endpoint: http://127.0.0.1:8792/mcp; health: /healthz\nSet CODEX_DESKTOP_ALLOWED_ROOTS to allowed directories.\n');
} else {
 const service=createDesktopService();
 if(options.transport==='stdio')await createDesktopMcpServer(service).connect(new StdioServerTransport());
 else {
  const app=await startDesktopHttpServer({service,port:options.port});
  process.stderr.write(`Codex Desktop Streamable HTTP: ${app.url}\n`);
  const stop=()=>{void app.close().then(()=>process.exit(0));};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
 }
}
