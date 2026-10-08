import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {startDesktopHttpServer} from '../src/codex-desktop-http.mjs';

async function fixture(t,overrides={}) {
 const service={roots:['test-root'],projects:async()=>({projects:[{projectId:'test-project',label:'test'}]}),...overrides};
 const app=await startDesktopHttpServer({service,port:0});t.after(()=>app.close());return app;
}
async function client(t,url) {
 const c=new Client({name:'http-test',version:'1.0.0'});t.after(()=>c.close());await c.connect(new StreamableHTTPClientTransport(new URL(url)));return c;
}
test('two independent HTTP clients discover and call all seven shared tools',async t=>{
 const app=await fixture(t);const a=await client(t,app.url);const b=await client(t,app.url);
 assert.equal((await a.listTools()).tools.length,7);
 const [x,y]=await Promise.all([a.callTool({name:'codex_list_projects',arguments:{}}),b.callTool({name:'codex_desktop_status',arguments:{}})]);
 assert.equal(x.structuredContent.projects[0].projectId,'test-project');assert.equal(y.structuredContent.projectCount,1);
 await a.close();assert.equal((await b.listTools()).tools.length,7);
});
test('POST replies are SSE; stateless GET is 405 and health is available',async t=>{
 const app=await fixture(t);
 const r=await fetch(app.url,{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'raw-test',version:'1.0.0'}}})});
 assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/text\/event-stream/);assert.match(await r.text(),/codex-desktop/);
 assert.equal((await fetch(app.url)).status,405);
 assert.equal((await fetch(app.url.replace('/mcp','/healthz'))).status,200);
});
test('invalid host/origin, invalid JSON and oversized payloads are rejected',async t=>{
 const app=await fixture(t);
 const hostStatus=await new Promise((resolve,reject)=>{const req=http.get(app.url,{headers:{Host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);});
 assert.equal(hostStatus,403);
 assert.equal((await fetch(app.url,{headers:{Origin:'https://attacker.example'}})).status,403);
 const headers={'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 assert.equal((await fetch(app.url,{method:'POST',headers,body:'{'})).status,400);
 assert.equal((await fetch(app.url,{method:'POST',headers,body:JSON.stringify({data:'x'.repeat(130*1024)})})).status,413);
});
test('relay failure returns an MCP tool error while the HTTP listener stays usable',async t=>{
 let fail=true;const app=await fixture(t,{projects:async()=>{if(fail)throw Error('relay unavailable');return {projects:[]};}});
 const c=await client(t,app.url);
 assert.equal((await c.callTool({name:'codex_desktop_status',arguments:{}})).isError,true);
 fail=false;assert.equal((await c.callTool({name:'codex_desktop_status',arguments:{}})).structuredContent.connected,true);
});
