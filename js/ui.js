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

function buildRail(container, topics){
  topics.forEach(t => {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.onclick = (e) => { e.stopPropagation(); selectPanel(t.id); };
    bar.innerHTML = `<div class="tick"></div><div class="bar-label">${t.label}</div>`;
    container.appendChild(bar);
  });
}
buildRail(document.getElementById('railLeft'), leftTopics);

const coreStage = document.getElementById('coreStage');
const infoPanel = document.getElementById('infoPanel');
const panelTitle = document.getElementById('panelTitle');
const tabTitles = { about:'About Me', resume:'Resume', projects:'Projects', photos:'Photos', history:'History' };

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
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

function selectPanel(id){
  document.getElementById('statusLine').textContent = id.toUpperCase() + ' MODULE ACTIVE';
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
  document.getElementById('statusLine').textContent = 'SYSTEMS ONLINE — TAP THE CORE TO TALK';
  partField();
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
  document.getElementById('statusLine').textContent = 'AI CONSOLE ACTIVE';
  partField();
}

function closeChat(){
  chatOpen = false;
  chatDrawer.classList.remove('open');
  coreStage.classList.remove('chat-active');
  document.querySelectorAll('.rail').forEach(r => r.classList.remove('chat-hidden'));
  document.getElementById('statusLine').textContent = 'SYSTEMS ONLINE — TAP THE CORE TO TALK';
  partField();
}

// ---------- Resume preview modal ----------
const resumeModal = document.getElementById('resumeModal');
const resumeBackdrop = document.getElementById('resumeBackdrop');
const resumeFrame = document.getElementById('resumeFrame');

function openResume(){
  resumeFrame.src = 'assets/resume.pdf';
  resumeModal.classList.add('open');
  resumeBackdrop.classList.add('open');
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
}

// ---------- Agent navigation: "go to williams projects", "open his github", etc. ----------
const NAV_KEYWORDS = {
  about:    ['about'],
  resume:   ['resume','cv'],
  projects: ['project'],
  photos:   ['photo','picture'],
  history:  ['history','timeline'],
};
const NAV_PHRASE = /\b(go to|open|show|take me to|navigate to|pull up|bring up)\b/;

function handleNavigation(text){
  const t = text.toLowerCase();
  if(!NAV_PHRASE.test(t)) return false;

  if(t.includes('github')){
    appendLine('sys', '// Opening GitHub — github.com/WilliamHoman1');
    window.open('https://github.com/WilliamHoman1', '_blank', 'noopener');
    return true;
  }

  for(const [id, keywords] of Object.entries(NAV_KEYWORDS)){
    if(keywords.some(k => t.includes(k))){
      appendLine('sys', '// Navigating to ' + tabTitles[id] + '...');
      if(infoPanel.classList.contains('open')){
        setActiveTab(id);
        document.getElementById('statusLine').textContent = id.toUpperCase() + ' MODULE ACTIVE';
      } else {
        selectPanel(id);
      }
      return true;
    }
  }
  return false;
}

async function send(){
  const input = document.getElementById('input');
  const text = input.value.trim();
  if(!text) return;
  input.value = '';
  appendLine('you', text);

  if(handleNavigation(text)) return;

  history.push({role:'user', content:text});

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
    const data = await res.json();
    typingEl.remove();
    if(!res.ok){
      appendLine('sys', '// Backend error: ' + (data.error || res.status) + '. Check ANTHROPIC_API_KEY is set in your deployment.');
      return;
    }
    const rawReply = data.reply || "No response received.";
    const reply = stripMarkdown(rawReply);
    appendLine('ai', reply);
    history.push({role:'assistant', content:rawReply});
    speak(reply);
  }catch(err){
    typingEl.remove();
    appendLine('sys', '// Connection to backend failed. Is /api/chat deployed?');
  }finally{
    reactorPulse = 1;
  }
}

// ---------- Voice: speech-to-text input + text-to-speech replies ----------
const micBtn = document.getElementById('micBtn');
const voiceToggleBtn = document.getElementById('voiceToggle');
let voiceOutputEnabled = true;
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

let currentAudio = null;
let browserPulseDecayTimer = null;

// ---------- Speech-reactive pulse: while the AI is talking, the orb pulses
// with the actual amplitude of the audio (same RMS technique as the mic
// pulse above), so it visibly reacts syllable-to-syllable instead of just
// holding one flat "speaking" pose. ----------
let speakAudioCtx = null, speakAnalyser = null, speakDataArray = null, speakRafId = null;

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
  speakAnalyser = null;
  reactorPulse = 1;
}

function toggleVoiceOutput(){
  voiceOutputEnabled = !voiceOutputEnabled;
  voiceToggleBtn.classList.toggle('muted', !voiceOutputEnabled);
  voiceToggleBtn.textContent = voiceOutputEnabled ? 'VOICE' : 'MUTED';
  if(!voiceOutputEnabled){
    window.speechSynthesis.cancel();
    if(currentAudio){ currentAudio.pause(); currentAudio = null; }
    stopSpeakAnalysis();
  }
}

// Primary voice: a specific chosen ElevenLabs voice, generated server-side via
// /api/tts (keeps the API key off the client). Falls back to the browser's
// built-in speechSynthesis voice if ElevenLabs isn't configured, fails, or
// the monthly quota has run out — so this degrades gracefully rather than
// going silent.
function speakBrowser(text){
  if(!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
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

async function speak(text){
  if(!voiceOutputEnabled) return;

  try{
    const res = await fetch('/api/tts', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ text }),
    });
    if(!res.ok) throw new Error('tts unavailable');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    if(currentAudio){ currentAudio.pause(); }
    stopSpeakAnalysis();
    const audio = new Audio(url);
    currentAudio = audio;

    // route playback through an AnalyserNode so the orb pulses with the
    // real amplitude of the voice, syllable to syllable — falls back to a
    // flat pulse if the browser blocks the audio graph for any reason.
    let analysisReady = false;
    try{
      if(!speakAudioCtx) speakAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if(speakAudioCtx.state === 'suspended') await speakAudioCtx.resume();
      const source = speakAudioCtx.createMediaElementSource(audio);
      speakAnalyser = speakAudioCtx.createAnalyser();
      speakAnalyser.fftSize = 256;
      speakDataArray = new Uint8Array(speakAnalyser.frequencyBinCount);
      source.connect(speakAnalyser);
      speakAnalyser.connect(speakAudioCtx.destination);
      analysisReady = true;
    }catch(e){ /* amplitude analysis unavailable — flat pulse fallback below */ }

    audio.onplay = () => { if(analysisReady) pumpSpeakLevel(); else reactorPulse = 2.4; };
    audio.onended = () => { stopSpeakAnalysis(); URL.revokeObjectURL(url); };
    audio.onerror = () => { stopSpeakAnalysis(); URL.revokeObjectURL(url); };
    if(!voiceOutputEnabled) return; // muted while we were fetching
    await audio.play();
  }catch(err){
    speakBrowser(text); // ElevenLabs not configured / request failed / quota used up
  }
}
