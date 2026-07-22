// ---------- Boot sequence: brief HUD-style intro, skippable, auto-dismisses ----------
(function boot(){
  const screen = document.getElementById('bootScreen');
  const linesEl = document.getElementById('bootLines');
  if(!screen || !linesEl) return;

  const lines = [
    '> SYSTEMS INITIALIZING...',
    '> LOADING NEURAL CORE...',
    '> CALIBRATING PARTICLE FIELD...',
    '> WELCOME. WILLIAMAI ONLINE.',
  ];

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(prefersReduced){ screen.remove(); return; }

  lines.forEach((text, i) => {
    const div = document.createElement('div');
    div.className = 'boot-line' + (i === lines.length - 1 ? ' final' : '');
    div.textContent = text;
    linesEl.appendChild(div);
    setTimeout(() => div.classList.add('show'), i * 480);
  });

  let dismissed = false;
  window.skipBoot = function(){
    if(dismissed) return;
    dismissed = true;
    screen.classList.add('hidden');
    setTimeout(() => screen.remove(), 650);
  };
  setTimeout(window.skipBoot, lines.length * 480 + 900);
})();

// ---------- Status ticker: rotates through HUD readouts while idle, so the
// interface feels alive even before the visitor touches anything. Any module
// (panel/chat) can take the line over with setStatus(); releaseStatus()
// resumes the rotation. ----------
const IDLE_STATUS_LINES = [
  'SYSTEMS ONLINE — TAP THE CORE TO TALK',
  'NEURAL LINK STABLE — 20,000+ GPU PARTICLES ACTIVE',
  'VOICE INTERFACE READY — ASK ME ANYTHING',
  'CLAUDE UPLINK NOMINAL — RESPONSES STREAM LIVE',
];
const statusLineEl = document.getElementById('statusLine');
let statusIdle = true;
let statusIdx = 0;

function setStatus(text){
  statusIdle = false;
  statusLineEl.textContent = text;
}
function releaseStatus(){
  statusIdle = true;
  statusIdx = 0;
  statusLineEl.textContent = IDLE_STATUS_LINES[0];
}
setInterval(() => {
  if(!statusIdle) return;
  statusIdx = (statusIdx + 1) % IDLE_STATUS_LINES.length;
  statusLineEl.textContent = IDLE_STATUS_LINES[statusIdx];
}, 4500);

// ---------- Side rail bars (metallic, no icons/lines) ----------
// all content topics live on the left rail now; the right side is reserved
// for the chat drawer, which the orb opens directly (see openChat/closeChat below).
const leftTopics = [
  {id:'about',    label:'About'},
  {id:'resume',   label:'Resume'},
  {id:'projects', label:'Projects'},
  {id:'photos',   label:'Photos'},
  {id:'history',  label:'History'},
];

function makeBar(container, label, onActivate){
  const bar = document.createElement('button');
  bar.className = 'bar';
  bar.setAttribute('aria-label', 'Open ' + label);
  bar.onclick = (e) => { e.stopPropagation(); onActivate(); };
  bar.innerHTML = `<div class="tick"></div><div class="bar-label">${label}</div>`;
  container.appendChild(bar);
}
const railLeftEl = document.getElementById('railLeft');
leftTopics.forEach(t => makeBar(railLeftEl, t.label, () => selectPanel(t.id)));
// two non-panel bars: the annotated systems view and the diagnostics HUD
makeBar(railLeftEl, 'Systems', () => toggleAnnotations());
makeBar(railLeftEl, 'Diag', () => toggleHud());

// ---------- Systems view: in-place annotations explaining the rendering ----------
const annotateLayer = document.getElementById('annotateLayer');
const annotateBackdrop = document.getElementById('annotateBackdrop');
let annotationsOn = false;

function toggleAnnotations(force){
  annotationsOn = force !== undefined ? force : !annotationsOn;
  annotateLayer.hidden = !annotationsOn;
  annotateBackdrop.classList.toggle('open', annotationsOn); // mobile-only backdrop — tap outside to close
  if(annotationsOn) setStatus('SYSTEMS VIEW — HOW THE RENDERING WORKS');
  else releaseStatus();
}

// ---------- Diagnostics HUD: live render stats, updated on a slow interval ----------
const hudPanel = document.getElementById('hudPanel');
const hudBackdrop = document.getElementById('hudBackdrop');
let hudOn = false;
const sessionStart = performance.now();

function toggleHud(force){
  hudOn = force !== undefined ? force : !hudOn;
  hudPanel.hidden = !hudOn;
  hudBackdrop.classList.toggle('open', hudOn); // mobile-only backdrop — tap outside to close
}

setInterval(() => {
  if(!hudOn) return;
  const fps = 1000 / HUD_STATS.frameMs;
  document.getElementById('hudFps').textContent = fps.toFixed(0);
  document.getElementById('hudFrame').textContent = HUD_STATS.frameMs.toFixed(1) + ' ms';
  document.getElementById('hudCalls').textContent = (HUD_STATS.fieldCalls + HUD_STATS.coreCalls) + ' /frame';
  document.getElementById('hudPoints').textContent = HUD_STATS.points.toLocaleString();
  document.getElementById('hudDpr').textContent = Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO) + 'x';
  document.getElementById('hudRes').textContent = window.innerWidth + '×' + window.innerHeight;
  const up = Math.floor((performance.now() - sessionStart) / 1000);
  document.getElementById('hudUptime').textContent =
    String(Math.floor(up / 60)).padStart(2, '0') + ':' + String(up % 60).padStart(2, '0');
  document.getElementById('hudConvos').textContent = localStorage.getItem('wmConvoCount') || '0';
}, 500);

// ---------- Global keyboard controls: ` toggles the HUD, Escape closes the
// topmost open layer (lightbox → resume → panel → chat → overlays) ----------
window.addEventListener('keydown', (e) => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  if((e.key === '`' || e.key === '~') && !typing){
    e.preventDefault();
    toggleHud();
    return;
  }
  if(e.key !== 'Escape') return;
  if(lightbox.classList.contains('open')) closeLightbox();
  else if(resumeModal.classList.contains('open')) closeResume();
  else if(infoPanel.classList.contains('open')) closePanel();
  else if(chatOpen) closeChat();
  else if(annotationsOn) toggleAnnotations(false);
  else if(hudOn) toggleHud(false);
});

const coreStage = document.getElementById('coreStage');
const infoPanel = document.getElementById('infoPanel');
const panelTitle = document.getElementById('panelTitle');
const tabTitles = { about:'About Me', resume:'Resume', projects:'Projects', photos:'Photos', history:'History' };

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    // Systems/Diag aren't tab-content panes inside this panel — they're
    // separate overlays — so jumping to them from here closes the panel
    // and opens the overlay instead of switching the visible pane.
    if(btn.dataset.action === 'systems'){ closePanel(); toggleAnnotations(true); }
    else if(btn.dataset.action === 'diag'){ closePanel(); toggleHud(true); }
    else setActiveTab(btn.dataset.tab);
  });
});

function setActiveTab(id){
  document.querySelectorAll('.tab-btn').forEach(b => {
    const active = b.dataset.tab === id;
    b.classList.toggle('active', active);
    if(active) b.scrollIntoView({ block:'nearest', inline:'center', behavior:'smooth' });
  });
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-'+id));
  panelTitle.textContent = tabTitles[id] || 'Info';
}

const panelBackdrop = document.getElementById('panelBackdrop');

// keyboard activation for role="button" elements (core stage, header actions)
document.querySelectorAll('[role="button"][tabindex]').forEach(el => {
  el.addEventListener('keydown', (e) => {
    if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.click(); }
  });
});

function selectPanel(id){
  toggleAnnotations(false); // the core (and its annotations) spin away with the panel open
  setStatus(id.toUpperCase() + ' MODULE ACTIVE');
  setActiveTab(id);
  coreStage.classList.add('spin-out');
  partField();
  setTimeout(() => {
    coreStage.classList.add('hidden');
    infoPanel.classList.add('open');
    panelBackdrop.classList.add('open');
  }, 650);
}
function closePanel(){
  infoPanel.classList.remove('open');
  panelBackdrop.classList.remove('open');
  coreStage.classList.remove('hidden');
  coreStage.classList.remove('spin-out');
  releaseStatus();
  partField();
  // the core's WebGL canvas can get resized to 0 while its container was
  // display:none (e.g. a video's fullscreen toggle firing a window resize
  // event mid-panel) — recompute its size now that it's visible again.
  requestAnimationFrame(coreResize);
}

// ---------- Chat drawer: unlike the content panels above, this never hides
// the orb — it stays visible and animating (idle/listening/speaking) the
// whole time you're talking to it. ----------
const chatDrawer = document.getElementById('chatDrawer');
let chatOpen = false;

function openChat(){
  if(chatOpen){ closeChat(); return; }
  chatOpen = true;
  chatDrawer.classList.add('open');
  coreStage.classList.add('chat-active');
  document.querySelectorAll('.rail').forEach(r => r.classList.add('chat-hidden'));
  setStatus('AI CONSOLE ACTIVE');
  partField();
}

function closeChat(){
  chatOpen = false;
  chatDrawer.classList.remove('open');
  coreStage.classList.remove('chat-active');
  document.querySelectorAll('.rail').forEach(r => r.classList.remove('chat-hidden'));
  releaseStatus();
  partField();
}

// ---------- Resume preview modal ----------
const resumeModal = document.getElementById('resumeModal');
const resumeBackdrop = document.getElementById('resumeBackdrop');
const resumeFrame = document.getElementById('resumeFrame');

function openResume(){
  // touch devices: let the link open the PDF in a new tab instead of our
  // fixed-size modal — the OS/browser's native PDF viewer gives real
  // pinch-zoom and page navigation, which a cramped iframe can't match
  if (matchMedia('(pointer: coarse)').matches) return true;
  resumeFrame.src = 'assets/resume.pdf';
  resumeModal.classList.add('open');
  resumeBackdrop.classList.add('open');
  return false;
}
function closeResume(){
  resumeModal.classList.remove('open');
  resumeBackdrop.classList.remove('open');
  resumeFrame.src = '';
}

// ---------- Photo lightbox: full, uncropped image (the grid crops to a
// square for a tidy layout, so this shows the whole photo on click) ----------
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');

function openLightbox(src, alt){
  lightboxImg.src = src;
  lightboxImg.alt = alt || '';
  lightbox.classList.add('open');
}
function closeLightbox(){
  lightbox.classList.remove('open');
}

// ---------- Chat logic ----------
const history = [];
const log = document.getElementById('log');

// Claude sometimes replies with markdown (**bold**, *italic*, # headers) —
// this is a plain-text log and a spoken voice, neither of which should show
// or say the raw symbols, so strip markdown formatting before use.
function stripMarkdown(text){
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`]/g, '');
}

function appendLine(role, text){
  const el = document.createElement('div');
  el.className = 'line ' + role;
  el.textContent = text;
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}

// same as appendLine, but the text becomes a real clickable link — used
// whenever a tool call wants to open a new tab (see executeToolCall below):
// window.open() called from deep inside an async stream is well past the
// original click's "user activation" window, so browsers silently swallow
// it as a blocked popup. A real <a> the visitor can click always works.
function appendLinkLine(role, text, url){
  const el = appendLine(role, '');
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.textContent = text;
  el.appendChild(a);
  return el;
}

// ---------- Agentic navigation: Claude decides to drive the UI via real tool
// calls (defined in api/chat.js). The backend streams a @@TOOL:{...}@@ marker
// inline with the text whenever the model invokes one; extractStreamText()
// below strips the markers out of the visible reply and executes them. ----------
function executeToolCall(call){
  if(call.name === 'open_github'){
    const url = 'https://github.com/WilliamHoman1';
    // best-effort direct open — succeeds in browsers lenient about gesture
    // timing, silently no-ops in strict ones (Safari, popup-blocked Chrome)
    const win = window.open(url, '_blank', 'noopener');
    if(win){
      appendLine('sys', '// Opening GitHub — github.com/WilliamHoman1');
    } else {
      appendLinkLine('sys', '// Tap to open GitHub — github.com/WilliamHoman1', url);
    }
    return;
  }
  if(call.name === 'open_section' && call.input && tabTitles[call.input.section]){
    const id = call.input.section;
    appendLine('sys', '// Navigating to ' + tabTitles[id] + '...');
    // the chat drawer and info panel share the same z-index/overlap region on
    // narrow viewports — leaving the drawer open put an opaque, click-eating
    // layer on top of the panel the AI just navigated to, so photos/resume
    // links inside it silently ate every tap.
    if(chatOpen) closeChat();
    if(infoPanel.classList.contains('open')){
      setActiveTab(id);
      setStatus(id.toUpperCase() + ' MODULE ACTIVE');
    } else {
      selectPanel(id);
    }
  }
}

// strips complete @@TOOL:{...}@@ markers from the streamed text (executing
// each exactly once, tracked by its position) and hides any partially
// arrived marker at the tail until its closing @@ shows up.
function extractStreamText(raw, executedAt){
  const re = /@@TOOL:(\{.*?\})@@/g;
  let out = '', last = 0, m;
  while((m = re.exec(raw))){
    out += raw.slice(last, m.index);
    last = m.index + m[0].length;
    if(!executedAt.has(m.index)){
      executedAt.add(m.index);
      try{ executeToolCall(JSON.parse(m[1])); }catch(e){ /* malformed marker — skip */ }
    }
  }
  let rest = raw.slice(last);
  const partial = rest.lastIndexOf('@@TOOL:');
  if(partial >= 0) rest = rest.slice(0, partial);
  return out + rest;
}

// index just past the last complete sentence in `text`, so speech can start
// on finished sentences while the rest of the reply is still streaming in
function sentenceBoundary(text){
  const re = /[.!?…]["')\]]*\s/g;
  let end = 0, m;
  while((m = re.exec(text))) end = m.index + m[0].length;
  return end;
}

// ---------- Conversation persistence: the chat survives page reloads and
// return visits (localStorage), so the AI "remembers" you ----------
const HISTORY_KEY = 'wmHistory';
const CONVO_COUNT_KEY = 'wmConvoCount';

function saveHistory(){
  try{ localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-40))); }catch(e){}
}

function clearConversation(){
  history.length = 0;
  try{ localStorage.removeItem(HISTORY_KEY); }catch(e){}
  log.innerHTML = '';
  appendLine('sys', '// Memory wiped. Ask me anything about William — background, skills, or projects.');
  if(chipRow) chipRow.classList.remove('hidden');
}

function emailTranscript(){
  if(!history.length){ appendLine('sys', '// Nothing to send yet — ask me something first.'); return; }
  const transcript = history
    .map(m => (m.role === 'user' ? 'Visitor: ' : 'WilliamAI: ') + stripMarkdown(m.content))
    .join('\n\n');
  const subject = encodeURIComponent('Conversation with WilliamAI');
  const body = encodeURIComponent(
    'Hi William,\n\nI just talked to your AI — here\'s our conversation:\n\n' + transcript + '\n\n'
  );
  window.location.href = 'mailto:williamhoman22@gmail.com?subject=' + subject + '&body=' + body;
}

async function send(){
  primeAudio(); // must run synchronously here, before the first await below,
                // or Safari/iOS will block the reply's audio.play() later
  const input = document.getElementById('input');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  hideChips();
  appendLine('you', text);

  history.push({role:'user', content:text});
  try{ localStorage.setItem(CONVO_COUNT_KEY, String((+localStorage.getItem(CONVO_COUNT_KEY) || 0) + 1)); }catch(e){}

  reactorPulse = 3.5;
  const typingEl = document.createElement('div');
  typingEl.className = 'line sys';
  typingEl.textContent = '// thinking...';
  log.appendChild(typingEl);
  log.scrollTop = log.scrollHeight;

  try{
    const res = await fetch('/api/chat', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ messages: history })
    });
    if(!res.ok){
      const data = await res.json().catch(() => ({}));
      typingEl.remove();
      appendLine('sys', '// Backend error: ' + (data.error || res.status) + '. Check ANTHROPIC_API_KEY is set in your deployment.');
      return;
    }

    // the backend streams the reply as plain-text chunks — render each chunk
    // into the same line as it arrives, so the AI visibly "types" its answer
    typingEl.remove();
    const aiEl = document.createElement('div');
    aiEl.className = 'line ai';
    log.appendChild(aiEl);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const executedTools = new Set();
    let rawReply = '';
    let spokenUpTo = 0;
    while(true){
      const { done, value } = await reader.read();
      if(done) break;
      rawReply += decoder.decode(value, { stream:true });
      const visible = stripMarkdown(extractStreamText(rawReply, executedTools));
      aiEl.textContent = visible;
      log.scrollTop = log.scrollHeight;
      // speak each sentence as soon as it completes, while the rest streams
      const boundary = sentenceBoundary(visible);
      if(boundary > spokenUpTo){
        enqueueSpeech(visible.slice(spokenUpTo, boundary));
        spokenUpTo = boundary;
      }
    }
    rawReply += decoder.decode();

    const visibleFinal = stripMarkdown(extractStreamText(rawReply, executedTools));
    if(!visibleFinal && executedTools.size){
      // pure tool call, no text — the "// Navigating to..." sys line already
      // told the visitor what happened, so drop the empty reply bubble
      aiEl.remove();
      history.push({role:'assistant', content: '(opened the requested section)'});
    } else {
      const cleanReply = visibleFinal || 'No response received.';
      aiEl.textContent = cleanReply;
      log.scrollTop = log.scrollHeight;
      if(cleanReply.length > spokenUpTo) enqueueSpeech(cleanReply.slice(spokenUpTo));
      history.push({role:'assistant', content: cleanReply});
    }
    saveHistory();
  }catch(err){
    typingEl.remove();
    appendLine('sys', '// Connection to backend failed. Is /api/chat deployed?');
  }finally{
    reactorPulse = 1;
  }
}

// ---------- Suggested question chips: one-tap starter prompts so first-time
// visitors (recruiters especially) don't face an empty input box ----------
const chipRow = document.getElementById('chipRow');

function askChip(text){
  document.getElementById('input').value = text;
  send();
}

function hideChips(){
  if(chipRow) chipRow.classList.add('hidden');
}

// ---------- Voice: speech-to-text input + text-to-speech replies ----------
const micBtn = document.getElementById('micBtn');
const voiceToggleBtn = document.getElementById('voiceToggle');
let voiceOutputEnabled = false; // opt-in — the user turns spoken replies on, not off
let listening = false;
let recognition = null;

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
if(SpeechRecognitionCtor){
  recognition = new SpeechRecognitionCtor();
  recognition.lang = 'en-US';
  recognition.interimResults = true; // show words live as they're recognized, not just the final phrase
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    let finalTranscript = '';
    let interimTranscript = '';
    for(let i = e.resultIndex; i < e.results.length; i++){
      const transcript = e.results[i][0].transcript;
      if(e.results[i].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }
    document.getElementById('input').value = finalTranscript || interimTranscript;
    if(finalTranscript){
      stopListening(); // resets the mic-reactive pulse before send() starts its own "thinking" pulse
      send();
    }
  };
  recognition.onerror = () => { stopListening(); };
  recognition.onend = () => { stopListening(); };
} else {
  micBtn.style.display = 'none'; // Safari/iOS has no SpeechRecognition support
}

// ---------- Mic-reactive pulse: while listening, the orb pulses with the
// actual volume of your voice (via an AnalyserNode on the raw mic stream),
// instead of just sitting in a static "listening" pose. ----------
let micStream = null, micAudioCtx = null, micAnalyser = null, micDataArray = null, micRafId = null;

function startMicAnalysis(){
  if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
  navigator.mediaDevices.getUserMedia({ audio:true }).then(stream => {
    if(!listening){ stream.getTracks().forEach(t => t.stop()); return; } // stopped while permission was pending
    micStream = stream;
    micAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = micAudioCtx.createMediaStreamSource(stream);
    micAnalyser = micAudioCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    source.connect(micAnalyser);
    micDataArray = new Uint8Array(micAnalyser.frequencyBinCount);
    pumpMicLevel();
  }).catch(() => { /* mic permission denied — recognition still works, just no amplitude pulse */ });
}

function pumpMicLevel(){
  if(!micAnalyser) return;
  micAnalyser.getByteTimeDomainData(micDataArray);
  let sumSq = 0;
  for(let i = 0; i < micDataArray.length; i++){
    const v = (micDataArray[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / micDataArray.length);
  reactorPulse = 1 + Math.min(rms * 9, 2.2);
  micRafId = requestAnimationFrame(pumpMicLevel);
}

function stopMicAnalysis(){
  if(micRafId){ cancelAnimationFrame(micRafId); micRafId = null; }
  if(!micStream && !micAudioCtx) return; // already stopped — leave reactorPulse alone
  if(micStream){ micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if(micAudioCtx){ micAudioCtx.close(); micAudioCtx = null; }
  micAnalyser = null;
  reactorPulse = 1;
}

function stopListening(){
  listening = false;
  micBtn.classList.remove('listening');
  reactorListening = false;
  stopMicAnalysis();
}

function toggleListening(){
  if(!recognition) return;
  if(listening){
    recognition.stop();
    stopListening();
    return;
  }
  try{
    recognition.start();
    listening = true;
    micBtn.classList.add('listening');
    reactorListening = true;
    startMicAnalysis();
    // primes the shared <audio> element/AudioContext now, within this real
    // click — the eventual reply's speak() call happens from an async
    // speech-recognition callback, which Safari/iOS won't treat as a gesture
    primeAudio();
  }catch(err){ /* recognition already running */ }
}

if(!('speechSynthesis' in window)){
  voiceToggleBtn.style.display = 'none';
}

// ---------- Voice picker: lets visitors choose which installed system voice speaks replies ----------
const voiceRow = document.getElementById('voiceRow');
const voiceSelect = document.getElementById('voiceSelect');
let selectedVoice = null;

// clearer, less "robotic" female voices, roughly in quality order across
// platforms (Chrome/Edge fetch the Google ones from the network, so they
// sound far more natural than the fully-offline OS voices below them).
const PREFERRED_VOICE_NAMES = [
  'Google US English',
  'Microsoft Aria Online (Natural) - English (United States)',
  'Microsoft Jenny Online (Natural) - English (United States)',
  'Samantha',
  'Microsoft Zira Desktop - English (United States)',
  'Google UK English Female',
];

function pickDefaultVoiceIndex(voices){
  for(const name of PREFERRED_VOICE_NAMES){
    const i = voices.findIndex(v => v.name === name);
    if(i >= 0) return i;
  }
  // fall back to any voice whose name flags itself as female
  const femaleIdx = voices.findIndex(v => /female/i.test(v.name) && v.lang && v.lang.startsWith('en'));
  if(femaleIdx >= 0) return femaleIdx;
  const enIdx = voices.findIndex(v => v.lang && v.lang.startsWith('en'));
  return enIdx >= 0 ? enIdx : 0;
}

function populateVoiceList(){
  if(!('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  if(!voices.length) return;

  voiceSelect.innerHTML = '';
  voices.forEach((v, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = v.name + (v.lang ? ' (' + v.lang + ')' : '');
    voiceSelect.appendChild(opt);
  });

  const idx = pickDefaultVoiceIndex(voices);
  voiceSelect.value = idx;
  selectedVoice = voices[idx];
}

if('speechSynthesis' in window){
  populateVoiceList();
  window.speechSynthesis.onvoiceschanged = populateVoiceList; // voice list loads async in some browsers
  voiceSelect.addEventListener('change', () => {
    selectedVoice = window.speechSynthesis.getVoices()[voiceSelect.value];
  });
} else {
  voiceRow.style.display = 'none';
}

// a single persistent <audio> element, reused for every reply, instead of
// `new Audio()` per call — Safari/iOS revoke a page's permission to call
// .play() programmatically once too much time (an await fetch(), in our
// case) has passed since the triggering click/tap. Priming THIS SAME element
// with a play()+pause() synchronously inside the click handler (see
// primeAudio() below) keeps it "unlocked" for later async .play() calls.
let currentAudio = new Audio();
let browserPulseDecayTimer = null;

// ---------- Speech-reactive pulse: while the AI is talking, the orb pulses
// with the actual amplitude of the audio (same RMS technique as the mic
// pulse above), so it visibly reacts syllable-to-syllable instead of just
// holding one flat "speaking" pose. ----------
let speakAudioCtx = null, speakAnalyser = null, speakDataArray = null, speakRafId = null;
let speakGraphReady = false; // createMediaElementSource can only be called once per <audio> element ever

// sets up the AnalyserNode graph on `currentAudio` once, and — critically —
// resumes/creates the AudioContext, which (like audio.play()) also requires
// a user-gesture context in Safari/iOS. Safe to call repeatedly.
function ensureSpeakGraph(){
  if(speakGraphReady) return true;
  try{
    if(!speakAudioCtx) speakAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = speakAudioCtx.createMediaElementSource(currentAudio);
    speakAnalyser = speakAudioCtx.createAnalyser();
    speakAnalyser.fftSize = 256;
    speakDataArray = new Uint8Array(speakAnalyser.frequencyBinCount);
    source.connect(speakAnalyser);
    speakAnalyser.connect(speakAudioCtx.destination);
    speakGraphReady = true;
  }catch(e){ /* amplitude analysis unavailable — flat pulse fallback in speak() */ }
  return speakGraphReady;
}

// call this synchronously from within a real click/tap handler (before any
// await) to "unlock" both the shared <audio> element and its AudioContext
// for later programmatic playback triggered from async code (fetch replies,
// speech-recognition callbacks) that no longer counts as a user gesture.
function primeAudio(){
  if(!voiceOutputEnabled) return;
  ensureSpeakGraph();
  if(speakAudioCtx && speakAudioCtx.state === 'suspended') speakAudioCtx.resume();
  // skip the play()+pause() unlock if a sentence is mid-playback — pausing it
  // would strand the speech queue waiting on an `ended` that never fires
  if(currentAudio.paused){
    currentAudio.play().catch(() => {});
    currentAudio.pause();
  }
}

function pumpSpeakLevel(){
  if(!speakAnalyser) return;
  speakAnalyser.getByteTimeDomainData(speakDataArray);
  let sumSq = 0;
  for(let i = 0; i < speakDataArray.length; i++){
    const v = (speakDataArray[i] - 128) / 128;
    sumSq += v * v;
  }
  const rms = Math.sqrt(sumSq / speakDataArray.length);
  reactorPulse = 1 + Math.min(rms * 10, 2.6);
  speakRafId = requestAnimationFrame(pumpSpeakLevel);
}

function stopSpeakAnalysis(){
  if(speakRafId){ cancelAnimationFrame(speakRafId); speakRafId = null; }
  reactorPulse = 1;
}

function toggleVoiceOutput(){
  voiceOutputEnabled = !voiceOutputEnabled;
  voiceToggleBtn.classList.toggle('muted', !voiceOutputEnabled);
  voiceToggleBtn.textContent = voiceOutputEnabled ? 'VOICE' : 'MUTED';
  if(!voiceOutputEnabled){
    speechQueue.length = 0;
    window.speechSynthesis.cancel();
    currentAudio.pause();
    stopSpeakAnalysis();
  }
}

// ---------- Streaming speech queue ----------
// Replies are spoken sentence-by-sentence as they stream in from Claude
// (send() enqueues each completed sentence), instead of waiting for the whole
// reply before any audio starts. Sentences play strictly in order through the
// single shared <audio> element. Primary voice is ElevenLabs via /api/tts
// (key stays server-side); on the first failure the whole session falls back
// to the browser's built-in speechSynthesis, which does its own queueing.
const speechQueue = [];
let speechActive = false;
let ttsAvailable = true;

function enqueueSpeech(text){
  if(!voiceOutputEnabled) return;
  const trimmed = text.trim();
  if(!trimmed) return;
  speechQueue.push(trimmed);
  pumpSpeechQueue();
}

async function pumpSpeechQueue(){
  if(speechActive) return;
  speechActive = true;
  while(speechQueue.length){
    const text = speechQueue.shift();
    if(!voiceOutputEnabled) continue;
    if(ttsAvailable){
      try{
        await playTTS(text);
        continue;
      }catch(err){
        ttsAvailable = false; // not configured / quota gone — browser voice for the rest of the session
      }
    }
    speakBrowser(text);
  }
  speechActive = false;
}

// fetches one sentence of ElevenLabs audio and resolves when playback ends,
// so the queue stays strictly ordered
function playTTS(text){
  return new Promise(async (resolve, reject) => {
    try{
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ text }),
      });
      if(!res.ok) throw new Error('tts unavailable');

      const blob = await res.blob();
      if(!voiceOutputEnabled){ resolve(); return; } // muted while fetching
      const url = URL.createObjectURL(blob);
      stopSpeakAnalysis();

      // route playback through an AnalyserNode so the orb pulses with the
      // real amplitude of the voice, syllable to syllable — falls back to a
      // flat pulse if the browser blocks the audio graph for any reason.
      const analysisReady = ensureSpeakGraph();

      currentAudio.src = url;
      currentAudio.onplay = () => { if(analysisReady) pumpSpeakLevel(); else reactorPulse = 2.4; };
      currentAudio.onended = () => { stopSpeakAnalysis(); URL.revokeObjectURL(url); resolve(); };
      currentAudio.onerror = () => { stopSpeakAnalysis(); URL.revokeObjectURL(url); resolve(); };
      currentAudio.onpause = () => { if(!voiceOutputEnabled){ URL.revokeObjectURL(url); resolve(); } };
      await currentAudio.play();
    }catch(err){
      reject(err);
    }
  });
}

// browser speechSynthesis fallback — it maintains its own utterance queue, so
// enqueued sentences still play in order without any extra bookkeeping
function speakBrowser(text){
  if(!('speechSynthesis' in window)) return;
  const utter = new SpeechSynthesisUtterance(text);
  if(selectedVoice) utter.voice = selectedVoice;
  utter.rate = 1.02;
  utter.pitch = 1.0;
  utter.onstart = () => { reactorPulse = 2.2; };
  // speechSynthesis exposes no amplitude data, but onboundary fires roughly
  // once per word/syllable — use it to fake a rhythmic pulse in sync with speech.
  utter.onboundary = () => {
    reactorPulse = 2.8;
    clearTimeout(browserPulseDecayTimer);
    browserPulseDecayTimer = setTimeout(() => { reactorPulse = 1.8; }, 90);
  };
  utter.onend = () => { clearTimeout(browserPulseDecayTimer); reactorPulse = 1; };
  window.speechSynthesis.speak(utter);
}

// ---------- Restore a previous conversation (memory across visits) ----------
(function restoreHistory(){
  try{
    const saved = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    if(!Array.isArray(saved) || !saved.length) return;
    saved.forEach(m => appendLine(m.role === 'user' ? 'you' : 'ai', stripMarkdown(String(m.content))));
    appendLine('sys', '// Previous session restored — I remember our conversation. "Clear" wipes my memory.');
    history.push(...saved);
    hideChips();
  }catch(e){ /* corrupted storage — start fresh */ }
})();
