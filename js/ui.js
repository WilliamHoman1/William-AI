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

// ---------- Chat logic ----------
const history = [];
const log = document.getElementById('log');

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
    const reply = data.reply || "No response received.";
    appendLine('ai', reply);
    history.push({role:'assistant', content:reply});
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
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  recognition.onresult = (e) => {
    document.getElementById('input').value = e.results[0][0].transcript;
    send();
  };
  recognition.onerror = () => { stopListening(); };
  recognition.onend = () => { stopListening(); };
} else {
  micBtn.style.display = 'none'; // Safari/iOS has no SpeechRecognition support
}

function stopListening(){
  listening = false;
  micBtn.classList.remove('listening');
  reactorListening = false;
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
  }catch(err){ /* recognition already running */ }
}

if(!('speechSynthesis' in window)){
  voiceToggleBtn.style.display = 'none';
}

// ---------- Voice picker: lets visitors choose which installed system voice speaks replies ----------
const voiceRow = document.getElementById('voiceRow');
const voiceSelect = document.getElementById('voiceSelect');
let selectedVoice = null;

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

  // default to an English voice if one exists, otherwise the browser's first voice
  const defaultIdx = voices.findIndex(v => v.lang && v.lang.startsWith('en'));
  const idx = defaultIdx >= 0 ? defaultIdx : 0;
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

function toggleVoiceOutput(){
  voiceOutputEnabled = !voiceOutputEnabled;
  voiceToggleBtn.classList.toggle('muted', !voiceOutputEnabled);
  voiceToggleBtn.textContent = voiceOutputEnabled ? 'VOICE' : 'MUTED';
  if(!voiceOutputEnabled) window.speechSynthesis.cancel();
}

function speak(text){
  if(!voiceOutputEnabled || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  if(selectedVoice) utter.voice = selectedVoice;
  utter.rate = 1.02;
  utter.pitch = 1.0;
  utter.onstart = () => { reactorPulse = 2.4; };
  utter.onend = () => { reactorPulse = 1; };
  window.speechSynthesis.speak(utter);
}
