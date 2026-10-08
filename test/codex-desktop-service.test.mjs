import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {CodexDesktopService} from '../src/codex-desktop-service.mjs';

function setup(t,send=async()=>({success:true})) {
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'codex-only-test-'));
 t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const root=path.join(dir,'allowed');fs.mkdirSync(root);
 const calls=[];
 const relay={requestDesktop:async(op,args)=>{calls.push(op);if(op==='read_thread')return {result:{thread:{id:args.threadId,hostId:'local',cwd:args.threadId==='outside'?dir:root}}};return {result:await send(op,args)};}};
 return {calls,root,dir,service:new CodexDesktopService({relay,roots:[root],receiptDir:path.join(dir,'receipts')})};
}
test('out-of-scope thread cannot receive a prompt',async t=>{
 const {service,calls}=setup(t);
 await assert.rejects(service.send({threadId:'outside',prompt:'must not send',requestId:randomUUID()}),/outside/);
 assert.equal(calls.includes('send_message_to_thread'),false);
});
test('successful sends are dispatched once across service restarts',async t=>{
 const {service,calls,root,dir}=setup(t);const args={threadId:'inside',prompt:'one',requestId:randomUUID()};
 await service.send(args);
 const restarted=new CodexDesktopService({relay:service.relay,roots:[root],receiptDir:path.join(dir,'receipts')});
 assert.equal((await restarted.send(args)).replayed,true);
 assert.equal(calls.filter(x=>x==='send_message_to_thread').length,1);
 await assert.rejects(restarted.send({...args,prompt:'changed'}),/different arguments/);
});
test('uncertain sends are never resent',async t=>{
 const {service,calls}=setup(t,async()=>{throw Error('lost acknowledgement');});
 const args={threadId:'inside',prompt:'once',requestId:randomUUID()};
 assert.equal((await service.send(args)).deliveryStatus,'unknown');
 assert.equal((await service.send(args)).deliveryStatus,'unknown');
 assert.equal(calls.filter(x=>x==='send_message_to_thread').length,1);
});
test('parallel identical sends only dispatch once',async t=>{
 const {service,calls}=setup(t,async()=>{await new Promise(r=>setTimeout(r,30));return {success:true};});
 const args={threadId:'inside',prompt:'once',requestId:randomUUID()};
 await Promise.all([service.send(args),service.send(args)]);
 assert.equal(calls.filter(x=>x==='send_message_to_thread').length,1);
});
