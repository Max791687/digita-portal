/* Production stages are additional task fields, synced with the existing workspace. */
const PRODUCTION_PIPELINE_STAGES = [
  ['script','Script','✍'],['shoot','Shoot','🎬'],['production','Editing / Design','🎨'],
  ['review','Review','👁'],['revision','Revision','↻'],['approved','Approved','✓']
];
function productionWorkStage(task) {
  return task.category === 'SCRIPT WRITING' ? 'script' : /shoot/i.test(task.category || '') ? 'shoot' : 'production';
}
function getProductionStage(task) {
  if (task.status === 'changes_required') return 'revision';
  if (PRODUCTION_PIPELINE_STAGES.some(([id])=>id===task.pipelineStage)) return task.pipelineStage;
  if (task.category === 'SCRIPT WRITING') {
    if (task.scriptReview === 'approved') return 'approved';
    if (task.scriptReview === 'changes_required') return 'revision';
    if (task.scriptReview === 'submitted') return 'review';
  }
  // Historical "completed" tasks are ready for review, not automatically admin-approved.
  if (task.status === 'completed') return 'review';
  return productionWorkStage(task);
}
function productionSafeLink(value) {
  try { const u=new URL(String(value||'')); return ['https:','http:'].includes(u.protocol)?u.href:''; } catch (_) { return ''; }
}
function productionReviewReady(task) {
  return task.category === 'SCRIPT WRITING' ? !!String(task.scriptText||'').trim() : !!productionSafeLink(task.outputLink);
}
function syncWriterProductionReview(task, review) {
  task.pipelineStage = ({draft:'script',submitted:'review',changes_required:'revision',approved:'approved'})[review] || 'script';
  if (review === 'submitted') task.reviewSubmittedAt=new Date().toISOString();
  if (isAdmin() && review === 'approved') {task.approvalAt=new Date().toISOString();task.approvalBy=currentUser.displayName;}
  if (isAdmin() && review === 'changes_required') {
    task.revisionNotes=task.scriptFeedback || '';task.revisionBy=currentUser.displayName;task.revisionAt=new Date().toISOString();
  }
}
function syncProductionOutputChange(task) {
  if (['review','approved'].includes(getProductionStage(task))) {
    task.pipelineStage=productionWorkStage(task);task.status='in_progress';
    if(task.category==='SCRIPT WRITING'&&(isAdmin()||['shweta','vanita'].includes(currentUser?.memberId)))task.scriptReview='draft';
  }
}
function syncTaskProductionStatus(task, status) {
  const stage=getProductionStage(task);
  if (status === 'completed' && stage !== 'approved' && productionReviewReady(task)) {
    task.pipelineStage='review';task.reviewSubmittedAt=new Date().toISOString();
    if(task.category==='SCRIPT WRITING'&&(isAdmin()||['shweta','vanita'].includes(currentUser?.memberId)))task.scriptReview='submitted';
  } else if (['pending','in_progress'].includes(status) && ['review','revision','approved'].includes(stage)) {
    task.pipelineStage=productionWorkStage(task);
    if(task.category==='SCRIPT WRITING'&&(isAdmin()||['shweta','vanita'].includes(currentUser?.memberId)))task.scriptReview='draft';
  }
}
(function () {
  const $=id=>document.getElementById(id);
  const inactive='px-4 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#1f293d] flex items-center gap-2 transition';
  const active='px-4 py-2 rounded-xl font-bold text-xs sm:text-sm bg-teal-500/10 border border-teal-500/30 text-teal-300 flex items-center gap-2 transition';
  const input='w-full mt-1 rounded-xl border border-[#29364d] bg-[#0c1220] p-3 text-white';
  const button='rounded-xl border border-[#29364d] bg-[#1f293d] px-3 py-2 text-xs font-bold text-slate-100 hover:brightness-125';
  const team=['Pavan','Vijay','Tushar','Mirtunjay','Shweta','Vanita','Manoj','Ashish','Test'];
  const root=document.createElement('section');root.id='productionPipelineView';root.className='hidden';
  $('writerStudio').after(root);
  let mode='pipeline',reviewFilter='review',opened=null,baseline='',dirty=false,saving=false,filterOwner='';
  let sessionKey='';
  const tabPipeline=document.createElement('button');tabPipeline.id='tabPipelineBtn';tabPipeline.className=inactive;tabPipeline.textContent='🎬 Production Pipeline';
  const tabReview=document.createElement('button');tabReview.id='tabReviewBtn';tabReview.className=inactive;tabReview.textContent='👁 Review Board';
  $('tabWritersBtn').after(tabPipeline,tabReview);
  root.innerHTML=`<div class="rounded-2xl border border-[#29364d] bg-[#111827] p-4 sm:p-5"><div class="flex flex-wrap justify-between gap-3"><div><p class="text-xs uppercase tracking-widest text-teal-300">Team production</p><h2 id="ppHeading" class="text-2xl font-bold mt-1"></h2><p id="ppDescription" class="text-sm text-slate-400 mt-2"></p></div><button id="ppNewTask" class="${button} self-start">+ Content task</button></div><div class="grid sm:grid-cols-2 gap-3 my-5"><label class="text-xs">Search title / category<input id="ppSearch" type="search" class="${input}" placeholder="Find work…"></label><label class="text-xs">Assigned team member<select id="ppMember" class="${input}"><option value="all">All team</option>${team.map(n=>'<option>'+n+'</option>').join('')}</select></label></div><div id="ppStats" class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4"></div><div id="ppReviewFilters" class="flex flex-wrap gap-2 mb-4"></div><p id="ppResults" class="text-xs text-slate-400 mb-3" role="status"></p><div id="ppBoard"></div></div>`;
  const modal=document.createElement('div');modal.id='productionReviewModal';modal.className='hidden fixed inset-0 z-[96] bg-black/80 backdrop-blur-sm p-4 overflow-y-auto';
  modal.innerHTML=`<div class="max-w-4xl mx-auto my-4 rounded-2xl border border-[#29364d] bg-[#111827] p-5"><div class="flex justify-between items-start gap-3"><h2 id="ppTitle" class="text-xl font-bold"></h2><button id="ppClose" class="${button}" aria-label="Close production review">✕</button></div><p id="ppMeta" class="text-xs text-slate-400 mt-2"></p><div id="ppReferenceLinks" class="flex flex-wrap gap-2 my-4"></div><details id="ppScriptDetails" class="rounded-xl border border-[#29364d] p-3 my-4"><summary class="font-bold cursor-pointer">Read script & scene breakdown</summary><pre id="ppScript" class="whitespace-pre-wrap break-words text-sm font-sans text-slate-300 mt-3 max-h-96 overflow-y-auto"></pre></details><div class="grid sm:grid-cols-2 gap-3 my-4"><label class="text-xs">Output / review link<input id="ppOutput" type="url" maxlength="2048" class="${input}" placeholder="https://…"></label><label class="text-xs">Working stage<select id="ppStage" class="${input}"></select></label></div><p id="ppLatestFeedback" class="whitespace-pre-wrap text-sm text-amber-300 my-4"></p><label id="ppFeedbackWrap" class="block text-xs my-4">Admin feedback / revision notes<textarea id="ppFeedback" maxlength="3000" rows="4" class="${input}" placeholder="Add clear feedback; include timestamps for video revisions…"></textarea></label><p id="ppApproval" class="text-xs text-emerald-300 my-3"></p><div class="flex flex-wrap gap-2"><button id="ppSave" class="${button}">Save stage / link</button><button id="ppSubmit" class="${button} bg-teal-700">Submit for review</button><button id="ppApprove" class="${button} bg-emerald-700">Approve</button><button id="ppRevise" class="${button} bg-amber-700">Request revision</button><button id="ppEditTask" class="${button}">Edit task / reassign</button></div><p id="ppMessage" class="text-sm text-amber-300 mt-4" role="status"></p></div>`;
  document.body.append(modal);
  const label=stage=>PRODUCTION_PIPELINE_STAGES.find(([id])=>id===stage)?.[1]||stage;
  const canChange=t=>isAdmin()||isOwnTask(t);
  const canWriteScript=t=>t.category==='SCRIPT WRITING'&&(isAdmin()||['shweta','vanita'].includes(currentUser?.memberId));
  const draftKey=()=> 'dd_production_review_v1:'+(currentUser?.memberId||'')+':'+opened;
  function date(value) {const d=new Date(value);return value&&!Number.isNaN(d.getTime())?d.toLocaleString('en-IN'):'';}
  function notify(text){$('ppMessage').textContent=text;}
  function remember() {
    dirty=true;
    try {localStorage.setItem(draftKey(),JSON.stringify({output:$('ppOutput').value,stage:$('ppStage').value,feedback:isAdmin()?$('ppFeedback').value:''}));}
    catch (_){notify('Browser draft storage unavailable. Copy unsaved notes before leaving.');}
  }
  ['ppOutput','ppStage','ppFeedback'].forEach(id=>$(id).oninput=remember);
  function close() {
    if(saving)return false;
    if(dirty&&!confirm('Close with unsaved stage/link or feedback? Browser draft is kept when storage is available.'))return false;
    modal.classList.add('hidden');opened=null;dirty=false;return true;
  }
  $('ppClose').onclick=close;
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  function addLink(container,title,value) {
    const url=productionSafeLink(value);if(!url)return;
    const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.className=button;a.textContent=title;container.append(a);
  }
  function openTask(id) {
    const t=tasks.find(t=>String(t.id)===id);if(!t||!currentUser)return;
    opened=id;baseline=JSON.stringify(t);dirty=false;
    $('ppTitle').textContent=t.title||'Untitled task';
    $('ppMeta').textContent=(t.assignedTo||'Unassigned')+' · '+(t.category||'Content')+' · '+label(getProductionStage(t))+' · Due: '+(t.dueDate||'Not set');
    $('ppReferenceLinks').replaceChildren();
    addLink($('ppReferenceLinks'),'Open current output',t.outputLink);
    addLink($('ppReferenceLinks'),'Reference document',t.docLink);
    addLink($('ppReferenceLinks'),'Footage',t.footageLink);
    const scenes=Array.isArray(t.scriptWorkspace?.scenes)?t.scriptWorkspace.scenes:[];
    $('ppScript').textContent=(t.scriptText||'No script attached.')+(scenes.length?'\n\nSCENE BREAKDOWN\n'+scenes.map((s,i)=>'Scene '+(i+1)+'\nVoiceover: '+(s.voiceover||'')+'\nVisual / B-roll: '+(s.visual||'')+'\nOn-screen text: '+(s.screen||'')).join('\n\n'):'');
    $('ppScriptDetails').open=t.category==='SCRIPT WRITING';
    $('ppOutput').value=t.outputLink||'';$('ppOutput').disabled=!canChange(t);
    $('ppStage').replaceChildren();
    PRODUCTION_PIPELINE_STAGES.filter(([id])=>['script','shoot','production','review'].includes(id)).forEach(([id,text])=>{const option=document.createElement('option');option.value=id;option.textContent=text;$('ppStage').append(option);});
    const current=getProductionStage(t);
    if(['revision','approved'].includes(current)){const o=document.createElement('option');o.value=current;o.textContent=label(current);$('ppStage').append(o);}
    $('ppStage').value=current;$('ppStage').disabled=!canChange(t);
    $('ppFeedback').value=t.revisionNotes||t.scriptFeedback||'';
    $('ppLatestFeedback').textContent=(t.revisionNotes||t.scriptFeedback)?'Latest feedback'+(t.revisionBy?' from '+t.revisionBy:'')+':\n'+(t.revisionNotes||t.scriptFeedback):'No revision feedback yet.';
    $('ppFeedbackWrap').classList.toggle('hidden',!isAdmin());
    $('ppApproval').textContent=current==='approved'?'Approved'+(t.approvalBy?' by '+t.approvalBy:'')+(t.approvalAt?' · '+date(t.approvalAt):''):t.reviewSubmittedAt?'Submitted for review · '+date(t.reviewSubmittedAt):'';
    ['ppSave','ppSubmit'].forEach(id=>$(id).classList.toggle('hidden',!canChange(t)));
    ['ppApprove','ppRevise','ppEditTask'].forEach(id=>$(id).classList.toggle('hidden',!isAdmin()));
    $('ppApprove').disabled=current!=='review';$('ppRevise').disabled=!['review','approved'].includes(current);
    notify('');
    try {
      const draft=JSON.parse(localStorage.getItem(draftKey()));
      if(draft&&canChange(t)&&confirm('Recover your unsaved stage/link and feedback draft for this task?')){
        $('ppOutput').value=String(draft.output||'');if(Array.from($('ppStage').options).some(o=>o.value===draft.stage))$('ppStage').value=draft.stage;
        if(isAdmin())$('ppFeedback').value=String(draft.feedback||'');dirty=true;notify('Recovered browser draft. Check the current task before saving.');
      }
    }catch(_){}
    modal.classList.remove('hidden');
  }
  window.openProductionTask = id => openTask(String(id));
  async function save(action) {
    if(saving||!opened)return;
    const t=tasks.find(t=>String(t.id)===opened);
    if(!t||!canChange(t))return notify('Only the assigned member or admin may update this task.');
    if(['approve','revise'].includes(action)&&!isAdmin())return;
    if(JSON.stringify(t)!==baseline)return notify('This task changed while open. Copy your notes, then close and reopen to review the latest version.');
    if(!cloudReady||cloudConflict||isCloudUpdating||isCloudPulling||cloudSavePending)return notify('Wait for cloud sync to finish. Resolve any sync conflict before saving.');
    const link=$('ppOutput').value.trim(),feedback=$('ppFeedback').value.trim();
    if(link&&!productionSafeLink(link))return notify('Use a complete http:// or https:// output link.');
    let stage=action==='submit'?'review':action==='approve'?'approved':action==='revise'?'revision':$('ppStage').value;
    if(action==='approve'&&getProductionStage(t)!=='review')return notify('Submit the work for review before approving it.');
    if(action==='revise'&&!['review','approved'].includes(getProductionStage(t)))return notify('Only submitted or approved work can be sent back for revision.');
    if(stage==='revision'&&getProductionStage(t)!=='revision'&&(!isAdmin()||!feedback))return notify('Admin must provide revision feedback.');
    if(action==='revise'&&!feedback)return notify('Write clear revision feedback first.');
    if(action==='save'&&stage==='approved'&&link!==(t.outputLink||''))return notify('Move approved work back to Editing / Design or Script before changing its output.');
    const candidate={...t,outputLink:link};
    if(['review','approved'].includes(stage)&&!productionReviewReady(candidate))return notify(t.category==='SCRIPT WRITING'?'Write and save the script in Writer Studio before submitting.':'Add the output / review link before submitting or approving.');
    if(!isAdmin()&&stage==='approved'&&getProductionStage(t)!=='approved')return;
    const patch={outputLink:link,pipelineStage:stage};
    const now=new Date().toISOString();
    if(stage==='review'&&getProductionStage(t)!=='review'||action==='submit'){patch.reviewSubmittedAt=now;patch.status='in_progress';if(canWriteScript(t))patch.scriptReview='submitted';}
    if(['script','shoot','production'].includes(stage)) {patch.status='in_progress';if(canWriteScript(t))patch.scriptReview='draft';}
    if(action==='approve') {patch.status='completed';patch.progress=100;patch.approvalBy=currentUser.displayName;patch.approvalAt=now;if(t.category==='SCRIPT WRITING')patch.scriptReview='approved';}
    if(action==='revise') {patch.status='changes_required';patch.revisionNotes=feedback;patch.revisionBy=currentUser.displayName;patch.revisionAt=now;if(t.category==='SCRIPT WRITING'){patch.scriptReview='changes_required';patch.scriptFeedback=feedback;}}
    // Saving optional feedback never grants approval or changes revision status.
    if(isAdmin()&&action==='save'&&feedback!==(t.revisionNotes||t.scriptFeedback||'')){patch.revisionNotes=feedback;patch.revisionBy=currentUser.displayName;patch.revisionAt=now;if(t.category==='SCRIPT WRITING')patch.scriptFeedback=feedback;}
    remember();saving=true;const owner=currentUser.memberId;
    ['ppSave','ppSubmit','ppApprove','ppRevise'].forEach(id=>$(id).disabled=true);
    ['ppOutput','ppStage','ppFeedback'].forEach(id=>$(id).disabled=true);
    Object.assign(t,patch);
    if(isAdmin()) recordActivity(action==='approve'?'Task approved':action==='revise'?'Task revision requested':'Task production updated',(t.title||'Task')+' → '+label(stage)+' · '+(t.assignedTo||'Unassigned'));
    try {
      const ok=await pushToCloud();
      if(currentUser?.memberId!==owner)return;
      renderAll();baseline=JSON.stringify(t);
      if(ok&&!cloudConflict){dirty=false;try{localStorage.removeItem(draftKey());}catch(_){}openTask(String(t.id));notify('Saved to team workspace. '+label(getProductionStage(t))+'.');}
      else notify('Cloud save was not confirmed. Browser draft is kept; check sync status. The updated Worker is required for production-stage saves.');
    } finally {saving=false;$('ppOutput').disabled=!canChange(t);$('ppStage').disabled=!canChange(t);$('ppFeedback').disabled=!isAdmin();['ppSave','ppSubmit'].forEach(id=>$(id).disabled=false);const stageNow=getProductionStage(t);$('ppApprove').disabled=stageNow!=='review';$('ppRevise').disabled=!['review','approved'].includes(stageNow);}
  }
  $('ppSave').onclick=()=>save('save');$('ppSubmit').onclick=()=>save('submit');$('ppApprove').onclick=()=>save('approve');$('ppRevise').onclick=()=>save('revise');
  $('ppEditTask').onclick=()=>{if(!isAdmin()||!opened)return;const id=opened;if(close())editTask(id);};
  $('ppNewTask').onclick=()=>{if(currentUser)openTaskModal();};
  $('ppSearch').oninput=()=>renderProductionPipeline();$('ppMember').onchange=()=>renderProductionPipeline();
  function card(t) {
    const a=document.createElement('article');a.className='rounded-xl border border-[#29364d] bg-[#0c1220] p-3 space-y-2';
    const h=document.createElement('h4');h.className='font-bold text-sm break-words';h.textContent=t.title||'Untitled task';
    const meta=document.createElement('p');meta.className='text-xs text-slate-400';meta.textContent=(t.assignedTo||'Unassigned')+' · '+(t.category||'Content');
    const due=document.createElement('p');due.className='text-xs text-slate-400';due.textContent='Due: '+(t.dueDate||'Not set');
    const today=getDashboardLocalDate();if(t.dueDate&&t.dueDate<today&&getProductionStage(t)!=='approved'){due.className='text-xs text-rose-300';due.textContent+=' · Overdue';}
    const feedback=document.createElement('p');feedback.className='text-xs text-amber-300 break-words';feedback.textContent=(t.revisionNotes||t.scriptFeedback||'').slice(0,180);
    const open=document.createElement('button');open.className=button;open.textContent=isAdmin()?'Open / Review':canChange(t)?'Open / Submit':'View details';open.onclick=()=>openTask(String(t.id));
    a.append(h,meta,due,feedback,open);return a;
  }
  window.renderProductionPipeline=function(){
    if(!currentUser)return;
    const newSession=currentUser.memberId+':'+currentUser.role;
    if(sessionKey!==newSession){sessionKey=newSession;filterOwner='all';$('ppMember').value=team.includes(filterOwner)?filterOwner:'all';$('ppSearch').value='';}
    const query=$('ppSearch').value.trim().toLowerCase(),member=$('ppMember').value;
    const all=tasks.filter(t=>(member==='all'||String(t.assignedTo||'').toLowerCase()===member.toLowerCase())&&(!query||[t.title,t.category,t.assignedTo].join(' ').toLowerCase().includes(query)));
    $('ppHeading').textContent=mode==='pipeline'?'Production Pipeline':'Review Board';
    $('ppDescription').textContent=mode==='pipeline'?'See progress across the whole team from script to approved output. Filter by a member when needed; only the assigned member or Admin can update work.':'Review submitted output and scripts, send clear revisions and approve completed work. Only Admin can approve.';
    $('ppStats').replaceChildren();
    PRODUCTION_PIPELINE_STAGES.forEach(([id,text,icon])=>{const box=document.createElement('div');box.className='rounded-xl border border-[#29364d] bg-[#0c1220] p-3';const name=document.createElement('p');name.className='text-xs text-slate-400';name.textContent=icon+' '+text;const n=document.createElement('strong');n.className='text-xl block mt-1';n.textContent=all.filter(t=>getProductionStage(t)===id).length;box.append(name,n);$('ppStats').append(box);});
    $('ppReviewFilters').replaceChildren();
    if(mode==='review'){
      [['review','Awaiting review'],['revision','Changes requested'],['approved','Approved']].forEach(([id,text])=>{const b=document.createElement('button');b.className=button+(reviewFilter===id?' border-teal-400 text-teal-300':'');b.textContent=text;b.onclick=()=>{reviewFilter=id;renderProductionPipeline();};$('ppReviewFilters').append(b);});
    }
    const board=$('ppBoard');board.replaceChildren();
    if(mode==='pipeline'){
      board.className='grid md:grid-cols-2 xl:grid-cols-3 gap-4';
      PRODUCTION_PIPELINE_STAGES.forEach(([id,text,icon])=>{const column=document.createElement('section');column.className='rounded-2xl border border-[#29364d] p-3 min-w-0';const heading=document.createElement('h3');heading.className='font-bold text-sm text-teal-300 mb-3';const list=all.filter(t=>getProductionStage(t)===id);heading.textContent=icon+' '+text+' ('+list.length+')';column.append(heading);const items=document.createElement('div');items.className='space-y-3';list.forEach(t=>items.append(card(t)));if(!list.length){const empty=document.createElement('p');empty.className='text-xs text-slate-500 py-5';empty.textContent='No work in this stage.';items.append(empty);}column.append(items);board.append(column);});
      $('ppResults').textContent=all.length+' task(s). Historical completed work appears in Review until Admin approves it here.';
    }else{
      board.className='grid md:grid-cols-2 xl:grid-cols-3 gap-3';const list=all.filter(t=>getProductionStage(t)===reviewFilter).sort((a,b)=>String(a.reviewSubmittedAt||'').localeCompare(String(b.reviewSubmittedAt||'')));list.forEach(t=>board.append(card(t)));if(!list.length){const p=document.createElement('p');p.className='text-sm text-slate-400 py-6';p.textContent='No '+label(reviewFilter).toLowerCase()+' tasks for these filters.';board.append(p);}$('ppResults').textContent=list.length+' task(s) · '+label(reviewFilter);
    }
  };
  function hide(){root.classList.add('hidden');tabPipeline.className=inactive;tabReview.className=inactive;}
  function show(next){if(!currentUser)return;mode=next;['tasksViewContainer','shootsViewContainer','contentCalendarViewContainer','writerStudio','smartDashboard','shootsTopAction'].forEach(id=>$(id)?.classList.add('hidden'));['tabTasksBtn','tabShootsBtn','tabCalendarBtn','tabWritersBtn'].forEach(id=>{if($(id))$(id).className=inactive;});root.classList.remove('hidden');tabPipeline.className=mode==='pipeline'?active:inactive;tabReview.className=mode==='review'?active:inactive;renderProductionPipeline();}
  tabPipeline.onclick=()=>show('pipeline');tabReview.onclick=()=>show('review');
  ['switchMainTab','openContentCalendar'].forEach(name=>{const previous=window[name];window[name]=function(...args){hide();return previous.apply(this,args);};});
  // Writer Studio's tab uses a closure; observe its click without replacing its existing handler.
  $('tabWritersBtn').addEventListener('click',hide);
  const logout=window.logoutUser;window.logoutUser=function(...args){const value=logout.apply(this,args);if(!currentUser){hide();modal.classList.add('hidden');opened=null;dirty=false;sessionKey='';}return value;};
})();

