import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export class CodexDesktopService {
  constructor({relay,roots,receiptDir}) {
    this.relay=relay;
    if(!roots?.length) throw Error('Set CODEX_DESKTOP_ALLOWED_ROOTS to explicit existing directories');
    this.roots=roots.map(root=>fs.realpathSync(root));
    this.receiptDir=receiptDir;
  }
  allowed(cwd) {
    if(typeof cwd!=='string'||!path.isAbsolute(cwd)) return false;
    try {const target=fs.realpathSync(cwd); return this.roots.some(root=>{const rel=path.relative(root,target);return rel===''||(!path.isAbsolute(rel)&&rel!=='..'&&!rel.startsWith(`..${path.sep}`));});}
    catch{return false;}
  }
  async native(operation,args) {return (await this.relay.requestDesktop(operation,args)).result;}
  async projects() {const r=await this.native('list_projects',{});return {...r,projects:r.projects.filter(p=>p.projectKind==='local'&&p.hostId==='local'&&this.allowed(p.path))};}
  async thread(threadId) {
    const r=await this.native('read_thread',{threadId,hostId:'local',turnLimit:1,maxOutputCharsPerItem:1000});
    if(r.thread?.hostId!=='local'||r.thread?.id!==threadId||!this.allowed(r.thread?.cwd))throw Error('Target thread is outside the allowed local directories');
    return r.thread;
  }
  async list(limit=20) {
    const r=await this.native('list_threads',{limit});
    const filter=items=>(items??[]).filter(t=>t.kind==='codex'&&t.hostId==='local'&&this.allowed(t.cwd));
    return {...r,pinnedThreads:filter(r.pinnedThreads),threads:filter(r.threads)};
  }
  async read(args) {await this.thread(args.threadId);return this.native('read_thread',{...args,hostId:'local'});}
  async wait(args) {await this.thread(args.threadId);return this.native('wait_threads',{targets:[{threadId:args.threadId,hostId:'local',...(args.afterCursor?{afterCursor:args.afterCursor}:{})}],timeoutMs:0});}
  async once(operation,args,requestId,verify) {
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId))throw Error('requestId must be a fresh UUID; retain it on retries');
    fs.mkdirSync(this.receiptDir,{recursive:true,mode:0o700});
    const file=path.join(this.receiptDir,`${requestId}.json`);
    const hash=createHash('sha256').update(JSON.stringify({operation,args})).digest('hex');
    try {
      const entry=fs.lstatSync(file);
      if(!entry.isFile()||entry.isSymbolicLink()||entry.size>2*1024*1024)throw Error('Unsafe receipt file');
      const old=JSON.parse(fs.readFileSync(file,'utf8'));
      if(old.hash!==hash)throw Error('requestId was already used for different arguments');
      if(old.state!=='completed')return {deliveryStatus:'unknown',requestId,message:'A previous dispatch may have run. Inspect the target; this request was not resent.'};
      await verify();
      return {...old.result,replayed:true,requestId};
    }catch(e){if(e.code!=='ENOENT')throw e;}
    await verify();
    try{fs.writeFileSync(file,JSON.stringify({hash,state:'pending'}),{flag:'wx',mode:0o600});}
    catch(e){if(e.code==='EEXIST')return {deliveryStatus:'unknown',requestId,message:'Another caller owns this request; no dispatch occurred.'};throw e;}
    try {
      await verify();
      const result=await this.native(operation,args);
      fs.writeFileSync(file,JSON.stringify({hash,state:'completed',result}),{mode:0o600});
      return {...result,requestId};
    }catch(e){return {deliveryStatus:'unknown',requestId,message:e.message,action:'Inspect the target thread before any new send. This request will not be replayed.'};}
  }
  async send({requestId,...args}) {return this.once('send_message_to_thread',args,requestId,()=>this.thread(args.threadId));}
  async create({requestId,projectId,prompt,title}) {
    const verify=async()=>{if(!(await this.projects()).projects.some(p=>p.projectId===projectId))throw Error('Project is outside the allowed local directories');};
    return this.once('create_thread',{prompt,...(title?{title}:{}),target:{type:'project',projectId,environment:{type:'local'}}},requestId,verify);
  }
}
