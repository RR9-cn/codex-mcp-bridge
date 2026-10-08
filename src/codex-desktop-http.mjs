import http from 'node:http';
import {StreamableHTTPServerTransport} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {createDesktopMcpServer} from './codex-desktop-server.mjs';

export async function startDesktopHttpServer({service,port=8792}) {
 const active=new Set();
 let actualPort=port;
 function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));}
 const listener=http.createServer(async(req,res)=>{
  const hosts=[`127.0.0.1:${actualPort}`,`localhost:${actualPort}`];
  if(!hosts.includes(req.headers.host)||req.headers.origin&&!hosts.map(h=>`http://${h}`).includes(req.headers.origin)){
   json(res,403,{error:'Invalid Host or Origin'});return;
  }
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/healthz'&&req.method==='GET'){json(res,200,{status:'ready',transport:'streamable-http',scope:'listener',endpoint:'/mcp'});return;}
  if(pathname!=='/mcp'){json(res,404,{error:'Not found'});return;}
  if(req.method!=='POST'){
   res.setHeader('Allow','POST');json(res,405,{jsonrpc:'2.0',id:null,error:{code:-32000,message:'Use a Streamable HTTP MCP client with POST /mcp. This endpoint is not a web page; stateless GET and DELETE are unsupported.'}});return;
  }
  const server=createDesktopMcpServer(service);
  const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:false,maxRequestBodySize:128*1024});
  active.add(server);
  res.once('close',()=>{active.delete(server);void server.close().catch(()=>{});});
  try {await server.connect(transport);await transport.handleRequest(req,res);}
  catch(error){
   process.stderr.write(`[codex-desktop-http] ${error.message}\n`);
   if(!res.headersSent)json(res,500,{jsonrpc:'2.0',id:null,error:{code:-32603,message:'MCP request failed'}});
   else res.end();
   active.delete(server);await server.close().catch(()=>{});
  }
 });
 await new Promise((resolve,reject)=>{listener.once('error',reject);listener.listen(port,'127.0.0.1',()=>{listener.removeListener('error',reject);resolve();});});
 actualPort=listener.address().port;
 return {url:`http://127.0.0.1:${actualPort}/mcp`,listener,async close(){
  const closed=new Promise(resolve=>listener.close(resolve));
  listener.closeAllConnections();
  await Promise.allSettled([...active].map(server=>server.close()));
  await closed;
 }};
}
