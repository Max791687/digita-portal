const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname+'/../production-pipeline.js','utf8').split('(function () {')[0],ctx);
vm.runInContext(fs.readFileSync(__dirname+'/../my-workspace.js','utf8').split('(function(){')[0],ctx);
const rows=[
{id:'today',assignedTo:' PAVAN ',dueDate:'2026-11-05',status:'in_progress',category:'REEL / SHORT'},
{id:'late',assignedTo:'Pavan',dueDate:'2026-11-01',status:'pending'},
{id:'revision',assignedTo:'Pavan',dueDate:'2026-11-07',status:'changes_required'},
{id:'waiting',assignedTo:'Pavan',dueDate:'2026-11-05',status:'completed'},
{id:'approved',assignedTo:'Pavan',dueDate:'2026-11-01',status:'completed',pipelineStage:'approved',approvalAt:'2026-11-05T10:00:00Z'},
{id:'other',assignedTo:'Test',dueDate:'2026-11-05',status:'in_progress'},
{id:'no-date',assignedTo:'Pavan',status:'pending'},
{id:'writer',assignedTo:'Shweta',scriptReview:'submitted',category:'SCRIPT WRITING',status:'in_progress'}
];
const before=JSON.stringify(rows),user={memberId:'pavan',displayName:'Pavan',role:'admin'};
const d=ctx.getMyWorkspaceData(rows,user,'2026-11-05');
assert.equal(d.own.length,6);assert.equal(d.dueToday.length,2);assert.equal(d.overdue.length,1);assert.equal(d.inProgress.length,1);assert.equal(d.revisions.length,1);assert.equal(d.review.length,1);assert.equal(d.approved.length,1);
assert.equal(d.priorities[0].id,'revision');assert.equal(d.priorities[1].id,'late');assert(!d.priorities.some(t=>['approved','waiting','other'].includes(t.id)));
const member=ctx.getMyWorkspaceData(rows,{displayName:'Test',role:'member'},'2026-11-05');assert.equal(member.own.length,1);assert.equal(member.own[0].id,'other');
const writer=ctx.getMyWorkspaceData(rows,{displayName:'shweta'},'2026-11-05');assert.equal(writer.review.length,1);
assert.equal(ctx.getMyWorkspaceData(rows,{displayName:'Vanita'},'2026-11-05').own.length,0);assert.equal(ctx.getMyWorkspaceData(rows,null,'2026-11-05').own.length,0);
assert.equal(JSON.stringify(rows),before);
for(const m of fs.readFileSync(__dirname+'/../index.html','utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
console.log('Personal account isolation, counts, stage semantics, priority order, empty states and source preservation passed');
