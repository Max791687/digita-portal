const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const c=vm.createContext({Response,TextEncoder,setTimeout,clearTimeout});
vm.runInContext(fs.readFileSync(__dirname+'/../worker.js','utf8').split('export default')[0],c);
const valid={action:'draft',language:'Hindi',text:'Write a product reel'};
assert(c.validateWriterAI(valid));
for(const b of [null,[],{...valid,text:''},{...valid,text:'x'.repeat(6001)},{...valid,action:'__proto__'},{...valid,action:'delete'},{...valid,language:'unsupported'}])assert(!c.validateWriterAI(b));
const user={memberId:'shweta',displayName:'Shweta',role:'member'},origin='https://digital-portal-staging.pages.dev';
function req(body=valid){return new Request('https://example.test/ai/writer',{method:'POST',body:JSON.stringify(body)});}
const counters=new Map();let calls=0;
const db={prepare(sql){assert(sql.includes('ON CONFLICT(id)'));return {bind(...args){return {async first(){const [key,data,,now,,limit,before]=args;const old=counters.get(key);if(old&&(old.count>=limit||old.lastAt>before))return null;const next=old?{count:old.count+1,lastAt:now}:JSON.parse(data);counters.set(key,next);return {data:JSON.stringify(next)};}};}};}};
const env={DB:db,AI:{async run(model,input){calls++;assert.equal(model,'@cf/meta/llama-3.1-8b-instruct-fp8');assert.equal(input.max_tokens,700);return {response:'A sample suggestion'};}}};
(async()=>{
assert.equal((await c.handleWriterAI(req(),env,{memberId:'vijay',role:'member'},origin)).status,403);
assert.equal((await c.handleWriterAI(req(),{DB:db},user,origin)).status,503);
assert.equal((await c.handleWriterAI(req({...valid,text:''}),env,user,origin)).status,400);
assert.equal(calls,0);
const result=await c.handleWriterAI(req(),env,user,origin),payload=await result.json();assert.equal(result.status,200);assert.equal(payload.suggestion,'A sample suggestion');assert.equal(payload.remaining,9);assert.equal(calls,1);
assert.equal((await c.handleWriterAI(req(),env,user,origin)).status,429);assert.equal(calls,1);
const fail={...env,AI:{async run(){throw new Error('sensitive provider details');}}};
const failed=await c.handleWriterAI(req(),fail,{memberId:'vanita',role:'member'},origin);assert.equal(failed.status,503);assert(!(await failed.text()).includes('sensitive provider details'));
assert([...counters.keys()].every(k=>k.startsWith('writer_ai_usage:')&&k!=='workspace'));
console.log('AI validation, access, binding errors, cooldown, success and provider failure tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
