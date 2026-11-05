
(function () {
  const root = document.getElementById('contentCalendarViewContainer');
  if (!root) return;
  const inactiveTab = "px-4 py-2 rounded-xl font-bold text-xs sm:text-sm text-slate-400 hover:text-slate-200 border border-transparent hover:border-[#1f293d] flex items-center gap-2 transition";
  const activeTab = "px-4 py-2 rounded-xl font-bold text-xs sm:text-sm bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 flex items-center gap-2 transition";
  let visibleMonth = new Date();
  let editingId = "";

  root.innerHTML = `
    <div class="rounded-2xl border border-[#1f293d] bg-gradient-to-br from-[#111827] to-[#0c1220] p-4 sm:p-5 mb-6">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div><p class="text-[10px] font-extrabold uppercase tracking-[0.18em] text-indigo-300">Publishing planner</p><h2 class="text-lg sm:text-xl font-bold text-white mt-1">Content Calendar</h2><p class="text-xs text-slate-400 mt-1">Plan Reels, Shorts, YouTube videos, posts and publishing dates in one shared calendar.</p></div>
        <button id="addCalendarContentButton" onclick="openContentCalendarModal()" class="hidden px-3.5 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-600 text-white text-xs font-bold items-center gap-2"><i class="ph-bold ph-plus-circle"></i> Add Content</button>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <div class="rounded-xl border border-[#1f293d] bg-[#0c1220] p-3"><div class="text-[10px] uppercase text-slate-500">Scheduled</div><div id="ccScheduledCount" class="text-xl font-black text-white mt-1">0</div></div>
        <div class="rounded-xl border border-[#1f293d] bg-[#0c1220] p-3"><div class="text-[10px] uppercase text-slate-500">In Production</div><div id="ccProductionCount" class="text-xl font-black text-amber-300 mt-1">0</div></div>
        <div class="rounded-xl border border-[#1f293d] bg-[#0c1220] p-3"><div class="text-[10px] uppercase text-slate-500">Ready to Publish</div><div id="ccReadyCount" class="text-xl font-black text-sky-300 mt-1">0</div></div>
        <div class="rounded-xl border border-[#1f293d] bg-[#0c1220] p-3"><div class="text-[10px] uppercase text-slate-500">Published</div><div id="ccPublishedCount" class="text-xl font-black text-emerald-300 mt-1">0</div></div>
      </div>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div class="flex items-center gap-2"><button onclick="changeContentCalendarMonth(-1)" class="w-9 h-9 rounded-lg bg-[#161f33] border border-[#29364d] text-slate-200" aria-label="Previous month"><i class="ph-bold ph-caret-left"></i></button><h3 id="ccMonthLabel" class="text-sm sm:text-base font-bold text-white min-w-36 text-center"></h3><button onclick="changeContentCalendarMonth(1)" class="w-9 h-9 rounded-lg bg-[#161f33] border border-[#29364d] text-slate-200" aria-label="Next month"><i class="ph-bold ph-caret-right"></i></button><button onclick="goToContentCalendarToday()" class="px-3 h-9 rounded-lg bg-[#161f33] border border-[#29364d] text-xs font-semibold text-slate-300">Today</button></div>
        <div class="flex flex-wrap gap-2 text-[10px] text-slate-400"><span>🔵 Planned</span><span>🟠 In Production</span><span>🔹 Ready</span><span>🟢 Published</span></div>
      </div>
      <div class="grid grid-cols-7 gap-1 sm:gap-2 mb-1">${["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d => '<div class="text-center text-[9px] sm:text-[10px] font-bold uppercase text-slate-500 py-2">'+d+'</div>').join("")}</div>
      <div id="ccCalendarGrid" class="grid grid-cols-7 gap-1 sm:gap-2"></div>
      <div class="mt-4 text-[11px] text-slate-500">Team members can view the calendar. Only Admin can add, edit or remove scheduled content.</div>
    </div>
    <div class="rounded-2xl border border-[#1f293d] bg-[#111827] p-4"><div class="flex items-center justify-between gap-2 mb-3"><h3 class="text-sm font-bold text-white">Upcoming publishing schedule</h3><span id="ccUpcomingCount" class="text-[10px] text-slate-500"></span></div><div id="ccUpcomingList" class="space-y-2"></div></div>`;

  document.body.insertAdjacentHTML('beforeend', `
    <div id="contentCalendarModal" class="hidden fixed inset-0 z-[95] bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div class="max-w-xl mx-auto my-5 rounded-2xl border border-[#29364d] bg-[#111827] p-5 shadow-2xl">
        <div class="flex items-center justify-between gap-3 border-b border-[#1f293d] pb-3 mb-4"><div><h3 id="ccModalTitle" class="text-base font-bold text-white">Schedule Content</h3><p class="text-[11px] text-slate-400 mt-1">Add a publishing plan for the team</p></div><button type="button" onclick="closeContentCalendarModal()" class="w-9 h-9 rounded-lg bg-[#1f293d] text-slate-300">✕</button></div>
        <form id="contentCalendarForm" onsubmit="saveContentCalendarItem(event)" class="space-y-3 text-xs">
          <div><label class="block text-slate-300 font-semibold mb-1">Content title *</label><input id="ccTitle" required maxlength="180" placeholder="e.g. Vinayo Mixer Grinder Reel" class="w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="block text-slate-300 font-semibold">Content type<select id="ccType" class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"><option>Reel / Short</option><option>YouTube Video</option><option>Instagram Post</option><option>Carousel</option><option>Story</option><option>Ad / Promo</option><option>Other</option></select></label><label class="block text-slate-300 font-semibold">Platform<select id="ccPlatform" class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"><option>Instagram</option><option>YouTube</option><option>Facebook</option><option>LinkedIn</option><option>Multiple Platforms</option><option>Other</option></select></label></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="block text-slate-300 font-semibold">Publish date *<input id="ccDate" type="date" required class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"></label><label class="block text-slate-300 font-semibold">Publish time<input id="ccTime" type="time" class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"></label></div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><label class="block text-slate-300 font-semibold">Assigned to<select id="ccAssignee" class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"><option>Unassigned</option><option>Pavan</option><option>Vijay</option><option>Tushar</option><option>Mirtunjay</option><option>Shweta</option><option>Vanita</option><option>Manoj</option><option>Ashish</option></select></label><label class="block text-slate-300 font-semibold">Status<select id="ccStatus" class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"><option>Planned</option><option>In Production</option><option>Ready to Publish</option><option>Published</option></select></label></div>
          <label class="block text-slate-300 font-semibold">Post / asset link<input id="ccLink" type="url" maxlength="2048" placeholder="https://..." class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"></label>
          <label class="block text-slate-300 font-semibold">Notes<textarea id="ccNotes" rows="3" maxlength="2000" placeholder="Caption, reference, shoot details or reminders..." class="mt-1 w-full rounded-lg bg-[#0c1220] border border-[#29364d] p-2.5 text-white"></textarea></label>
          <div class="flex justify-end gap-2 pt-2 border-t border-[#1f293d]"><button type="button" onclick="closeContentCalendarModal()" class="px-4 py-2 rounded-lg bg-[#1f293d] text-slate-300">Cancel</button><button type="submit" class="px-5 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white font-bold">Save to Calendar</button></div>
        </form>
      </div>
    </div>`);

  function safeList(){return Array.isArray(contentCalendar)?contentCalendar:[];}
  function localDateString(d){return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
  function prettyDate(v){if(!v)return "Date not set";const p=v.split("-").map(Number);return p.length===3?new Date(p[0],p[1]-1,p[2],12).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"}):v;}
  function validLink(v){try{const u=new URL(v);return u.protocol==="https:"||u.protocol==="http:"?u.href:"";}catch(_){return "";}}
  function tone(s){return s==="In Production"?"amber":s==="Ready to Publish"?"sky":s==="Published"?"emerald":"indigo";}
  function badgeClass(s){const t=tone(s);return "border-"+t+"-500/30 bg-"+t+"-500/10 text-"+t+"-300";}
  function card(item,compact){
    const link=validLink(item.link||"");
    const onclick=isAdmin()?' onclick="editContentCalendarItem(\''+escapeHtml(item.id)+'\')" role="button" tabindex="0"':"";
    return '<div class="rounded-lg border '+badgeClass(item.status||"Planned")+' p-1.5 mb-1 min-w-0'+(isAdmin()?' cursor-pointer hover:brightness-125':'')+'"'+onclick+'><div class="text-[9px] sm:text-[10px] font-bold leading-snug break-words">'+escapeHtml(item.title||"Untitled content")+'</div>'+
      (compact?'':'<div class="text-[9px] opacity-80 mt-1">'+escapeHtml((item.type||"Content")+" · "+(item.platform||"Platform TBD"))+'</div><div class="text-[9px] opacity-80 mt-0.5">'+escapeHtml(item.publishTime||"")+' '+escapeHtml(item.assignedTo||"Unassigned")+'</div><div class="text-[9px] font-semibold mt-1">'+escapeHtml(item.status||"Planned")+'</div>')+
      (link&&!compact?'<a href="'+escapeHtml(link)+'" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" class="inline-block text-[9px] underline mt-1">Open link</a>':"")+'</div>';
  }

  window.openContentCalendar=function(){
    document.getElementById("tasksViewContainer").classList.add("hidden");
    document.getElementById("shootsViewContainer").classList.add("hidden");
    document.getElementById("shootsTopAction").classList.add("hidden");
    document.getElementById("smartDashboard").classList.add("hidden");
    root.classList.remove("hidden");
    document.getElementById("tabTasksBtn").className=inactiveTab;
    document.getElementById("tabShootsBtn").className=inactiveTab;
    document.getElementById("tabCalendarBtn").className=activeTab;
    renderContentCalendar();
  };
  window.renderContentCalendar=function(){
    const items=safeList(),start=new Date(visibleMonth.getFullYear(),visibleMonth.getMonth(),1);
    const y=start.getFullYear(),m=start.getMonth();
    document.getElementById("ccMonthLabel").textContent=start.toLocaleDateString("en-IN",{month:"long",year:"numeric"});
    document.getElementById("ccScheduledCount").textContent=items.filter(x=>x.status==="Planned").length;
    document.getElementById("ccProductionCount").textContent=items.filter(x=>x.status==="In Production").length;
    document.getElementById("ccReadyCount").textContent=items.filter(x=>x.status==="Ready to Publish").length;
    document.getElementById("ccPublishedCount").textContent=items.filter(x=>x.status==="Published").length;
    const offset=start.getDay(),total=new Date(y,m+1,0).getDate();let html="";
    for(let i=0;i<offset;i++)html+='<div class="min-h-20 sm:min-h-28 rounded-lg border border-[#1f293d]/50 bg-[#0c1220]/40"></div>';
    for(let d=1;d<=total;d++){
      const key=localDateString(new Date(y,m,d)),dayItems=items.filter(x=>x.publishDate===key).sort((a,b)=>String(a.publishTime||"").localeCompare(String(b.publishTime||"")));
      const today=key===localDateString(new Date()),shown=dayItems.slice(0,3).map(x=>card(x,true)).join("");
      html+='<div class="min-h-20 sm:min-h-28 rounded-lg border '+(today?'border-indigo-400/70 bg-indigo-500/5':'border-[#1f293d] bg-[#0c1220]')+' p-1 sm:p-1.5 overflow-hidden"><div class="flex items-center justify-between mb-1"><span class="text-[10px] font-bold '+(today?'text-indigo-300':'text-slate-400')+'">'+d+'</span>'+(dayItems.length?'<span class="text-[8px] text-slate-500">'+dayItems.length+'</span>':"")+'</div>'+shown+(dayItems.length>3?'<div class="text-[9px] text-slate-400 px-1">+'+(dayItems.length-3)+' more</div>':"")+'</div>';
    }
    const trailing=(7-((offset+total)%7))%7;for(let i=0;i<trailing;i++)html+='<div class="min-h-20 sm:min-h-28 rounded-lg border border-[#1f293d]/50 bg-[#0c1220]/40"></div>';
    document.getElementById("ccCalendarGrid").innerHTML=html;
    const upcoming=items.filter(x=>x.publishDate&&x.publishDate>=localDateString(new Date())&&x.status!=="Published").sort((a,b)=>(a.publishDate+" "+(a.publishTime||"")).localeCompare(b.publishDate+" "+(b.publishTime||""))).slice(0,12);
    document.getElementById("ccUpcomingCount").textContent=upcoming.length+" upcoming";
    document.getElementById("ccUpcomingList").innerHTML=upcoming.length?upcoming.map(x=>'<div class="flex flex-wrap items-start justify-between gap-2 p-3 rounded-xl bg-[#0c1220] border border-[#1f293d]"><div class="min-w-0 flex-1"><div class="text-sm font-bold text-white break-words">'+escapeHtml(x.title||"Untitled content")+'</div><div class="text-[11px] text-slate-400 mt-1">'+escapeHtml(prettyDate(x.publishDate))+' '+escapeHtml(x.publishTime||"")+' · '+escapeHtml(x.type||"Content")+' · '+escapeHtml(x.platform||"Platform TBD")+'</div><div class="text-[10px] text-slate-500 mt-1">Assigned to '+escapeHtml(x.assignedTo||"Unassigned")+'</div></div><span class="text-[10px] rounded-full border px-2 py-1 '+badgeClass(x.status||"Planned")+'">'+escapeHtml(x.status||"Planned")+'</span>'+(isAdmin()?'<button onclick="editContentCalendarItem(\''+escapeHtml(x.id)+'\')" class="text-[10px] text-indigo-300 font-bold">Edit</button>':"")+'</div>').join(""):'<div class="text-xs text-slate-500 text-center py-6">No upcoming content scheduled. Admin can add the first item.</div>';
    const add=document.getElementById("addCalendarContentButton");if(add){add.classList.toggle("hidden",!isAdmin());add.classList.toggle("inline-flex",isAdmin());}
  };
  window.changeContentCalendarMonth=function(n){visibleMonth=new Date(visibleMonth.getFullYear(),visibleMonth.getMonth()+n,1);renderContentCalendar();};
  window.goToContentCalendarToday=function(){visibleMonth=new Date();renderContentCalendar();};
  window.openContentCalendarModal=function(id){
    if(!isAdmin())return;editingId=id||"";const old=editingId?safeList().find(x=>String(x.id)===String(editingId)):null;
    document.getElementById("contentCalendarForm").reset();
    document.getElementById("ccModalTitle").textContent=old?"Edit Scheduled Content":"Schedule Content";
    document.getElementById("ccDate").value=old?(old.publishDate||""):localDateString(new Date());
    document.getElementById("ccTitle").value=old?(old.title||""):"";
    document.getElementById("ccType").value=old?(old.type||"Reel / Short"):"Reel / Short";
    document.getElementById("ccPlatform").value=old?(old.platform||"Instagram"):"Instagram";
    document.getElementById("ccTime").value=old?(old.publishTime||""):"";
    document.getElementById("ccAssignee").value=old?(old.assignedTo||"Unassigned"):((currentUser&&currentUser.displayName)||"Unassigned");
    document.getElementById("ccStatus").value=old?(old.status||"Planned"):"Planned";
    document.getElementById("ccLink").value=old?(old.link||""):"";
    document.getElementById("ccNotes").value=old?(old.notes||""):"";
    const del=document.getElementById("deleteCalendarContentButton");if(del)del.classList.toggle("hidden",!old);
    document.getElementById("contentCalendarModal").classList.remove("hidden");
  };
  window.closeContentCalendarModal=function(){document.getElementById("contentCalendarModal").classList.add("hidden");editingId="";};
  window.editContentCalendarItem=function(id){if(isAdmin())openContentCalendarModal(id);};
  window.deleteContentCalendarItem=function(){
    if(!isAdmin()||!editingId)return;const item=safeList().find(x=>String(x.id)===String(editingId));
    if(!item||!confirm("Remove "+(item.title||"this content")+" from the calendar?"))return;
    contentCalendar=safeList().filter(x=>String(x.id)!==String(editingId));
    recordActivity("Content calendar item removed",item.title||"Content item");
    closeContentCalendarModal();renderContentCalendar();pushToCloud();
  };
  window.saveContentCalendarItem=function(e){
    e.preventDefault();if(!isAdmin())return;
    const title=document.getElementById("ccTitle").value.trim(),date=document.getElementById("ccDate").value,link=document.getElementById("ccLink").value.trim();
    if(!title||!date)return;if(link&&!validLink(link)){alert("Please enter a valid http or https link.");return;}
    const old=editingId?safeList().find(x=>String(x.id)===String(editingId)):null;
    const item={id:editingId||("content_"+Date.now()),title,type:document.getElementById("ccType").value,platform:document.getElementById("ccPlatform").value,publishDate:date,publishTime:document.getElementById("ccTime").value,assignedTo:document.getElementById("ccAssignee").value,status:document.getElementById("ccStatus").value,link,notes:document.getElementById("ccNotes").value.trim(),createdAt:old?(old.createdAt||new Date().toISOString()):new Date().toISOString(),createdBy:old?(old.createdBy||currentUser.displayName):currentUser.displayName};
    if(!Array.isArray(contentCalendar))contentCalendar=[];if(editingId){const i=contentCalendar.findIndex(x=>String(x.id)===String(editingId));if(i>=0)contentCalendar[i]=item;}else contentCalendar.unshift(item);
    recordActivity(editingId?"Content calendar updated":"Content scheduled",title+" · "+date);
    closeContentCalendarModal();renderContentCalendar();pushToCloud();
  };
  document.getElementById("contentCalendarForm").querySelector(".flex.justify-end").insertAdjacentHTML("afterbegin",'<button id="deleteCalendarContentButton" type="button" onclick="deleteContentCalendarItem()" class="hidden mr-auto px-3 py-2 rounded-lg bg-rose-500/10 text-rose-300">Delete</button>');
  renderContentCalendar();
})();