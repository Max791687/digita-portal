/* Personal overview derived from existing tasks; no separate records or writes. */
function getMyWorkspaceData(items, user, today) {
  const normalize=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  const own=user?items.filter(t=>normalize(t.assignedTo)===normalize(user.displayName)):[];
  const stage=t=>getProductionStage(t);
  const validDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(String(value||''));
  const active=own.filter(t=>stage(t)!=='approved');
  const dueToday=active.filter(t=>t.dueDate===today);
  const overdue=active.filter(t=>validDate(t.dueDate)&&t.dueDate<today);
  const revisions=own.filter(t=>stage(t)==='revision');
  const review=own.filter(t=>stage(t)==='review');
  const inProgress=own.filter(t=>t.status==='in_progress'&&['script','shoot','production'].includes(stage(t)));
  const approved=own.filter(t=>stage(t)==='approved').sort((a,b)=>String(b.approvalAt||'').localeCompare(String(a.approvalAt||'')));
  const priorities=active.filter(t=>stage(t)!=='review').sort((a,b)=>{
    const rank=t=>stage(t)==='revision'?0:validDate(t.dueDate)&&t.dueDate<today?1:t.dueDate===today?2:3;
    return rank(a)-rank(b)||String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'));
  });
  return {own,active,dueToday,overdue,revisions,review,inProgress,approved,priorities};
}
(function(){
  const $=id=>document.getElementById(id);
  const inactive='px-4 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#1f293d] flex items-center gap-2 transition';
  const active=inactive+' bg-orange-500/10 border-orange-500/30 text-orange-300';
  const button='px-3 py-2 rounded-xl border border-[#29364d] bg-[#1f293d] text-xs font-bold text-slate-100 hover:brightness-125';
  const tab=document.createElement('button');tab.id='tabMyWorkspaceBtn';tab.className=inactive;tab.textContent='☀ My Workspace';$('tabReviewBtn').after(tab);
  const root=document.createElement('section');root.id='myWorkspaceView';root.className='hidden';$('productionPipelineView').after(root);
  let account='';
  const panel=(title,id)=>`<section class="rounded-2xl border border-[#29364d] bg-[#111827] p-4 min-w-0"><h3 class="font-bold text-base mb-3">${title}</h3><div id="${id}" class="space-y-3"></div></section>`;
  root.innerHTML=`<div class="flex flex-wrap items-start justify-between gap-4 mb-5"><div><h2 class="text-2xl font-black">My Workspace</h2><p class="text-sm text-slate-400 mt-1">Your work, deadlines and feedback in one place.</p><p id="mwGreeting" class="text-sm font-semibold text-orange-300 mt-3"></p></div><div class="flex flex-wrap gap-2"><button id="mwWriter" class="${button}">✍ Open Writer Studio</button><button id="mwPipeline" class="${button}">View My Pipeline</button><button id="mwReport" class="${button}">↓ Download Work Report</button></div></div><p id="mwConnection" class="text-xs text-amber-300 mb-4" role="status"></p><div id="mwStats" class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5"></div><div class="grid xl:grid-cols-3 gap-4"><div class="xl:col-span-2 space-y-4">${panel('☀ Today’s Priorities','mwPriorities')}<section class="rounded-2xl border border-[#29364d] bg-[#111827] p-4"><div class="flex flex-wrap justify-between gap-3 mb-3"><h3 class="font-bold text-base">My Tasks</h3><label class="text-xs text-slate-400">Show <select id="mwTaskFilter" class="ml-1 rounded-lg border border-[#29364d] bg-[#0c1220] p-2 text-slate-200"><option value="active">Active work</option><option value="all">All my work</option><option value="overdue">Overdue</option><option value="approved">Approved</option></select></label></div><div id="mwTasks" class="space-y-3"></div></section></div><div class="space-y-4">${panel('↻ Needs Your Changes','mwRevisions')}${panel('◷ Awaiting Approval','mwReview')}${panel('✓ Recently Approved','mwApproved')}</div></div>`;
  function hide(){root.classList.add('hidden');tab.className=inactive;}
  function reveal(){
    ['tasksViewContainer','shootsViewContainer','contentCalendarViewContainer','writerStudio','productionPipelineView','smartDashboard','shootsTopAction'].forEach(id=>$(id)?.classList.add('hidden'));
    ['tabTasksBtn','tabShootsBtn','tabCalendarBtn','tabWritersBtn','tabPipelineBtn','tabReviewBtn'].forEach(id=>{if($(id))$(id).className=inactive;});
    root.classList.remove('hidden');tab.className=active;
  }
  function empty(box,text){const p=document.createElement('p');p.className='text-xs text-slate-500 py-4';p.textContent=text;box.append(p);}
  function label(t){return PRODUCTION_PIPELINE_STAGES.find(([id])=>id===getProductionStage(t))?.[1]||'Pending';}
  function open(t){
    if(t.category==='SCRIPT WRITING'&&(isAdmin()||['shweta','vanita'].includes(currentUser?.memberId))&&typeof window.openWriterScript==='function')window.openWriterScript(String(t.id));
    else window.openProductionTask(String(t.id));
  }
  function taskCard(t,kind='normal'){
    const box=document.createElement('article');box.className='rounded-xl border border-[#29364d] bg-[#0c1220] p-3';
    const top=document.createElement('div');top.className='flex justify-between items-start gap-3';
    const title=document.createElement('h4');title.className='font-bold text-sm break-words';title.textContent=t.title||'Untitled task';
    const stage=document.createElement('span');stage.className='text-[10px] font-semibold px-2 py-1 rounded-lg shrink-0 '+(getProductionStage(t)==='approved'?'text-emerald-300 bg-emerald-500/10':getProductionStage(t)==='revision'?'text-rose-300 bg-rose-500/10':'text-teal-300 bg-teal-500/10');stage.textContent=label(t);top.append(title,stage);box.append(top);
    const meta=document.createElement('p');meta.className='text-xs text-slate-400 mt-2';meta.textContent=(t.category||'Content')+' · Due: '+(t.dueDate||'Not set');box.append(meta);
    if(kind==='revision') {const note=document.createElement('p');note.className='text-xs text-amber-300 whitespace-pre-wrap mt-2';note.textContent=t.revisionNotes||t.scriptFeedback||'Open the task to check revision details.';box.append(note);}
    if(kind==='review'||kind==='approved'){const p=document.createElement('p');p.className='text-xs text-slate-500 mt-2';const stamp=kind==='review'?t.reviewSubmittedAt:t.approvalAt;const d=new Date(stamp);p.textContent=stamp&&!Number.isNaN(d.getTime())?(kind==='review'?'Submitted: ':'Approved: ')+d.toLocaleString('en-IN'):(kind==='review'?'Waiting for admin review':'Approved');box.append(p);}
    const bottom=document.createElement('div');bottom.className='flex flex-wrap items-center justify-between gap-2 mt-3';
    const raw=t.progress,progress=raw!==undefined&&Number.isFinite(Number(raw))?Math.max(0,Math.min(100,Number(raw))):null;
    if(progress!==null){const progressWrap=document.createElement('div');progressWrap.className='flex items-center gap-2';const bar=document.createElement('progress');bar.max=100;bar.value=progress;bar.setAttribute('aria-label','Task progress');bar.className='w-24 h-2 accent-teal-400';const value=document.createElement('span');value.className='text-xs text-slate-400';value.textContent=progress+'%';progressWrap.append(bar,value);bottom.append(progressWrap);}
    const action=document.createElement('button');action.className=button;action.textContent=kind==='revision'?'Review Feedback':kind==='review'||kind==='approved'?'Open':'Continue';action.onclick=()=>open(t);bottom.append(action);box.append(bottom);return box;
  }
  function list(id,items,emptyText,kind,limit=Infinity){const box=$(id);box.replaceChildren();items.slice(0,limit).forEach(t=>box.append(taskCard(t,kind)));if(!items.length)empty(box,emptyText);if(items.length>limit){const p=document.createElement('p');p.className='text-xs text-slate-400';p.textContent='Showing '+limit+' of '+items.length+'. See My Tasks for the full list.';box.append(p);}}
  window.renderMyWorkspace=function(){
    if(!currentUser){hide();return;}
    const key=currentUser.memberId+':'+currentUser.role;
    if(account!==key){account=key;$('mwTaskFilter').value='active';reveal();}
    $('mwGreeting').textContent='Hello, '+currentUser.displayName+' · '+new Date().toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    $('mwWriter').classList.toggle('hidden',!isAdmin()&&!['shweta','vanita'].includes(currentUser.memberId));
    $('mwConnection').textContent=cloudReady?'Your assigned work only · Updates with team sync':'Connecting to the team workspace…';
    $('mwReport').disabled=!cloudReady;
    const data=getMyWorkspaceData(cloudReady?tasks:[],currentUser,getDashboardLocalDate());
    $('mwStats').replaceChildren();
    [['Due Today',data.dueToday.length,'orange'],['In Progress',data.inProgress.length,'teal'],['Changes Requested',data.revisions.length,'rose'],['Awaiting Review',data.review.length,'amber']].forEach(([text,n,tone])=>{const box=document.createElement('div');box.className='rounded-2xl border border-[#29364d] bg-[#111827] p-4';const title=document.createElement('p');title.className='text-xs text-slate-400';title.textContent=text;const count=document.createElement('strong');count.className='text-3xl block mt-2 text-'+tone+'-300';count.textContent=cloudReady?n:'—';box.append(title,count);$('mwStats').append(box);});
    list('mwPriorities',data.priorities,'No actionable tasks right now. Assigned tasks will appear here.','normal',5);
    let shown=$('mwTaskFilter').value==='all'?data.own:$('mwTaskFilter').value==='overdue'?data.overdue:$('mwTaskFilter').value==='approved'?data.approved:data.active;
    list('mwTasks',shown,'No tasks for this filter.');
    list('mwRevisions',data.revisions,'No changes requested.','revision',3);
    list('mwReview',data.review,'No work awaiting review.','review',3);
    list('mwApproved',data.approved,'No approved work yet.','approved',3);
  };
  tab.onclick=()=>{if(currentUser){reveal();renderMyWorkspace();}};
  $('mwTaskFilter').onchange=()=>renderMyWorkspace();
  $('mwWriter').onclick=()=>$('tabWritersBtn').click();
  $('mwPipeline').onclick=()=>{$('tabPipelineBtn').click();$('ppMember').value=currentUser.displayName;$('ppSearch').value='';renderProductionPipeline();};
  $('mwReport').onclick=()=>{
    if(!currentUser||!cloudReady)return;
    const d=getMyWorkspaceData(tasks,currentUser,getDashboardLocalDate());
    const text=['MY WORKSPACE — CURRENT WORK REPORT',currentUser.displayName,new Date().toLocaleString('en-IN'),'Total tasks: '+d.own.length,'Due today: '+d.dueToday.length,'Overdue: '+d.overdue.length,'Changes requested: '+d.revisions.length,'Awaiting review: '+d.review.length,'Approved: '+d.approved.length,'',...d.own.map(t=>(t.title||'Untitled')+' | '+label(t)+' | Due: '+(t.dueDate||'Not set'))].join('\n');
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));a.href=url;a.download='my-work-report-'+getDashboardLocalDate()+'.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  ['switchMainTab','openContentCalendar'].forEach(name=>{const previous=window[name];window[name]=function(...args){hide();return previous.apply(this,args);};});
  ['tabWritersBtn','tabPipelineBtn','tabReviewBtn'].forEach(id=>$(id).addEventListener('click',hide));
  const logout=window.logoutUser;window.logoutUser=function(...args){const result=logout.apply(this,args);if(!currentUser){account='';hide();['mwTasks','mwPriorities','mwRevisions','mwReview','mwApproved','mwStats'].forEach(id=>$(id).replaceChildren());}return result;};
})();
