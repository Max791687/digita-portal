const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const src=fs.readFileSync(__dirname+'/../worker.js','utf8').split('export default')[0];
const ctx=vm.createContext({}); vm.runInContext(src,ctx);
const check=(old,next,user={memberId:'shweta',displayName:'Shweta'})=>ctx.isMemberTaskUpdateAllowed([old],[next],user);
const old={id:'task_1',category:'SCRIPT WRITING',assignedTo:'Shweta',title:'Reel',scriptText:'Original',status:'pending',outputLink:''};
assert(check(old,{...old,scriptText:'नमस्ते new draft',scriptReview:'draft',status:'in_progress'}));
assert(check(old,{...old,scriptText:'Review me',scriptReview:'submitted'}));
assert(!check(old,{...old,scriptText:' ',scriptReview:'submitted'}));
assert(!check(old,{...old,scriptReview:'approved'}));
assert(!check(old,{...old,scriptFeedback:'spoofed'}));
assert(!check(old,{...old,writerBrief:'changed brief'}));
assert(!check(old,{...old,scriptText:'changed',scriptReview:'draft'},{memberId:'vanita',displayName:'Vanita'}));
assert(!check({...old,category:'REEL / SHORT'},{...old,category:'REEL / SHORT',scriptText:'changed',scriptReview:'draft'}));
assert(!check(old,{...old,scriptText:'x'.repeat(20001),scriptReview:'draft'}));
assert(!check(old,{...old,assignedTo:'Vanita',scriptReview:'draft'}));
assert(check(old,{...old,status:'in_progress',progress:50}));
assert(!ctx.isMemberTaskUpdateAllowed([old],[],{memberId:'shweta',displayName:'Shweta'}));
assert(!check({...old,scriptReview:'approved'},{...old,scriptReview:'approved',scriptText:'silently changed'}));
for (const m of fs.readFileSync(__dirname+'/../index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) new vm.Script(m[1]);
console.log('13 permission checks and inline JavaScript syntax passed');

{
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(__dirname+'/../worker.js','utf8').split('export default')[0],c);
const w={version:1,brief:Object.fromEntries(['brand','topic','audience','language','duration','keyPoints','cta'].map(k=>[k,''])),scenes:[{voiceover:'नमस्ते',visual:'Product shot',screen:'Hello'}],researchNotes:'https://example.org',wpm:140};
assert(c.validScriptWorkspace(w));assert(c.validScriptWorkspace(undefined));
for(const bad of [{...w,wpm:0},{...w,wpm:140.5},{...w,researchNotes:'x'.repeat(10001)},{...w,scenes:Array(41).fill(w.scenes[0])},{...w,scenes:[{...w.scenes[0],screen:'x'.repeat(2001)}]},{...w,brief:null},{...w,role:'admin'}])assert(!c.validScriptWorkspace(bad));
const old={id:'task_1',category:'SCRIPT WRITING',assignedTo:'Shweta',scriptText:'Hello',status:'pending'},user={memberId:'shweta',displayName:'Shweta'};
assert(c.isMemberTaskUpdateAllowed([old],[{...old,scriptReview:'draft',scriptWorkspace:w}],user));
assert(!c.isMemberTaskUpdateAllowed([old],[{...old,scriptReview:'draft',scriptWorkspace:w}],{memberId:'vanita',displayName:'Vanita'}));
assert(!c.isMemberTaskUpdateAllowed([{...old,scriptReview:'approved'}],[{...old,scriptReview:'approved',scriptWorkspace:w}],user));
console.log('12 structured workspace validation and ownership checks passed');

}
