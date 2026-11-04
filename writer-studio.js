/* Writing tasks use the existing workspace, revision checks and backups. */
(function () {
  const btn = document.createElement('button');
  const inactive = document.getElementById('tabCalendarBtn').className;
  btn.id = 'tabWritersBtn'; btn.className = inactive;
  btn.textContent = '✍ Writer Studio'; btn.onclick = openStudio;
  document.getElementById('tabCalendarBtn').after(btn);
  const root = document.createElement('section'); root.id = 'writerStudio'; root.className = 'hidden';
  document.getElementById('contentCalendarViewContainer').after(root);
  const inputClass = 'w-full mt-1 rounded-xl bg-[#0c1220] border border-[#29364d] p-3 text-white';
  const buttonClass = 'rounded-xl px-4 py-2 bg-orange-500 text-white font-bold text-sm';
  const modal = document.createElement('div'); modal.className = 'hidden fixed inset-0 z-[95] bg-black/80 p-4 overflow-y-auto';
  modal.innerHTML = `<div class="max-w-4xl mx-auto my-4 rounded-2xl border border-[#29364d] bg-[#111827] p-5">
    <div class="flex justify-between gap-3"><h2 id="wsTitle" class="text-xl font-bold"></h2><button id="wsClose" aria-label="Close script editor">✕</button></div>
    <p id="wsMeta" class="text-xs text-slate-400 mt-2"></p><p id="wsBrief" class="whitespace-pre-wrap text-sm text-slate-300 my-4"></p>
    <p id="wsExistingFeedback" class="whitespace-pre-wrap text-sm text-amber-300 mb-3"></p>
    <div class="flex flex-wrap gap-2 mb-3"><button id="wsTemplate" class="text-xs rounded-lg bg-[#29364d] px-3 py-2">Insert Hook → Body → CTA template</button><button id="wsRecover" class="text-xs rounded-lg bg-[#29364d] px-3 py-2">Recover browser draft</button></div>
    <label class="block text-sm">Script (Hindi, English or Hinglish)<textarea id="wsText" maxlength="20000" rows="16" class="${inputClass}" placeholder="Write your script here…"></textarea></label>
    <p id="wsCount" class="text-xs text-slate-400 my-2"></p><p class="text-xs text-slate-400 mb-4">Typing saves a browser draft when browser storage is available. Use Save to sync with the team. Keep a downloaded copy of important work.</p>
    <label id="wsFeedbackWrap" class="block text-sm mb-4">Review feedback<textarea id="wsFeedback" rows="3" maxlength="3000" class="${inputClass}"></textarea></label>
    <div class="flex flex-wrap gap-2"><button id="wsSave" class="${buttonClass}">Save script</button><button id="wsSubmit" class="${buttonClass}">Submit for review</button><button id="wsApprove" class="${buttonClass}">Approve</button><button id="wsRevision" class="${buttonClass}">Request changes</button><button id="wsDownload" class="rounded-xl px-4 py-2 bg-[#29364d] text-sm">Download .txt</button></div>
    <p id="wsMessage" role="status" class="text-sm text-amber-300 mt-3"></p></div>`;
  document.body.appendChild(modal);
  let opened = null, baseline = '', dirty = false, busy = false;
  const pendingScripts = new Set();
  const $ = id => document.getElementById(id);
  const writing = t => t.category === 'SCRIPT WRITING';
  const canEdit = t => isAdmin() || (isOwnTask(t) && ['shweta','vanita'].includes(currentUser?.memberId));
  const draftKey = () => 'dd_writer_draft_v1:' + (currentUser?.memberId || '') + ':' + opened;
  function message(t) { $('wsMessage').textContent = t; }
  function count() { const s = $('wsText').value; $('wsCount').textContent = (s.trim() ? s.trim().split(/\s+/u).length : 0) + ' words · ' + s.length + '/20,000 characters'; updateDuration(); }
  function remember() {
    dirty = true; count();
    try { localStorage.setItem(draftKey(), JSON.stringify({text:$('wsText').value, feedback:$('wsFeedback').value, workspace:readWorkspace(), base:baseline})); message('Browser draft saved. Team copy updates when you Save.'); }
    catch (_) { message('Browser storage unavailable. Download a copy before leaving.'); }
  }
  const briefFields={brand:'Brand / client',topic:'Topic',audience:'Audience',language:'Language',duration:'Target duration',keyPoints:'Key points',cta:'Call to action'};
  const extras=document.createElement('div'); extras.className='space-y-4 my-4';
  extras.innerHTML=`<details class="rounded-xl border border-[#29364d] p-3" open><summary class="font-bold cursor-pointer">Brief checklist <span id="wsBriefCount" class="text-xs text-orange-300"></span></summary><p class="text-xs text-slate-400 mt-2">Your planning notes; the assigned brief above stays unchanged.</p><div class="grid sm:grid-cols-2 gap-3 mt-3">${Object.entries(briefFields).map(([k,v])=>`<label class="text-xs">${v}<textarea id="wsBrief_${k}" maxlength="2000" rows="2" class="${inputClass}"></textarea></label>`).join('')}</div></details>
    <div class="rounded-xl border border-[#29364d] p-3"><label class="text-xs">Template type<select id="wsTemplateType" class="${inputClass}"><option value="reel">Reel / Short</option><option value="youtube">YouTube Video</option><option value="ad">Ad / Promo</option><option value="explainer">Explainer</option></select></label><p class="text-xs text-slate-400 mt-2">Choose a structure, then use Insert Template above.</p></div>
    <div class="rounded-xl border border-[#29364d] p-3"><div class="flex flex-wrap justify-between gap-2"><h3 class="font-bold">Scene-wise editor</h3><button id="wsAddScene" class="${buttonClass}">+ Add scene</button></div><p class="text-xs text-slate-400 mt-2">Break the script into spoken lines, visuals and on-screen text. Maximum 40 scenes.</p><div id="wsScenes" class="space-y-3 mt-3"></div></div>
    <label class="block text-sm">Research notes & source links<textarea id="wsResearch" rows="5" maxlength="10000" class="${inputClass}" placeholder="Verified facts, product details, reference URLs and source dates…"></textarea><span class="block text-xs text-slate-400 mt-1">Sources are notes; links and claims are not automatically verified.</span></label>
    <div class="rounded-xl border border-[#29364d] p-3"><label class="text-xs">Speaking speed (words / minute)<input id="wsWpm" type="number" min="60" max="240" step="1" value="140" class="${inputClass}"></label><p id="wsDuration" class="text-sm text-orange-300 mt-2"></p><p class="text-xs text-slate-400 mt-1">Approximate spoken length; pauses, visuals and Hindi/Hinglish delivery can change the final duration.</p></div>`;
  $('wsText').parentElement.after(extras);
  $('wsTemplate').textContent='Insert selected template';
  function readWorkspace() {
    const brief=Object.fromEntries(Object.keys(briefFields).map(k=>[k,$('wsBrief_'+k).value]));
    const scenes=Array.from($('wsScenes').children).map(row=>({voiceover:row.querySelector('[data-field="voiceover"]').value,visual:row.querySelector('[data-field="visual"]').value,screen:row.querySelector('[data-field="screen"]').value}));
    const raw=Number($('wsWpm').value),wpm=Number.isFinite(raw)?Math.min(240,Math.max(60,Math.round(raw))):140;
    return {version:1,brief,scenes,researchNotes:$('wsResearch').value,wpm};
  }
  function addScene(scene={}) {
    if ($('wsScenes').children.length>=40) return message('Maximum 40 scenes.');
    const row=document.createElement('div');row.className='rounded-xl bg-[#0c1220] border border-[#29364d] p-3';
    row.innerHTML=`<div class="flex flex-wrap items-center gap-2 mb-2"><strong class="wsSceneLabel text-sm"></strong><button data-move="up" class="text-xs px-2 py-1 bg-[#29364d] rounded-lg" aria-label="Move scene up">↑</button><button data-move="down" class="text-xs px-2 py-1 bg-[#29364d] rounded-lg" aria-label="Move scene down">↓</button><button data-remove class="text-xs text-rose-300 ml-auto">Remove scene</button></div><div class="grid md:grid-cols-3 gap-3">${[['voiceover','Voiceover / dialogue'],['visual','Visual / B-roll'],['screen','On-screen text']].map(([key,label])=>`<label class="text-xs">${label}<textarea data-field="${key}" rows="4" maxlength="2000" class="${inputClass}"></textarea></label>`).join('')}</div>`;
    row.querySelectorAll('textarea').forEach(el=>{el.value=String(scene[el.dataset.field]||'');el.oninput=remember;});
    row.querySelector('[data-remove]').onclick=()=>{if(Array.from(row.querySelectorAll('textarea')).some(t=>t.value.trim())&&!confirm('Remove this scene and its text?'))return;row.remove();numberScenes();remember();};
    row.querySelectorAll('[data-move]').forEach(button=>button.onclick=()=>{if(button.dataset.move==='up'&&row.previousElementSibling)row.previousElementSibling.before(row);else if(button.dataset.move==='down'&&row.nextElementSibling)row.nextElementSibling.after(row);numberScenes();remember();});
    $('wsScenes').append(row);numberScenes();
  }
  function numberScenes() {Array.from($('wsScenes').children).forEach((row,i)=>row.querySelector('.wsSceneLabel').textContent='Scene '+(i+1));}
  function loadWorkspace(w) {
    w=w&&w.version===1?w:{};
    Object.keys(briefFields).forEach(k=>$('wsBrief_'+k).value=String(w.brief?.[k]||''));
    $('wsResearch').value=w.researchNotes||'';$('wsWpm').value=w.wpm||140;
    $('wsScenes').replaceChildren();(Array.isArray(w.scenes)?w.scenes:[]).slice(0,40).forEach(addScene);
  }
  function updateDuration() {
    const w=readWorkspace(),spoken=w.scenes.map(s=>s.voiceover).join(' ').trim(),text=spoken||$('wsText').value.trim();
    const words=text?text.split(/\s+/u).length:0,seconds=Math.ceil(words*60/w.wpm);
    $('wsDuration').textContent='Estimated speech: '+Math.floor(seconds/60)+'m '+seconds%60+'s · '+words+' words · '+(spoken?'scene voiceover':'main script');
    $('wsBriefCount').textContent=Object.values(w.brief).filter(v=>v.trim()).length+'/7 filled';
  }
  extras.querySelectorAll('textarea,input,select').forEach(el=>el.oninput=remember);
  $('wsAddScene').onclick=()=>{addScene();remember();};
  const aiBox=document.createElement('section');aiBox.className='rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4 my-4';
  aiBox.innerHTML=`<h3 class="font-bold text-indigo-300">✦ AI Writing Helper</h3><p class="text-xs text-slate-400 mt-1">Send only the text you choose below to Cloudflare AI. Suggestions need your review; they are not saved or inserted automatically.</p><div class="grid sm:grid-cols-2 gap-3 my-3"><label class="text-xs">Help with<select id="wsAIAction" class="${inputClass}"><option value="draft">Script draft from brief</option><option value="hooks">Hooks & CTA ideas</option><option value="rewrite">Rewrite passage</option><option value="shorten">Shorten script</option><option value="translate">Translate script</option><option value="scenes">Scene / B-roll ideas</option></select></label><label class="text-xs">Output language<select id="wsAILanguage" class="${inputClass}"><option>Hinglish</option><option>Hindi</option><option>English</option></select></label></div><label class="text-xs">Your brief or source text (maximum 6,000 characters)<textarea id="wsAIInput" rows="4" maxlength="6000" class="${inputClass}" placeholder="Describe the topic, audience, duration and verified key points, or paste a passage to improve…"></textarea></label><div class="flex flex-wrap gap-2 my-3"><button id="wsAIUseText" class="text-xs rounded-lg bg-[#29364d] px-3 py-2">Use selected text / current script</button><button id="wsAIGenerate" class="${buttonClass}">Generate suggestion</button><button id="wsAICancel" class="text-xs rounded-lg bg-[#29364d] px-3 py-2 hidden">Cancel</button></div><p id="wsAIStatus" role="status" class="text-xs text-amber-300 my-2"></p><label class="block text-xs">AI suggestion<textarea id="wsAIOutput" readonly rows="7" class="${inputClass}" placeholder="Your suggestion will appear here…"></textarea></label><button id="wsAIInsert" class="text-xs rounded-lg bg-indigo-600 px-3 py-2 mt-3" disabled>Append suggestion to my script</button><p class="text-xs text-slate-400 mt-3">App limit: 10 attempts per person daily, 15 seconds between requests, 60 team attempts daily. Provider free allowance is shared and may run out earlier. Failed/cancelled attempts may count. Daily reset: 05:30 AM IST. AI can make mistakes; verify facts before publishing.</p>`;
  extras.after(aiBox);
  let aiController=null, aiRunning=false;
  function resetAI() {
    if(aiController)aiController.abort();aiController=null;aiRunning=false;
    $('wsAIInput').value='';$('wsAIOutput').value='';$('wsAIStatus').textContent='';
    $('wsAIGenerate').disabled=false;$('wsAIInsert').disabled=true;$('wsAICancel').classList.add('hidden');
  }
  $('wsAIUseText').onclick=()=>{
    const text=$('wsText'),selection=text.value.slice(text.selectionStart,text.selectionEnd),source=selection||text.value;
    if(source.length>6000){$('wsAIStatus').textContent='Select a passage of 6,000 characters or fewer in the main script first.';return;}
    $('wsAIInput').value=source;$('wsAIStatus').textContent=selection?'Selected passage copied.':'Current script copied. Review it before generating.';
  };
  $('wsAICancel').onclick=()=>{if(aiController)aiController.abort();};
  $('wsAIGenerate').onclick=async()=>{
    if(aiRunning||!opened)return;
    const task=tasks.find(t=>String(t.id)===opened);if(!task||!canEdit(task))return;
    const text=$('wsAIInput').value.trim();if(!text||text.length>6000){$('wsAIStatus').textContent='Enter a brief or source text (1–6,000 characters).';return;}
    const owner=currentUser.memberId,taskId=opened,token=authToken,controller=new AbortController();aiController=controller;aiRunning=true;
    $('wsAIGenerate').disabled=true;$('wsAIInsert').disabled=true;$('wsAIOutput').value='';$('wsAICancel').classList.remove('hidden');$('wsAIStatus').textContent='Generating… your script stays unchanged.';
    const timer=setTimeout(()=>controller.abort(),45000);
    try {
      const response=await fetch(CLOUD_API.replace(/\/workspace$/, '/ai/writer'),{method:'POST',headers:authHeaders(true),signal:controller.signal,body:JSON.stringify({action:$('wsAIAction').value,language:$('wsAILanguage').value,text})});
      const data=await response.json().catch(()=>({}));
      if(aiController!==controller||owner!==currentUser?.memberId||token!==authToken||taskId!==opened)return;
      if(response.status===401)throw new Error('Session expired. Download unsaved writing, then log in again.');
      if(response.status===404)throw new Error('AI endpoint is not deployed yet. Admin must update the Worker and add the AI binding.');
      if(!response.ok)throw new Error(data.error||'AI is unavailable. Try later.');
      if(typeof data.suggestion!=='string'||!data.suggestion.trim())throw new Error('No suggestion returned.');
      $('wsAIOutput').value=data.suggestion;$('wsAIInsert').disabled=false;
      $('wsAIStatus').textContent='Suggestion ready — '+data.remaining+' app attempts remaining today. Review before inserting.';
    } catch(error) {
      if(aiController===controller&&taskId===opened)$('wsAIStatus').textContent=error.name==='AbortError'?'Request cancelled or timed out. Your script is unchanged; the attempt may still count.':error.message;
    } finally {
      clearTimeout(timer);
      if(aiController===controller){aiController=null;aiRunning=false;$('wsAIGenerate').disabled=false;$('wsAICancel').classList.add('hidden');}
    }
  };
  $('wsAIInsert').onclick=()=>{
    const t=tasks.find(t=>String(t.id)===opened);if(!t||!canEdit(t)||!$('wsAIOutput').value.trim())return;
    const text=$('wsText').value,suggestion=$('wsAIOutput').value,next=text+(text?'\n\n':'')+suggestion;
    if(next.length>20000){$('wsAIStatus').textContent='This would exceed the 20,000 character script limit. Copy a smaller part instead.';return;}
    $('wsText').value=next;remember();$('wsAIInsert').disabled=true;$('wsAIStatus').textContent='Added to your browser draft. Use Save script to sync with the team.';
  };
  $('wsText').oninput = remember; $('wsFeedback').oninput = remember;
  $('wsClose').onclick = () => { if (busy) return; if (dirty && !confirm('Close with unsynced work? Download a copy or recover the browser draft later.')) return; resetAI(); modal.classList.add('hidden'); opened = null; dirty = false; };
  window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
  $('wsRecover').onclick = () => { try { const d = JSON.parse(localStorage.getItem(draftKey())); if (!d) return message('No browser draft found for this account and task.'); if (!confirm('Replace editor text with your saved browser draft?')) return; $('wsText').value = d.text; if (d.workspace) loadWorkspace(d.workspace); if (isAdmin()) $('wsFeedback').value = d.feedback || ''; remember(); } catch (_) { message('Could not recover draft.'); } };
  $('wsTemplate').onclick = () => {
    const templates = {
      reel:'HOOK (0–3 sec):\n\nPROBLEM / CONTEXT:\n\nVALUE / DEMO:\n\nCTA:\n',
      youtube:'OPENING HOOK:\n\nINTRO / PROMISE:\n\nSECTION 1:\n\nSECTION 2:\n\nSECTION 3:\n\nRECAP / CTA:\n',
      ad:'AUDIENCE PROBLEM:\n\nPRODUCT / SOLUTION:\n\nKEY BENEFITS:\n\nPROOF (verify claims):\n\nOFFER / CTA:\n',
      explainer:'QUESTION / HOOK:\n\nWHAT IT IS:\n\nHOW IT WORKS:\n\nEXAMPLE:\n\nTAKEAWAY / CTA:\n'
    };
    if ($('wsText').value.trim() && !confirm('Replace the main script with this template? Scene notes stay unchanged.')) return;
    $('wsText').value=templates[$('wsTemplateType').value]; remember();
  };
  $('wsDownload').onclick = () => {
    const w=readWorkspace();
    const exported=[$('wsTitle').textContent, $('wsBrief').textContent, 'MAIN SCRIPT', $('wsText').value,
      'BRIEF CHECKLIST', ...Object.entries(w.brief).map(([k,v])=>k+': '+v),
      'SCENE BREAKDOWN', ...w.scenes.map((x,i)=>'Scene '+(i+1)+'\nVoiceover: '+x.voiceover+'\nVisual / B-roll: '+x.visual+'\nOn-screen text: '+x.screen),
      'RESEARCH / SOURCES',w.researchNotes].join('\n\n');
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([exported],{type:'text/plain;charset=utf-8'})); a.href=url;a.download='script.txt';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  function snapshot(t) { return JSON.stringify([t.scriptText || '',t.scriptReview || 'draft',t.scriptFeedback || '',t.writerBrief || '',t.assignedTo,t.scriptWorkspace || null]); }
  function edit(id) {
    const t = tasks.find(t => String(t.id) === id); if (!t || !writing(t) || !currentUser) return;
    resetAI();
    opened = id; baseline = snapshot(t); dirty = false;
    $('wsTitle').textContent = t.title; $('wsMeta').textContent = t.assignedTo + ' · Due: ' + (t.dueDate || 'Not set') + ' · ' + (t.scriptReview || 'draft');
    $('wsBrief').textContent = 'Brief: ' + (t.writerBrief || 'No brief provided.');
    $('wsExistingFeedback').textContent = t.scriptFeedback ? 'Admin feedback: ' + t.scriptFeedback : '';
    $('wsText').value = t.scriptText || ''; $('wsText').readOnly = !canEdit(t); $('wsFeedback').value = t.scriptFeedback || '';
    loadWorkspace(t.scriptWorkspace);
    aiBox.classList.toggle('hidden',!canEdit(t));
    extras.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=!canEdit(t));
    ['wsSave','wsSubmit','wsTemplate'].forEach(id => $(id).classList.toggle('hidden', !canEdit(t)));
    ['wsApprove','wsRevision','wsFeedbackWrap'].forEach(id => $(id).classList.toggle('hidden', !isAdmin()));
    $('wsRecover').classList.toggle('hidden',!canEdit(t)); count(); message('');
    try { if (localStorage.getItem(draftKey())) message('A browser draft is available. Recover it if needed.'); } catch (_) {}
    modal.classList.remove('hidden');
  }
  async function save(review) {
    if (busy || !opened) return;
    const t=tasks.find(t=>String(t.id)===opened);
    if (!t || !canEdit(t)) return message('You can edit only your assigned writing task.');
    if (['approved','changes_required'].includes(review) && !isAdmin()) return;
    if (snapshot(t)!==baseline) return message('This task changed while you were writing. Download your text, close and reopen the task to review the latest version.');
    if (!cloudReady || cloudConflict || isCloudUpdating || isCloudPulling || cloudSavePending) return message('Wait for cloud sync to finish. Resolve any sync conflict before saving. Your browser draft is kept.');
    if (pendingScripts.has(opened)) {
      const registered = await pushToCloud();
      if (!registered) return message('Your new script is not synced yet. Check the cloud connection and try again.');
      pendingScripts.delete(opened);
    }
    const sceneVoiceover=readWorkspace().scenes.map((s,i)=>'SCENE '+(i+1)+'\n'+s.voiceover).join('\n\n');
    const text=$('wsText').value.trim() ? $('wsText').value : (readWorkspace().scenes.some(s=>s.voiceover.trim())?sceneVoiceover:'');
    if (text.length>20000) return message('Maximum script length is 20,000 characters.');
    if (['submitted','approved'].includes(review) && !text.trim()) return message('Write the script before submitting or approving.');
    if (review==='changes_required' && !$('wsFeedback').value.trim()) return message('Add feedback so the writer knows what to change.');
    remember(); busy=true; ['wsSave','wsSubmit','wsApprove','wsRevision'].forEach(id=>$(id).disabled=true);
    if (!$('wsText').value.trim() && text) $('wsText').value=text;
    t.scriptText=text; t.scriptReview=review; t.scriptWorkspace=readWorkspace();
    if (isAdmin()) t.scriptFeedback=$('wsFeedback').value.trim();
    if (review==='approved') { t.status='completed'; t.progress=100; }
    else if (review==='changes_required') t.status='changes_required';
    else { t.status='in_progress'; if (t.progress===100) t.progress=0; }
    try {
      const ok=await pushToCloud(); baseline=snapshot(t); renderAll();
      if (ok && !cloudConflict) { dirty=false; try { localStorage.removeItem(draftKey()); } catch (_) {} message(review==='submitted'?'Script synced and submitted for admin review.':'Saved to team workspace.'); }
      else message('Cloud save was not confirmed. Browser draft is kept; check sync status. If the Worker is still on the old version, update worker.js first.');
    } finally { busy=false; ['wsSave','wsSubmit','wsApprove','wsRevision'].forEach(id=>$(id).disabled=false); }
  }
  $('wsSave').onclick=()=>save('draft'); $('wsSubmit').onclick=()=>save('submitted'); $('wsApprove').onclick=()=>save('approved'); $('wsRevision').onclick=()=>save('changes_required');
  window.renderWriterStudio = function () {
    const list=tasks.filter(t=>writing(t) && (isAdmin() || isOwnTask(t)));
    if (!root.firstChild) root.innerHTML=`<div class="rounded-2xl border border-[#29364d] bg-[#111827] p-5"><p class="text-orange-300 text-xs uppercase tracking-widest">Writing workspace</p><h2 class="text-2xl font-bold mt-1">Writer Studio</h2><p class="text-sm text-slate-400 mt-2">Write your own scripts or work on assigned briefs → Save drafts → Submit for review</p><div id="wsStart" class="my-5"></div><div id="wsAssignment" class="my-5"></div><div id="wsTaskList" class="grid md:grid-cols-2 gap-3"></div></div>`;
    const canStart = !!currentUser && (isAdmin() || ['shweta','vanita'].includes(currentUser.memberId));
    if (!canStart) $('wsStart').replaceChildren();
    if (canStart && !$('wsStartForm')) {
      $('wsStart').innerHTML=`<form id="wsStartForm" class="rounded-2xl border border-orange-500/30 bg-orange-500/5 p-4"><h3 class="text-lg font-bold">✍ New Script — Khud likhna shuru karo</h3><p class="text-sm text-slate-400 mt-1 mb-3">No assignment needed. Give your script a title, write here, save drafts and submit for review.</p><label class="block text-sm">Script title<input id="wsNewTitle" required maxlength="240" class="${inputClass}" placeholder="e.g. Product launch Reel — Hindi script"></label><button id="wsStartButton" class="${buttonClass} mt-3">+ Start Writing</button><p id="wsStartMessage" role="status" class="text-xs text-amber-300 mt-2"></p></form>`;
      $('wsStartForm').onsubmit=async e=>{
        e.preventDefault();
        if (!currentUser || (!isAdmin() && !['shweta','vanita'].includes(currentUser.memberId))) return;
        if (!cloudReady || cloudConflict || isCloudUpdating || isCloudPulling || cloudSavePending) { $('wsStartMessage').textContent='Wait for cloud sync, then start your script.'; return; }
        const title=$('wsNewTitle').value.trim(); if (!title) return;
        const owner=currentUser.memberId;
        let now=Date.now(); while(tasks.some(t=>String(t.id)==='task_'+now)) now++;
        const task={id:'task_'+now,title,category:'SCRIPT WRITING',assignedTo:currentUser.displayName,assignedBy:currentUser.displayName,assignedDate:getDashboardLocalDate(),dueDate:'',scriptText:'',scriptReview:'draft',docLink:'',outputLink:'',status:'pending',createdAt:now};
        tasks.unshift(task); pendingScripts.add(task.id); $('wsStartButton').disabled=true;
        try {
          const ok=await pushToCloud();
          if (owner!==currentUser?.memberId) return;
          if (ok) pendingScripts.delete(task.id);
          e.target.reset(); renderAll(); edit(task.id); $('wsText').focus();
          if (!ok) message('New script kept locally. Wait for cloud sync before saving your writing. You can write and download a copy now.');
        } finally { const start=$('wsStartButton'); if(start) start.disabled=false; }
      };
    }
    if (!isAdmin()) $('wsAssignment').replaceChildren();
    if (isAdmin() && !$('wsAssignForm')) {
      $('wsAssignment').innerHTML=`<form id="wsAssignForm" class="grid sm:grid-cols-2 gap-3 rounded-xl bg-[#0c1220] p-4"><h3 class="sm:col-span-2 font-bold">Assign a writing task</h3><label class="text-sm">Title *<input name="title" required maxlength="240" class="${inputClass}"></label><label class="text-sm">Writer<select name="writer" class="${inputClass}"><option>Shweta</option><option>Vanita</option></select></label><label class="text-sm">Deadline<input name="due" type="date" required class="${inputClass}"></label><label class="text-sm">Brief / references<textarea name="brief" maxlength="3000" rows="3" class="${inputClass}" placeholder="Topic, audience, duration, language, key points and references"></textarea></label><button class="${buttonClass}">Assign task</button><p id="wsAssignMessage" role="status" class="text-xs text-amber-300"></p></form>`;
      $('wsAssignForm').onsubmit=async e=>{
        e.preventDefault();
        if (!isAdmin()) return;
        if (!cloudReady || isCloudUpdating || isCloudPulling || cloudConflict || cloudSavePending) { $('wsAssignMessage').textContent='Wait for cloud sync before assigning.'; return; }
        const data=new FormData(e.target), title=String(data.get('title')).trim(); if (!title) return;
        const now=Date.now(); tasks.unshift({id:'task_'+now,title,category:'SCRIPT WRITING',assignedTo:String(data.get('writer')),assignedBy:currentUser.displayName,assignedDate:getDashboardLocalDate(),dueDate:String(data.get('due')),writerBrief:String(data.get('brief')).trim(),scriptText:'',scriptReview:'draft',docLink:'',outputLink:'',status:'pending',createdAt:now});
        const ok=await pushToCloud(); if(ok) e.target.reset(); renderAll(); if (!ok) $('wsAssignMessage').textContent='Assignment kept locally. Cloud save not confirmed; check sync status.';
      };
    }
    const box=$('wsTaskList'); box.replaceChildren();
    if (!list.length) { box.innerHTML='<p class="text-sm text-slate-400 py-5">No scripts yet. Use New Script above to start writing, or open a writing task assigned by Admin.</p>'; return; }
    list.forEach(t=>{
      const card=document.createElement('article'); card.className='rounded-xl border border-[#29364d] bg-[#0c1220] p-4';
      const title=document.createElement('h3'); title.className='font-bold'; title.textContent=t.title;
      const detail=document.createElement('p'); detail.className='text-xs text-slate-400 my-2'; detail.textContent=t.assignedTo+' · Due '+(t.dueDate||'Not set')+' · '+(t.scriptReview||'draft');
      const brief=document.createElement('p'); brief.className='text-sm text-slate-300 whitespace-pre-wrap mb-3'; brief.textContent=(t.writerBrief||'').slice(0,240);
      const open=document.createElement('button'); open.className=buttonClass; open.textContent=isAdmin()?'Write / Review script':'Continue writing'; open.onclick=()=>edit(String(t.id));
      card.append(title,detail,brief,open); box.append(card);
    });
  };
  function hideStudio() { root.classList.add('hidden'); btn.className=inactive; }
  const oldSwitch=window.switchMainTab; window.switchMainTab=function(...args){hideStudio();return oldSwitch.apply(this,args);};
  const oldCalendar=window.openContentCalendar; window.openContentCalendar=function(...args){hideStudio();return oldCalendar.apply(this,args);};
  const oldLogout=window.logoutUser; window.logoutUser=function(...args){if(busy)return; if(dirty&&!confirm('Log out with unsynced script work? Download a copy first if needed.'))return;resetAI();modal.classList.add('hidden');opened=null;dirty=false;hideStudio();root.replaceChildren();return oldLogout.apply(this,args);};
  function openStudio() { if(!currentUser)return; ['tasksViewContainer','shootsViewContainer','contentCalendarViewContainer','smartDashboard','shootsTopAction'].forEach(id=>$(id)?.classList.add('hidden')); ['tabTasksBtn','tabShootsBtn','tabCalendarBtn'].forEach(id=>$(id).className=inactive); btn.className=inactive+' bg-orange-500/10 text-orange-300'; root.classList.remove('hidden'); renderWriterStudio(); }
})();


