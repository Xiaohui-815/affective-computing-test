import { SCHEMA_VERSION, sampleTrials, csv, safeName } from './core.js';
const STORAGE = 'perception-study-session-v1';
const app = document.querySelector('#app');
let session = null, manifest = [], media = null, visibleTrial = false, buffering = false, playing = false;
let lastTick = performance.now(), pageBase = performance.now(), elapsedBase = 0, active = false, transitioning = false;
let saveFailed = false, generation = 0, releaseLock, infrastructureReady = false;
let tabVisible = document.visibilityState === 'visible', seeking = false;
const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const current = () => session?.trials[session.index];
const elapsed = () => Math.round(elapsedBase + performance.now() - pageBase);
const rounded = n => Math.round(n || 0);
function tick() {
  const now = performance.now(), delta = Math.max(0, now - lastTick); lastTick = now;
  if (!active || !current()) return;
  const t = current();
  t.totalMs += delta;
  if (!visibleTrial) t.loadMs += delta;
  if (visibleTrial && tabVisible) t.visibleMs += delta;
  if (playing && !buffering && !seeking) t.playingMs += delta;
  if (buffering && visibleTrial) t.bufferingMs += delta;
  if (media?.tagName === 'VIDEO') t.position = media.currentTime || 0;
}
function persist() {
  if (!session) return;
  session.checkpointAt = new Date().toISOString(); session.checkpointElapsedMs = elapsed();
  try { localStorage.setItem(STORAGE, JSON.stringify(session)); }
  catch { saveFailed = true; document.querySelector('#storage-warning').hidden = false; }
}
function record(type, details = {}, trial = current()) {
  if (!session) return;
  tick();
  session.events.push({ sequence: session.events.length + 1, timestamp: new Date().toISOString(), elapsedMs: elapsed(), trialIndex: trial ? session.trials.indexOf(trial) + 1 : null, stimulusId: trial?.id || null, type, details });
  persist();
}
function stopMedia() {
  tick();
  if (media?.tagName === 'VIDEO') { media.pause(); current().position = media.currentTime || 0; }
  generation++; active = false; playing = false; buffering = false; visibleTrial = false;
  if (media?.tagName === 'VIDEO') { media.removeAttribute('src'); media.load(); }
  media = null;
}
function welcome(message = '') {
  app.innerHTML = `<section class="welcome"><div class="intro"><p class="eyebrow">IMAGE & VIDEO SESSION</p><h1>从观看开始，<br>记录每一次感知。</h1><p>欢迎参加本次研究。你将依次观看一组图片和视频，请按自己的节奏完成。</p><div class="steps"><div class="step"><strong>01</strong>填写编号</div><span class="arrow">→</span><div class="step"><strong>02</strong>观看素材</div><span class="arrow">→</span><div class="step"><strong>03</strong>下载记录</div></div><div class="note">图片和视频均为随机选取。<br>没有正确或错误的观看方式，请自然操作。</div></div><form class="card" id="start-form"><h2>准备开始</h2><p style="font-size:14px">本次共 5 项素材：3 张图片、2 个视频。</p><label for="participant">被试编号</label><input id="participant" name="participant" placeholder="例如：P001" autocomplete="off" maxlength="80" required><div class="hint">请使用研究人员分配的编号，无需填写姓名。</div><p class="form-error" id="form-error" role="alert">${escapeHTML(message)}</p><button class="primary wide" type="submit" ${infrastructureReady?'':'disabled'}>${infrastructureReady?'开始实验 →':'正在准备素材…'}</button><div class="protocol"><span class="dot"></span>操作与停留时间将被记录，仅保存在本机</div></form></section>`;
  document.querySelector('#start-form').addEventListener('submit', event => {
    event.preventDefault(); const id = document.querySelector('#participant').value.trim();
    if (!id) { document.querySelector('#form-error').textContent = '请输入有效的被试编号。'; return; }
    if (!infrastructureReady || active || transitioning) return;
    try {
      session = { schemaVersion: SCHEMA_VERSION, sessionId: crypto.randomUUID(), participantId: id, startedAt: new Date().toISOString(), endedAt: null, status: 'active', index: 0, environment: { userAgent: navigator.userAgent, language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, viewport: { width: innerWidth, height: innerHeight }, screen: { width: screen.width, height: screen.height } }, trials: sampleTrials(manifest), events: [], clock: 'performance.now within page; wall-clock gap included on recovery', checkpointElapsedMs: 0 };
      pageBase = performance.now(); elapsedBase = 0; lastTick = pageBase;
      record('session_start', { selectedOrder: session.trials.map(t => t.id) }, null); showTrial();
    } catch (error) { document.querySelector('#form-error').textContent = error.message; }
  });
}
function resumeScreen() {
  const stored = session.status === 'active';
  if (!stored) { finishScreen(); return; }
  app.innerHTML = `<section class="finish card"><p class="eyebrow">SESSION RECOVERY</p><h1>继续上一次实验</h1><p>被试 <strong>${escapeHTML(session.participantId)}</strong> 的记录已保存在此浏览器中。当前为第 ${session.index + 1} / 5 项，继续后将保留原来的素材顺序。</p><div class="resume-actions"><button class="primary" id="resume">继续实验 →</button><button id="recover-export">下载已有记录</button><button class="quiet" id="abandon">结束这次实验</button></div></section>`;
  document.querySelector('#resume').onclick = () => { record('session_resume', { position: current().position }); showTrial(true); };
  document.querySelector('#recover-export').onclick = () => download('json');
  document.querySelector('#abandon').onclick = () => confirmEnd();
}
function showTrial(restored = false) {
  transitioning = true; const t = current(); const restorePosition = t.position; generation++; const token = generation;
  visibleTrial = false; buffering = false; playing = false; seeking = false; active = true; lastTick = performance.now();
  t.status = 'active';
  app.innerHTML = `<section><div class="session-bar"><span class="pill">被试 ${escapeHTML(session.participantId)}</span><span>${t.type==='image'?'图片':'视频'} · 第 ${session.index+1} / 5 项</span></div><div class="progress" aria-label="实验进度"><span style="width:${session.index*20}%"></span></div><div class="viewer" id="viewer"><div class="media-status" id="media-status">正在加载${t.type==='image'?'图片':'视频'}…</div></div><div class="controls"><p>${t.type==='image'?'请自然观看，准备好后进入下一项。':'可暂停、拖动进度，或随时进入下一项。'}</p><button id="next" class="primary" disabled>${session.index===4?'结束测试':'下一项'} →</button></div><div class="sub-controls"><button id="partial" class="quiet">下载当前记录</button><button id="quit" class="quiet">提前结束</button></div></section>`;
  document.querySelector('#partial').onclick = () => download('json');
  document.querySelector('#quit').onclick = confirmEnd;
  document.querySelector('#next').onclick = () => advance();
  record('stimulus_load_start', { restored, url: t.url });
  const node = document.createElement(t.type==='image'?'img':'video'); media = node;
  const valid = () => generation === token && active;
  const unlock = () => setTimeout(() => { if (!valid()) return; transitioning = false; document.querySelector('#next').disabled = false; }, 450);
  const ready = () => {
    if (!valid() || visibleTrial) return;
    if (t.type==='video' && node.videoWidth===0) { failed('当前浏览器无法解码视频画面。请使用支持此视频编码的浏览器或联系研究人员。'); return; }
    tick(); visibleTrial = true; t.firstShownAt ||= new Date().toISOString();
    document.querySelector('#media-status').hidden = true;
    record('stimulus_shown', { width: node.naturalWidth || node.videoWidth, height: node.naturalHeight || node.videoHeight }); unlock();
  };
  const failed = (message) => {
    if (!valid()) return;
    tick(); playing = false; buffering = false;
    if (node.tagName==='VIDEO') node.pause();
    record('stimulus_error', { code: node.error?.code || null, message: typeof message==='string'?message:node.error?.message || 'load failed' });
    const box = document.querySelector('#media-status'); box.hidden = false;
    box.innerHTML = `<p>${escapeHTML(typeof message==='string'?message:'素材加载失败，请检查网络。')}</p><button id="retry">重试</button>`;
    document.querySelector('#retry').onclick = () => { record('stimulus_retry'); stopMedia(); showTrial(true); };
    unlock(); document.querySelector('#next').textContent = session.index===4?'跳过并结束 →':'跳过此项 →'; t.hadError = true;
  };
  node.addEventListener('error', failed);
  if (t.type==='image') { node.alt = '实验图片'; node.addEventListener('load', ready); }
  else {
    node.controls = true; node.playsInline = true; node.preload = 'auto'; node.setAttribute('aria-label','实验视频');
    node.addEventListener('loadedmetadata', () => {
      if (!valid()) return;
      record('video_metadata', { duration: node.duration, width: node.videoWidth, height: node.videoHeight });
      t.duration = Number.isFinite(node.duration) ? node.duration : null;
      if (restored && restorePosition > 0) { try { node.currentTime = Math.min(restorePosition, node.duration || restorePosition); } catch {} }
      unlock();
    });
    node.addEventListener('loadeddata', ready);
    for (const name of ['play','playing','pause','waiting','stalled','seeking','seeked','ended','volumechange','ratechange','canplay','error']) {
      node.addEventListener(name, () => {
        if (!valid()) return;
        tick();
        if (name==='playing') { playing=true; buffering=false; ready(); }
        if (name==='waiting') buffering=true;
        if (name==='seeking') seeking=true;
        if (name==='seeked') seeking=false;
        if (name==='canplay' || name==='seeked') buffering=false;
        if (name==='pause' || name==='ended') playing=false;
        if (name==='ended') t.ended = true;
        record('video_'+name, { position: node.currentTime, duration: Number.isFinite(node.duration)?node.duration:null, volume: node.volume, muted: node.muted, playbackRate: node.playbackRate });
      });
    }
    node.addEventListener('webkitbeginfullscreen', () => record('fullscreen_change',{enabled:true}));
    node.addEventListener('webkitendfullscreen', () => record('fullscreen_change',{enabled:false}));
  }
  document.querySelector('#viewer').prepend(node); node.src = t.url;
  const nextImage = session.trials[session.index+1]; if (nextImage?.type==='image') { const preload = new Image(); preload.src = nextImage.url; }
}
function advance() {
  if (!active || transitioning) return;
  transitioning = true; document.querySelector('#next').disabled = true;
  const t = current(); record('stimulus_leave', { reason: t.hadError && !visibleTrial?'load_error_skip':'next', position: t.position });
  stopMedia(); t.status = t.hadError && !t.firstShownAt?'skipped':'viewed';
  if (session.index===session.trials.length-1) endSession('completed');
  else { session.index++; persist(); showTrial(); }
}
function endSession(status) {
  if (active) { record('stimulus_leave',{reason:'early_exit'}); stopMedia(); current().status='interrupted'; }
  session.status = status; session.endedAt = new Date().toISOString(); record('session_end',{status},null); transitioning = false; finishScreen();
}
function confirmEnd() {
  if (document.querySelector('dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.innerHTML='<h2>提前结束本次实验？</h2><p>已有记录会保留，你可以在结束页下载标记为“未完成”的记录。</p><div class="resume-actions"><button id="cancel-end">继续观看</button><button id="confirm-end" class="primary">结束并保留记录</button></div>';
  document.body.append(dialog); record('end_dialog_open'); dialog.showModal();
  dialog.querySelector('#cancel-end').onclick = () => { record('end_dialog_cancel'); dialog.close(); };
  dialog.querySelector('#confirm-end').onclick = () => { dialog.close(); endSession('incomplete'); };
  dialog.addEventListener('close',()=>dialog.remove());
  dialog.addEventListener('cancel',()=>record('end_dialog_cancel'));
}
function finishScreen() {
  active = false;
  app.innerHTML=`<section class="finish"><div class="finish-head"><div class="checkmark" aria-hidden="true">✓</div><p class="eyebrow">SESSION ${session.status==='completed'?'COMPLETE':'SAVED'}</p><h1>${session.status==='completed'?'感谢参与，实验已结束':'实验已提前结束'}</h1><p>请下载本次记录，并按研究人员的要求提交文件。</p></div><div class="card"><h2>保存你的实验记录</h2><div class="finish-meta"><span>被试编号<strong>${escapeHTML(session.participantId)}</strong></span><span>状态<strong>${session.status==='completed'?'已完成':'未完成'}</strong></span><span>已访问<strong>${session.trials.filter(t=>t.status!=='pending').length} / 5 项</strong></span></div><div class="downloads"><button class="download" data-export="json"><div><strong>完整实验记录</strong><span>JSON · 包含会话、素材和全部交互事件</span></div><b>↓</b></button><button class="download" data-export="events"><div><strong>交互事件表</strong><span>CSV · 每行对应一次交互事件</span></div><b>↓</b></button><button class="download" data-export="summary"><div><strong>素材观看汇总</strong><span>CSV · 每项素材的时长与播放状态</span></div><b>↓</b></button></div><p class="notice">记录不会自动上传。下载后请确认文件已保存在设备中，再开始下一位被试。</p><button class="quiet" id="new-session">开始新被试</button><div class="status-line" id="download-status" role="status"></div></div></section>`;
  document.querySelectorAll('[data-export]').forEach(button=>button.onclick=()=>download(button.dataset.export));
  document.querySelector('#new-session').onclick = () => {
    const dialog = document.createElement('dialog'); dialog.innerHTML='<h2>开始新被试</h2><p>请先确认已下载本次记录。开始新实验后，本浏览器保存的上一轮记录将被替换。</p><div class="resume-actions"><button id="keep">返回下载</button><button class="primary" id="new-confirm">已保存，继续</button></div>';
    document.body.append(dialog); dialog.showModal(); dialog.querySelector('#keep').onclick=()=>dialog.close(); dialog.querySelector('#new-confirm').onclick=()=>{dialog.close(); try{localStorage.removeItem(STORAGE);}catch{} session=null; welcome();}; dialog.onclose=()=>dialog.remove();
  };
}
function download(kind) {
  tick(); record('download_requested',{format:kind},null);
  const snapshot = structuredClone(session);
  if (snapshot.status==='active') snapshot.status='incomplete';
  snapshot.exportedAt=new Date().toISOString(); snapshot.storageWarning=saveFailed;
  snapshot.notes={timing:'Durations are browser-observable estimates, not attention measures. Closed-page gaps are excluded from stimulus durations. Playing time is wall-clock time, not unique content coverage.',nativeControls:'Native video controls may not expose clicks or key events; semantic media events are recorded.',completion:'completed means all five trials were advanced through; videos may be skipped or partially viewed.'};
  let body, mime, extension;
  if(kind==='json'){body=JSON.stringify(snapshot,null,2);mime='application/json';extension='json';}
  else {
    mime='text/csv;charset=utf-8';extension='csv';
    const prefix=['session_id','participant_id','session_status']; const values=[snapshot.sessionId,snapshot.participantId,snapshot.status];
    if(kind==='events')body=csv([[...prefix,'sequence','timestamp','elapsed_ms','trial_index','stimulus_id','event','details_json'],...snapshot.events.map(e=>[...values,e.sequence,e.timestamp,e.elapsedMs,e.trialIndex,e.stimulusId,e.type,e.details])]);
    else body=csv([[...prefix,'trial_index','stimulus_id','filename','type','status','total_ms','visible_ms','loading_ms','buffering_ms','playing_ms','last_position_s','duration_s','reached_end','first_shown_at','playback_version','playback_sha256','source_sha256','processing'],...snapshot.trials.map((t,i)=>[...values,i+1,t.id,t.filename,t.type,t.status,rounded(t.totalMs),rounded(t.visibleMs),rounded(t.loadMs),rounded(t.bufferingMs),rounded(t.playingMs),t.position,t.duration,t.ended,t.firstShownAt,t.playbackVersion,t.sha256,t.sourceSha256,t.processing])]);
  }
  const link=document.createElement('a'); const url=URL.createObjectURL(new Blob([body],{type:mime}));link.href=url;link.download=`${safeName(session.participantId)}_${session.startedAt.replace(/[:.]/g,'-')}_${session.sessionId}_${kind}.${extension}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  const status=document.querySelector('#download-status');if(status)status.textContent='已发起下载。请检查浏览器下载列表或设备中的文件。';
}
// Document events are collected only after a participant starts a session.
document.addEventListener('click',e=>{if(!active)return;const target=e.target.closest('button,a,input,video,img');record('click',{target:target?.id||target?.tagName.toLowerCase()||e.target.tagName.toLowerCase(),x:e.clientX,y:e.clientY});},true);
document.addEventListener('keydown',e=>{if(!active||e.target.matches('input,textarea'))return;record('keydown',{key:e.key,code:e.code,repeat:e.repeat,alt:e.altKey,ctrl:e.ctrlKey,shift:e.shiftKey,meta:e.metaKey});},true);
let lastScroll=0;addEventListener('scroll',()=>{if(active&&performance.now()-lastScroll>150){lastScroll=performance.now();record('scroll',{x:scrollX,y:scrollY});}},{passive:true});
document.addEventListener('visibilitychange',()=>{tick();tabVisible=document.visibilityState==='visible';if(active)record('visibility_change',{state:document.visibilityState});});
for(const name of ['focus','blur'])addEventListener(name,()=>{if(active)record('window_'+name);});
addEventListener('resize',()=>{if(active)record('viewport_resize',{width:innerWidth,height:innerHeight});});
document.addEventListener('fullscreenchange',()=>{if(active)record('fullscreen_change',{enabled:!!document.fullscreenElement});});
addEventListener('pagehide',()=>{if(session){record('page_hide',{active});stopMedia();persist();}});
addEventListener('pageshow',e=>{if(e.persisted&&session){record('page_restore');resumeScreen();}});
document.querySelector('#brand').onclick=e=>{if(session){e.preventDefault();if(active)record('home_navigation_prevented');}};
setInterval(()=>{if(active){tick();if(media?.tagName==='VIDEO'&&!media.paused)record('video_progress',{position:media.currentTime,paused:media.paused,seeking:media.seeking,readyState:media.readyState});else persist();}},1000);
async function init() {
  if(navigator.locks){
    const obtained=await new Promise(resolve=>navigator.locks.request('perception-study-active-tab',{ifAvailable:true},lock=>{resolve(!!lock);return lock?new Promise(done=>{releaseLock=done;}):undefined;}));
    if(!obtained){app.innerHTML='<section class="finish card"><h1>实验已在另一个标签页打开</h1><p>请回到原来的标签页，或关闭它后刷新本页，避免记录相互覆盖。</p></section>';return;}
  }
  welcome();
  try{
    const response=await fetch('./media-manifest.json',{cache:'no-cache'});if(!response.ok)throw new Error('无法读取素材清单，请刷新重试。');manifest=await response.json(); sampleTrials(manifest);
    if(!('serviceWorker' in navigator))throw new Error('当前浏览器不支持视频分段读取。请使用新版 Chrome 或 Edge，并通过 HTTPS 链接访问。');
    await navigator.serviceWorker.register('./sw.js',{type:'module'});
    await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>setTimeout(()=>reject(new Error('视频服务准备超时，请刷新重试。')),20000))]);
    if(!navigator.serviceWorker.controller)await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('视频服务未就绪，请刷新页面。')),10000);navigator.serviceWorker.addEventListener('controllerchange',()=>{clearTimeout(timeout);resolve();},{once:true});});
    infrastructureReady=true;
    let raw;try{raw=localStorage.getItem(STORAGE);}catch{saveFailed=true;document.querySelector('#storage-warning').hidden=false;}
    if(raw){
      try{const saved=JSON.parse(raw);if(saved.schemaVersion!==SCHEMA_VERSION||!Array.isArray(saved.events)||saved.trials?.length!==5||!Number.isInteger(saved.index)||saved.index<0||saved.index>4)throw new Error('invalid');session=saved;}
      catch{app.innerHTML='<section class="finish card"><h1>保存的记录无法恢复</h1><p>请先下载原始记录备份，再清除损坏记录重新开始。</p><div class="resume-actions"><button id="raw-download">下载原始备份</button><button id="clear-corrupt" disabled>清除并重新开始</button></div></section>';document.querySelector('#raw-download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.download='session-recovery-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),30000);document.querySelector('#clear-corrupt').disabled=false;};document.querySelector('#clear-corrupt').onclick=()=>{try{localStorage.removeItem(STORAGE);}catch{}welcome();};return;}
      const gap=Math.max(0,Date.now()-Date.parse(session.checkpointAt));elapsedBase=(session.checkpointElapsedMs||0)+(Number.isFinite(gap)?gap:0);pageBase=performance.now();lastTick=pageBase;
      if(session.status==='active')record('session_recovered',{lastCheckpointAt:session.checkpointAt,unobservedGapMs:gap},null);
      resumeScreen();
    }else welcome();
    // Read-only assistance cannot trigger participant interactions.
    try { await document.modelContext?.registerTool({name:'read_experiment_status',description:'Read experiment readiness and progress without starting, advancing or exporting an experiment.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true},execute:async input=>{if(Object.keys(input||{}).length)throw new Error('No parameters accepted');return {ready:infrastructureReady,status:session?.status||'not_started',trialIndex:session?session.index+1:null,trialCount:5};}}); } catch { /* Optional browser integration must not block the experiment. */ }
  }catch(error){infrastructureReady=false;welcome(error.message);}
}
init();
