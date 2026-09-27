const ICONS = ["🐶","🐱","🦊","🐼","🦁","🐨","🐸","🐵","🦄","🐷","🐙","🐳","🦋","🐝","🌸","🍉","🍩","🚀","🌈","🎈"];
const DIFF_LABEL = {easy:'ง่าย', medium:'ปานกลาง', hard:'ยาก'};
const LEVELS = {
  easy: [3,4,6],
  medium: [6,8,10],
  hard: [8,10,12]
};

let progress = loadProgress();
let curDiff = null, curLevelIdx = 0;
let cards = [], flipped = [], matchedCount = 0, moves = 0, timerId = null, seconds = 0, locked = false, paused = false;

const el = id => document.getElementById(id);
let screens = {};

function bindActivate(node, handler){
  node.addEventListener('click', handler);
  node.addEventListener('keydown', (e)=>{
    if(e.key === 'Enter' || e.key === ' '){
      e.preventDefault();
      handler();
    }
  });
}

function showScreen(name){
  Object.values(screens).forEach(s=>s.classList.remove('active'));
  screens[name].classList.add('active');
}

function gridDims(total){
  let cols = Math.ceil(Math.sqrt(total));
  while(total % cols !== 0) cols++;
  return { cols, rows: total/cols };
}

function loadProgress(){
  try{
    const raw = localStorage.getItem('mm-progress');
    return raw ? JSON.parse(raw) : { easy:1, medium:1, hard:1 };
  }catch(e){ return { easy:1, medium:1, hard:1 }; }
}
function saveProgress(){ try{ localStorage.setItem('mm-progress', JSON.stringify(progress)); }catch(e){} }
function bestKey(diff, idx){ return 'mm-best-'+diff+'-'+idx; }
function getBest(diff, idx){ try{ return localStorage.getItem(bestKey(diff,idx)); }catch(e){ return null; } }
function setBestIfNeeded(diff, idx){
  try{
    const v = getBest(diff, idx);
    if(!v || seconds < +v) localStorage.setItem(bestKey(diff, idx), seconds);
  }catch(e){}
}

function fmtTime(s){ const m=Math.floor(s/60), r=s%60; return m+':'+String(r).padStart(2,'0'); }

function beep(freq, dur){
  try{
    const ctx = beep.ctx || (beep.ctx = new (window.AudioContext||window.webkitAudioContext)());
    if(ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.type='sine';
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  }catch(e){}
}

function renderLevels(){
  el('levelsTitle').textContent = 'ระดับ' + DIFF_LABEL[curDiff];
  const grid = el('levelGrid');
  grid.innerHTML = '';
  const unlocked = progress[curDiff] || 1;
  LEVELS[curDiff].forEach((pairs, idx)=>{
    const isLocked = idx >= unlocked;
    const card = document.createElement('div');
    card.className = 'lvl-card' + (isLocked ? ' locked' : '');
    const best = getBest(curDiff, idx);
    card.innerHTML = `<div class="num">${isLocked ? '🔒' : idx+1}</div>` +
      (isLocked ? '' : `<div class="best">${best ? '⏱ '+fmtTime(+best) : pairs+' คู่'}</div>`);
    if(!isLocked){
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'ด่าน ' + (idx+1));
      bindActivate(card, ()=> startLevel(curDiff, idx));
    }
    grid.appendChild(card);
  });
}

function togglePause(state){
  paused = state;
  el('pauseOverlay').classList.toggle('show', state);
  if(state) clearInterval(timerId);
  else startTimerTick();
}

function startTimerTick(){
  clearInterval(timerId);
  timerId = setInterval(()=>{ seconds++; el('timeVal').textContent = fmtTime(seconds); }, 1000);
}

function startLevel(diff, idx){
  curDiff = diff; curLevelIdx = idx;
  el('gameTitle').textContent = 'ด่าน ' + (idx+1) + ' · ' + DIFF_LABEL[diff];
  const pairs = LEVELS[diff][idx];
  const chosen = ICONS.slice(0, pairs);
  let deck = [...chosen, ...chosen];
  for(let i=deck.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [deck[i],deck[j]] = [deck[j],deck[i]];
  }
  cards = deck.map((icon,id)=>({id, icon, flipped:false, matched:false}));
  flipped = []; matchedCount = 0; moves = 0; locked = false; paused = false;
  seconds = 0; el('timeVal').textContent = '0:00';
  el('winOverlay').classList.remove('show');
  el('pauseOverlay').classList.remove('show');
  const {cols} = gridDims(cards.length);
  el('board').style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
  buildBoard();
  showScreen('game');
  startTimerTick();
}

// สร้าง DOM การ์ดครั้งเดียวตอนเริ่มด่าน แล้วอัปเดต class บน element เดิม
// เพื่อให้ CSS transition/animation ตอนเปิด-ปิด-จับคู่ทำงานจริง (ไม่ rebuild ใหม่ทุกครั้ง)
function buildBoard(){
  const board = el('board');
  board.innerHTML = '';
  cards.forEach(c=>{
    const cardEl = document.createElement('div');
    cardEl.className = 'card';
    cardEl.innerHTML = `<div class="card-inner">
        <div class="face front">❓</div>
        <div class="face back">${c.icon}</div>
      </div>`;
    bindActivate(cardEl, ()=>onCardClick(c.id));
    board.appendChild(cardEl);
    c.el = cardEl;
    updateCardVisual(c);
  });
  updateStats();
}

function updateCardVisual(c){
  const cardEl = c.el;
  if(!cardEl) return;
  cardEl.classList.toggle('flipped', c.flipped && !c.matched);
  cardEl.classList.toggle('matched', c.matched);
  if(c.flipped || c.matched){
    cardEl.removeAttribute('tabindex');
    cardEl.removeAttribute('role');
    cardEl.removeAttribute('aria-label');
  } else {
    cardEl.tabIndex = 0;
    cardEl.setAttribute('role', 'button');
    cardEl.setAttribute('aria-label', 'เปิดการ์ด');
  }
}

function playOnce(cardEl, className){
  if(!cardEl) return;
  cardEl.classList.add(className);
  cardEl.addEventListener('animationend', ()=> cardEl.classList.remove(className), {once:true});
}

function updateStats(){
  el('pairsVal').textContent = `${matchedCount}/${cards.length/2}`;
  el('movesVal').textContent = moves;
}

function onCardClick(id){
  if(locked || paused) return;
  const card = cards.find(c=>c.id===id);
  if(!card || card.flipped || card.matched) return;
  card.flipped = true;
  updateCardVisual(card); // เริ่มแอนิเมชั่นเปิดการ์ด
  flipped.push(card);
  beep(520,.08);
  if(flipped.length === 2){
    moves++;
    locked = true;
    updateStats();
    const [a,b] = flipped;
    if(a.icon === b.icon){
      setTimeout(()=>{
        a.matched = true; b.matched = true;
        updateCardVisual(a); updateCardVisual(b);
        playOnce(a.el, 'match-anim'); playOnce(b.el, 'match-anim'); // แอนิเมชั่นเด้งตอนจับคู่ถูก
        matchedCount++; flipped = []; locked = false;
        beep(760,.15);
        updateStats();
        if(matchedCount === cards.length/2) onWin();
      }, 350);
    } else {
      playOnce(a.el, 'wrong-anim'); playOnce(b.el, 'wrong-anim'); // แอนิเมชั่นสั่นตอนจับคู่ผิด
      setTimeout(()=>{
        a.flipped = false; b.flipped = false;
        updateCardVisual(a); updateCardVisual(b); // แอนิเมชั่นปิดการ์ดกลับ
        flipped = []; locked = false;
        beep(220,.15);
      }, 700);
    }
  }
}

function onWin(){
  clearInterval(timerId);
  setBestIfNeeded(curDiff, curLevelIdx);
  const isLast = curLevelIdx >= LEVELS[curDiff].length - 1;
  if(!isLast && (progress[curDiff] || 1) <= curLevelIdx+1){
    progress[curDiff] = curLevelIdx + 2;
    saveProgress();
  }
  el('winTime').textContent = fmtTime(seconds);
  el('winMoves').textContent = moves;
  const btns = el('winButtons');
  btns.innerHTML = '';
  if(!isLast){
    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn'; nextBtn.textContent = '➡ ด่านต่อไป';
    nextBtn.addEventListener('click', ()=> startLevel(curDiff, curLevelIdx+1));
    btns.appendChild(nextBtn);
  }
  const retryBtn = document.createElement('button');
  retryBtn.className = 'btn ghost'; retryBtn.textContent = '🔁 เล่นด่านนี้ซ้ำ';
  retryBtn.addEventListener('click', ()=> startLevel(curDiff, curLevelIdx));
  btns.appendChild(retryBtn);
  const homeBtn = document.createElement('button');
  homeBtn.className = 'btn ghost'; homeBtn.textContent = '📋 หน้าเลือกด่าน';
  homeBtn.addEventListener('click', ()=>{ el('winOverlay').classList.remove('show'); showScreen('levels'); renderLevels(); });
  btns.appendChild(homeBtn);
  el('winOverlay').classList.add('show');
  beep(880,.2);
  setTimeout(()=>beep(1046,.25), 150);
}

function init(){
  screens = { diff: el('screenDifficulty'), levels: el('screenLevels'), game: el('screenGame') };

  document.querySelectorAll('.diff-btn').forEach(btn=>{
    bindActivate(btn, ()=>{
      curDiff = btn.dataset.diff;
      renderLevels();
      showScreen('levels');
    });
  });

  bindActivate(el('toDiffBtn'), ()=> showScreen('diff'));
  bindActivate(el('backBtn'), ()=>{ clearInterval(timerId); showScreen('levels'); renderLevels(); });
  bindActivate(el('pauseBtn'), ()=> togglePause(true));
  el('resumeBtn').addEventListener('click', ()=> togglePause(false));
  el('restartLevelBtn').addEventListener('click', ()=>{ el('pauseOverlay').classList.remove('show'); startLevel(curDiff, curLevelIdx); });
  el('pauseHomeBtn').addEventListener('click', ()=>{ el('pauseOverlay').classList.remove('show'); clearInterval(timerId); showScreen('diff'); });

  document.addEventListener('keydown', (e)=>{
    if(e.key !== 'Escape') return;
    if(el('pauseOverlay').classList.contains('show')){
      togglePause(false);
    } else if(el('winOverlay').classList.contains('show')){
      // ปล่อยให้ผู้เล่นกดปุ่มในป๊อปอัปเอง
    } else if(screens.game.classList.contains('active')){
      togglePause(true);
    } else if(screens.levels.classList.contains('active')){
      showScreen('diff');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
