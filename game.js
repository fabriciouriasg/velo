// ═══════════════════════════════════════════
//  SERVICE WORKER
// ═══════════════════════════════════════════
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(()=>{});
  });
}

// ═══════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════
const PROFILE_COLORS = ['#00A3E0','#FF6B00','#FCD116','#06D6A0','#CC00FF','#FF006E'];
const TRAIL_COLORS   = ['#FCD116','#00A3E0','#FF6B00','#06D6A0','#FF006E','#CC00FF','#FFFFFF','#FF4D00'];
const PLAYER_SHAPES  = ['circle','diamond','triangle','star'];
const ENEMY_SHAPES   = ['hexagon','square','triangle'];
const BG_OPTIONS     = ['#111111','#0a1628','#1a0a28','#081a08','#1a1208','#0a0a1a'];
const MAX_PROFILES   = 3;
const MAX_PHOTOS     = 15;
const CELL           = 8;
const HUD_H          = 44;

// ═══════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════
let db;
let profiles      = [];
let activeProfile = null;  // full profile object
let obNewProfile  = {};    // profile being built in onboarding
let G             = {};    // game state
let selectedPhotoId = null;
let setupMode     = 'free';
let setupSpeed    = 'normal';
let paused        = false;

// ═══════════════════════════════════════════
//  INDEXEDDB  (stores: profiles, scores)
// ═══════════════════════════════════════════
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('VeloDB', 3);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('profiles'))
        d.createObjectStore('profiles', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('scores'))
        d.createObjectStore('scores', { keyPath: 'id', autoIncrement: true });
    };
    req.onsuccess  = e => { db = e.target.result; res(db); };
    req.onerror    = () => rej(req.error);
  });
}
const dbTx = (store, mode='readonly') => db.transaction(store, mode).objectStore(store);
const dbGet    = (store, key)  => new Promise((r,j) => { const q=dbTx(store).get(key); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const dbPut    = (store, data) => new Promise((r,j) => { const q=dbTx(store,'readwrite').put(data); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const dbDelete = (store, key)  => new Promise((r,j) => { const q=dbTx(store,'readwrite').delete(key); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });
const dbAll    = (store)       => new Promise((r,j) => { const q=dbTx(store).getAll(); q.onsuccess=()=>r(q.result); q.onerror=()=>j(q.error); });
const dbClear  = (store)       => new Promise((r,j) => { const q=dbTx(store,'readwrite').clear(); q.onsuccess=()=>r(); q.onerror=()=>j(q.error); });

function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

// ═══════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if (id === 'homeScreen')    renderHome();
  if (id === 'albumScreen')   renderAlbum();
  if (id === 'scoresScreen')  renderScores();
  if (id === 'photoManage')   renderManage();
  if (id === 'profileSelect') renderProfileSelect();
}

// ═══════════════════════════════════════════
//  SPLASH
// ═══════════════════════════════════════════
async function initApp() {
  await openDB();
  profiles = await dbAll('profiles');

  // Animate splash bar
  const fill = document.getElementById('splashFill');
  fill.style.width = '60%';
  await sleep(500);
  fill.style.width = '100%';
  await sleep(600);

  if (profiles.length === 0) {
    startOnboarding(true);
  } else {
    const saved = localStorage.getItem('velo_active_profile');
    const found = profiles.find(p => p.id === saved);
    if (found) {
      activeProfile = found;
      showScreen('homeScreen');
    } else if (profiles.length === 1) {
      // Only one profile — auto-select it
      activeProfile = profiles[0];
      localStorage.setItem('velo_active_profile', profiles[0].id);
      showScreen('homeScreen');
    } else {
      showScreen('profileSelect');
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═══════════════════════════════════════════
//  PROFILE SELECT
// ═══════════════════════════════════════════
function renderProfileSelect() {
  const container = document.getElementById('profileCards');
  container.innerHTML = '';

  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card' + (activeProfile?.id === p.id ? ' active-profile' : '');
    card.innerHTML = `
      ${avatarHTML(p, 48)}
      <div class="p-info">
        <div class="p-name">${p.name}</div>
        <div class="p-stats">Nv.${p.level||1} · ${(p.totalScore||0).toLocaleString()} pts · ${p.photos?.length||0} fotos</div>
      </div>
      ${activeProfile?.id === p.id ? '<div class="p-indicator"></div>' : ''}
    `;
    card.onclick = () => selectProfile(p.id);

    // Long press to delete
    let pressTimer;
    card.addEventListener('touchstart', () => { pressTimer = setTimeout(() => deleteProfileConfirm(p.id), 800); }, {passive:true});
    card.addEventListener('touchend',   () => clearTimeout(pressTimer), {passive:true});
    card.addEventListener('touchmove',  () => clearTimeout(pressTimer), {passive:true});

    container.appendChild(card);
  });

  if (profiles.length < MAX_PROFILES) {
    const add = document.createElement('div');
    add.className = 'profile-card add-card';
    add.innerHTML = `<span>+ NUEVO PERFIL</span>`;
    add.onclick = () => startOnboarding(false);
    container.appendChild(add);
  }
}

function avatarHTML(p, size=48) {
  if (p.avatar) {
    return `<img class="p-avatar" src="${p.avatar}" style="width:${size}px;height:${size}px;" alt="">`;
  }
  const color = PROFILE_COLORS[profiles.indexOf(p) % PROFILE_COLORS.length] || p.profileColor || '#00A3E0';
  const initial = (p.name||'?')[0].toUpperCase();
  return `<div class="p-avatar-init" style="width:${size}px;height:${size}px;background:${color}22;color:${color};">${initial}</div>`;
}

async function selectProfile(id) {
  activeProfile = profiles.find(p => p.id === id);
  localStorage.setItem('velo_active_profile', id);
  showScreen('homeScreen');
}

async function deleteProfileConfirm(id) {
  const p = profiles.find(x => x.id === id);
  if (!confirm(`¿Eliminar el perfil de ${p.name}? Se borrarán sus fotos y estadísticas.`)) return;
  await dbDelete('profiles', id);
  profiles = await dbAll('profiles');
  if (activeProfile?.id === id) {
    activeProfile = null;
    localStorage.removeItem('velo_active_profile');
  }
  renderProfileSelect();
  if (profiles.length === 0) startOnboarding(true);
}

// ═══════════════════════════════════════════
//  ONBOARDING
// ═══════════════════════════════════════════
function startOnboarding(isFirst) {
  obNewProfile = {
    id: genId(),
    name: '',
    avatar: null,
    trailColor: TRAIL_COLORS[0],
    playerShape: 'circle',
    enemyShape: 'hexagon',
    bgColor: BG_OPTIONS[0],
    photos: [],
    level: 1,
    totalScore: 0,
    stats: { played:0, wins:0, avgPct:0, maxLevel:1 }
  };
  // Go to onboarding screen
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('onboarding').classList.add('active');
  // Activate step 1
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.getElementById('obStep1').classList.add('active');
  document.getElementById('obName').value = '';

  // Build color grid
  buildColorGrid();
  buildShapeGrid();
  buildObPhotoGrid();
}

function buildColorGrid() {
  const grid = document.getElementById('trailColorGrid');
  grid.innerHTML = '';
  TRAIL_COLORS.forEach((c, i) => {
    const d = document.createElement('div');
    d.className = 'color-opt' + (i===0 ? ' selected' : '');
    d.style.background = c;
    d.onclick = () => {
      document.querySelectorAll('.color-opt').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
      obNewProfile.trailColor = c;
    };
    grid.appendChild(d);
  });
}

const SHAPE_SVG = {
  circle:   `<svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="12" fill="#00A3E0"/></svg>`,
  diamond:  `<svg viewBox="0 0 32 32"><polygon points="16,2 30,16 16,30 2,16" fill="#FCD116"/></svg>`,
  triangle: `<svg viewBox="0 0 32 32"><polygon points="16,2 30,28 2,28" fill="#FF6B00"/></svg>`,
  star:     `<svg viewBox="0 0 32 32"><polygon points="16,2 19.5,12 30,12 21.5,18.5 24.5,29 16,23 7.5,29 10.5,18.5 2,12 12.5,12" fill="#06D6A0"/></svg>`,
  hexagon:  `<svg viewBox="0 0 32 32"><polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill="#FF006E"/></svg>`,
  square:   `<svg viewBox="0 0 32 32"><rect x="4" y="4" width="24" height="24" rx="3" fill="#CC00FF"/></svg>`,
};

function buildShapeGrid() {
  const pg = document.getElementById('playerShapeGrid');
  pg.innerHTML = '';
  PLAYER_SHAPES.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'shape-opt' + (i===0 ? ' selected' : '');
    d.innerHTML = SHAPE_SVG[s] || '';
    d.onclick = () => {
      document.querySelectorAll('#playerShapeGrid .shape-opt').forEach(x => x.classList.remove('selected'));
      d.classList.add('selected');
      obNewProfile.playerShape = s;
    };
    pg.appendChild(d);
  });
}

function buildObPhotoGrid() {
  const grid = document.getElementById('obPhotoGrid');
  grid.innerHTML = '';
  for (let i = 0; i < MAX_PHOTOS; i++) {
    const ph = obNewProfile.photos[i];
    if (ph) {
      const img = document.createElement('img');
      img.className = 'photo-mini';
      img.src = ph.dataURL;
      const btn = document.createElement('button');
      btn.className = 'photo-mini-del';
      btn.textContent = '×';
      btn.onclick = (e) => { e.stopPropagation(); obNewProfile.photos.splice(i,1); buildObPhotoGrid(); updateObPhotoCount(); };
      const wrap = document.createElement('div');
      wrap.style.position = 'relative';
      wrap.appendChild(img);
      wrap.appendChild(btn);
      grid.appendChild(wrap);
    } else {
      const empty = document.createElement('div');
      empty.className = 'photo-mini empty';
      grid.appendChild(empty);
    }
  }
}

function updateObPhotoCount() {
  const n = obNewProfile.photos.length;
  const sub = document.getElementById('obPhotoSub');
  const btn = document.getElementById('obBtn5');
  const countEl = document.getElementById('obUploadCount');
  sub.textContent = `${n} / ${MAX_PHOTOS} fotos cargadas${n >= MAX_PHOTOS ? ' — ¡Completo!' : ' — puedes agregar más después'}`;
  countEl.textContent = n >= MAX_PHOTOS ? '✓ ¡Álbum completo!' : n > 0 ? `${MAX_PHOTOS - n} más disponibles` : 'Toca para agregar fotos';
  btn.disabled = n < 1;
  btn.textContent = n >= MAX_PHOTOS ? 'EMPEZAR A JUGAR ▶' : n > 0 ? `JUGAR CON ${n} FOTOS ▶` : 'AGREGA AL MENOS 1 FOTO';
}

async function handleObPhotos(files) {
  const remaining = MAX_PHOTOS - obNewProfile.photos.length;
  const toAdd = Array.from(files).slice(0, remaining);
  for (const f of toAdd) {
    const dataURL = await fileToDataURL(f);
    obNewProfile.photos.push({ id: genId(), dataURL });
  }
  buildObPhotoGrid();
  updateObPhotoCount();
}

async function handleAvatar(input) {
  if (!input.files[0]) return;
  const dataURL = await fileToDataURL(input.files[0]);
  obNewProfile.avatar = dataURL;
  const preview = document.getElementById('avatarPreview');
  preview.innerHTML = `<img src="${dataURL}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;"><div class="avatar-overlay">CAMBIAR</div>`;
  preview.onclick = () => document.getElementById('avatarInput').click();
}

function obBack(step) {
  if (step === 1) {
    if (profiles.length > 0) showScreen('profileSelect');
    return;
  }
  goToObStep(step - 1);
}

function obNext(step) {
  if (step === 1) {
    const name = document.getElementById('obName').value.trim();
    if (!name) { document.getElementById('obName').focus(); return; }
    obNewProfile.name = name;
    // Set avatar initial color
    const idx = profiles.length % PROFILE_COLORS.length;
    obNewProfile.profileColor = PROFILE_COLORS[idx];
    // Update avatar preview initial
    document.getElementById('avatarInit').textContent = name[0].toUpperCase();
    document.getElementById('avatarInit').style.color = obNewProfile.profileColor;
  }
  if (step === 5) { saveNewProfile(); return; }
  goToObStep(step + 1);
}

function goToObStep(n) {
  document.querySelectorAll('.ob-step').forEach(s => s.classList.remove('active'));
  document.getElementById(`obStep${n}`).classList.add('active');
}

async function saveNewProfile() {
  await dbPut('profiles', obNewProfile);
  profiles = await dbAll('profiles');
  // Reload fresh from DB to ensure data is correct
  activeProfile = profiles.find(p => p.id === obNewProfile.id) || obNewProfile;
  localStorage.setItem('velo_active_profile', activeProfile.id);
  showScreen('homeScreen');
}

// ═══════════════════════════════════════════
//  HOME
// ═══════════════════════════════════════════
function renderHome() {
  if (!activeProfile) return;
  document.getElementById('homeProfileName').textContent = activeProfile.name;
  document.getElementById('homeProfileLvl').textContent = `Nv.${activeProfile.level||1} · ${(activeProfile.totalScore||0).toLocaleString()} pts`;
  const wrap = document.getElementById('homeAvatar');
  wrap.innerHTML = '';
  if (activeProfile.avatar) {
    const img = document.createElement('img');
    img.className = 'p-avatar';
    img.src = activeProfile.avatar;
    img.style.cssText = 'width:34px;height:34px;';
    wrap.appendChild(img);
  } else {
    const init = document.createElement('div');
    init.className = 'p-avatar-init';
    init.style.cssText = `width:34px;height:34px;font-size:13px;background:${activeProfile.profileColor}22;color:${activeProfile.profileColor};`;
    init.textContent = activeProfile.name[0].toUpperCase();
    wrap.appendChild(init);
  }
}

// ═══════════════════════════════════════════
//  ALBUM
// ═══════════════════════════════════════════
function getPhotos() { return activeProfile?.photos || []; }

function renderAlbum() {
  if (!activeProfile) return;
  const photos = getPhotos();
  const grid = document.getElementById('albumGrid');
  const countEl = document.getElementById('albumCount');
  const playBtn = document.getElementById('albumPlayBtn');
  grid.innerHTML = '';
  countEl.textContent = `${photos.length}/${MAX_PHOTOS}`;
  // Auto-select first photo if none selected or selected not in album
  if (photos.length > 0 && !photos.find(p => p.id === selectedPhotoId)) {
    selectedPhotoId = photos[0].id;
  }

  photos.forEach(p => {
    const wrap = document.createElement('div');
    wrap.className = 'album-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'album-thumb' + (p.id === selectedPhotoId ? ' selected' : '');
    img.src = p.dataURL;
    img.onclick = () => { selectedPhotoId = p.id; renderAlbum(); };
    wrap.appendChild(img);
    grid.appendChild(wrap);
  });

  // Add slot if < 15
  if (photos.length < MAX_PHOTOS) {
    const add = document.createElement('div');
    add.className = 'album-add';
    add.innerHTML = `<span style="font-size:22px;opacity:0.4;">+</span><span>AGREGAR</span>`;
    add.onclick = () => document.getElementById('albumFileInput').click();
    grid.appendChild(add);
  }

  playBtn.disabled = !selectedPhotoId;
}

async function handleAlbumFiles(files) {
  const photos = getPhotos();
  const remaining = MAX_PHOTOS - photos.length;
  for (const f of Array.from(files).slice(0, remaining)) {
    const dataURL = await fileToDataURL(f);
    activeProfile.photos.push({ id: genId(), dataURL });
  }
  await dbPut('profiles', activeProfile);
  renderAlbum();
}

// Photo manage screen
function renderManage() {
  if (!activeProfile) return;
  const photos = getPhotos();
  const grid = document.getElementById('manageGrid');
  const countEl = document.getElementById('manageCount');
  grid.innerHTML = '';
  countEl.textContent = `${photos.length}/${MAX_PHOTOS}`;

  photos.forEach((p, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'album-thumb-wrap';
    const img = document.createElement('img');
    img.className = 'album-thumb';
    img.src = p.dataURL;
    const del = document.createElement('button');
    del.className = 'album-del';
    del.textContent = '×';
    del.onclick = async () => {
      activeProfile.photos.splice(i, 1);
      if (selectedPhotoId === p.id) selectedPhotoId = null;
      await dbPut('profiles', activeProfile);
      renderManage();
    };
    wrap.appendChild(img);
    wrap.appendChild(del);
    grid.appendChild(wrap);
  });

  if (photos.length < MAX_PHOTOS) {
    const add = document.createElement('div');
    add.className = 'album-add';
    add.innerHTML = `<span style="font-size:22px;opacity:0.4;">+</span><span>AGREGAR</span>`;
    add.onclick = () => document.getElementById('manageFileInput').click();
    grid.appendChild(add);
  }
}

async function handleManageFiles(files) {
  const photos = getPhotos();
  const remaining = MAX_PHOTOS - photos.length;
  for (const f of Array.from(files).slice(0, remaining)) {
    const dataURL = await fileToDataURL(f);
    activeProfile.photos.push({ id: genId(), dataURL });
  }
  await dbPut('profiles', activeProfile);
  renderManage();
}

function goToSetup() {
  if (!selectedPhotoId) return;
  const photo = getPhotos().find(p => p.id === selectedPhotoId);
  document.getElementById('selectedPreview').src = photo.dataURL;
  setupMode = 'free';
  setupSpeed = 'normal';
  showScreen('setupScreen');
}

// ═══════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════
function selectMode(el, mode) {
  document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  setupMode = mode;
}

function selectSpeed(el, spd) {
  document.querySelectorAll('.speed-pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  setupSpeed = spd;
}

// ═══════════════════════════════════════════
//  GAME INIT
// ═══════════════════════════════════════════
function startGame() {
  const targetPct = parseInt(document.getElementById('pctSlider').value);
  const photo = getPhotos().find(p => p.id === selectedPhotoId);
  G = {
    profile:    activeProfile,
    targetPct,
    photo:      photo.dataURL,
    mode:       setupMode,
    speed:      setupSpeed,
    level:      1,
    lives:      3,
    score:      0,
    totalScore: 0,
    timeLeft:   setupMode !== 'free' ? parseInt(setupMode) : null,
    timerInterval: null,
  };
  showScreen('gameScreen');
  initCanvas();
}

function nextLevel() {
  document.getElementById('winOverlay').classList.remove('active');
  G.level++;
  G.lives = 3;
  G.score = 0;
  // Random photo from album
  const photos = getPhotos();
  const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
  G.photo = randomPhoto.dataURL;
  initCanvas();
}

function endGame() {
  if (animId) cancelAnimationFrame(animId);
  if (G.timerInterval) clearInterval(G.timerInterval);
  paused = false;
  showScreen('homeScreen');
  G = {};
}

async function saveAndMenu() {
  const score = {
    name:  activeProfile.name,
    score: G.totalScore,
    level: G.level,
    mode:  G.mode,
    date:  new Date().toISOString(),
    profileId: activeProfile.id,
  };
  await dbPut('scores', score);
  // Update profile stats
  activeProfile.totalScore = Math.max(activeProfile.totalScore || 0, G.totalScore);
  activeProfile.level = Math.max(activeProfile.level || 1, G.level);
  activeProfile.stats = activeProfile.stats || {};
  activeProfile.stats.played = (activeProfile.stats.played || 0) + 1;
  activeProfile.stats.maxLevel = Math.max(activeProfile.stats.maxLevel || 1, G.level);
  await dbPut('profiles', activeProfile);
  profiles = await dbAll('profiles');
  endGame();
}

// ═══════════════════════════════════════════
//  CANVAS ENGINE
// ═══════════════════════════════════════════
let canvas, ctx, animId;
let grid, gridW, gridH;
let player, enemies, trail, isDrawing;
let gameImg;
const SPEED_MAP = { slow: 70, normal: 55, fast: 38 };

function initCanvas() {
  if (animId) cancelAnimationFrame(animId);
  if (G.timerInterval) clearInterval(G.timerInterval);
  paused = false;

  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');

  const screenW = window.innerWidth;
  const screenH = window.innerHeight - HUD_H;
  gridW = Math.floor(screenW / CELL);
  gridH = Math.floor(screenH / CELL);
  canvas.width  = gridW * CELL;
  canvas.height = gridH * CELL;
  canvas.style.marginTop = HUD_H + 'px';

  grid = new Uint8Array(gridW * gridH).fill(0);
  for (let x = 0; x < gridW; x++) { setCell(x, 0, 2); setCell(x, gridH-1, 2); }
  for (let y = 0; y < gridH; y++) { setCell(0, y, 2); setCell(gridW-1, y, 2); }

  player = { gx:1, gy:0, dx:0, dy:0, moving:false };
  trail = []; isDrawing = false;

  const numEnemies  = Math.min(1 + Math.floor((G.level-1)/2), 5);
  const speedMult   = 1 + (G.level-1) * 0.05;
  const eColors = ['#FF006E','#FF4D00','#CC00FF','#FF9500','#00FF9F'];
  enemies = [];
  for (let i = 0; i < numEnemies; i++) {
    enemies.push({
      x: (3 + Math.floor(Math.random()*(gridW-6)))*CELL,
      y: (3 + Math.floor(Math.random()*(gridH-6)))*CELL,
      vx: (Math.random()<0.5?1:-1)*(1.4+Math.random()*0.8)*speedMult,
      vy: (Math.random()<0.5?1:-1)*(1.4+Math.random()*0.8)*speedMult,
      size:10, angle:Math.random()*Math.PI*2,
      color:eColors[i%eColors.length], hitCooldown:0,
    });
  }

  // Timer mode
  if (G.mode !== 'free') {
    G.timeLeft = parseInt(G.mode);
    G.timerInterval = setInterval(() => {
      if (paused) return;
      G.timeLeft--;
      updateHUD();
      if (G.timeLeft <= 0) {
        clearInterval(G.timerInterval);
        cancelAnimationFrame(animId);
        if(G.isVersus){
          versusRoundEnd(getCapturedPct(), G.totalScore);
          return;
        }
        document.getElementById('loseScore').textContent = G.totalScore.toLocaleString();
        document.getElementById('loseLevel').textContent = G.level;
        document.getElementById('loseOverlay').classList.add('active');
      }
    }, 1000);
  }

  gameImg = new Image();
  gameImg.onload = () => {
    renderHudAvatar();
    updateHUD();
    setupSwipe();
    lastTime = 0; tickAcc = 0;
    animId = requestAnimationFrame(gameLoop);
  };
  gameImg.src = G.photo;

  document.getElementById('winOverlay').classList.remove('active');
  document.getElementById('loseOverlay').classList.remove('active');
  document.getElementById('pauseOverlay').classList.remove('active');
  const hint = document.getElementById('swipeHint');
  hint.style.opacity = '1';
  setTimeout(() => hint.style.opacity = '0', 3000);
}

function renderHudAvatar() {
  const wrap = document.getElementById('hudAvatarWrap');
  wrap.innerHTML = '<div class="hud-label">YO</div>';
  const p = G.profile;
  if (!p) return;
  if (p.avatar) {
    const img = document.createElement('img');
    img.className = 'hud-avatar';
    img.src = p.avatar;
    wrap.appendChild(img);
  } else {
    const d = document.createElement('div');
    d.className = 'hud-avatar-init';
    d.style.cssText = `background:${p.profileColor||'#00A3E0'}22;color:${p.profileColor||'#00A3E0'};`;
    d.textContent = (p.name||'?')[0].toUpperCase();
    wrap.appendChild(d);
  }
}

function setCell(x,y,v){ if(x>=0&&x<gridW&&y>=0&&y<gridH) grid[y*gridW+x]=v; }
function getCell(x,y)  { if(x<0||x>=gridW||y<0||y>=gridH) return -1; return grid[y*gridW+x]; }

// ── SWIPE ──
let touchStart = null;
function setupSwipe() {
  const old = canvas.cloneNode(false);
  canvas.parentNode.replaceChild(old, canvas);
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  canvas.style.marginTop = HUD_H + 'px';

  canvas.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    touchStart = { x:t.clientX, y:t.clientY };
  }, {passive:false});
  canvas.addEventListener('touchend', e => {
    e.preventDefault();
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx)<10 && Math.abs(dy)<10) return;
    if (Math.abs(dx)>Math.abs(dy)) setDir(dx>0?1:-1,0);
    else setDir(0,dy>0?1:-1);
  }, {passive:false});
}

function setDir(dx,dy){ player.dx=dx; player.dy=dy; player.moving=true; }
window.addEventListener('keydown', e => {
  const m={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(m[e.key]){setDir(...m[e.key]);e.preventDefault();}
  if(e.key==='Escape') togglePause();
});

// ── PAUSE ──
function togglePause() {
  paused = !paused;
  document.getElementById('pauseBtn').textContent = paused ? '▶' : '⏸';
  document.getElementById('pauseOverlay').classList.toggle('active', paused);
}

// ── LOOP ──
let lastTime=0, tickAcc=0;
function gameLoop(ts) {
  animId = requestAnimationFrame(gameLoop);
  if (paused) return;
  const dt = lastTime ? ts - lastTime : 16;
  lastTime = ts;
  tickAcc += dt;
  moveEnemies(dt);
  const tickMs = SPEED_MAP[G.speed] || 55;
  if (tickAcc >= tickMs) { tickAcc -= tickMs; if(player.moving) movePlayer(); }
  draw();
  updateHUD();
}

function movePlayer() {
  const nx = player.gx + player.dx;
  const ny = player.gy + player.dy;
  if (nx<0||nx>=gridW||ny<0||ny>=gridH){ player.moving=false; return; }
  const cell = getCell(nx,ny);
  if (isDrawing) {
    if (trail.some(t=>t.x===nx&&t.y===ny&&!(nx===trail[0].x&&ny===trail[0].y))){ loseLife(); return; }
    if (cell===2||cell===1) {
      trail.push({x:nx,y:ny});
      fillRegion(); isDrawing=false; trail=[];
      player.gx=nx; player.gy=ny;
      checkWin(); return;
    }
    setCell(nx,ny,3); trail.push({x:nx,y:ny});
    player.gx=nx; player.gy=ny;
  } else {
    if (cell===0) {
      isDrawing=true;
      trail=[{x:player.gx,y:player.gy}];
      setCell(nx,ny,3); trail.push({x:nx,y:ny});
    }
    player.gx=nx; player.gy=ny;
  }
}

function fillRegion() {
  trail.forEach(t=>setCell(t.x,t.y,2));
  const mark = new Uint8Array(gridW*gridH).fill(0);
  const queue = [];
  enemies.forEach(en => {
    const ex=Math.floor(en.x/CELL), ey=Math.floor(en.y/CELL);
    const idx=ey*gridW+ex;
    if(ex>=0&&ex<gridW&&ey>=0&&ey<gridH&&grid[idx]===0&&!mark[idx]){
      mark[idx]=1; queue.push({x:ex,y:ey});
    }
  });
  while(queue.length){
    const{x,y}=queue.pop();
    for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,ny=y+dy;
      if(nx<0||nx>=gridW||ny<0||ny>=gridH) continue;
      const i=ny*gridW+nx;
      if(mark[i]||grid[i]!==0) continue;
      mark[i]=1; queue.push({x:nx,y:ny});
    }
  }
  let cells=0;
  for(let i=0;i<grid.length;i++) if(grid[i]===0&&!mark[i]){grid[i]=1;cells++;}
  const pts = cells*10*G.level;
  G.score+=pts; G.totalScore+=pts;
}

function getCapturedPct(){
  let tot=0,cap=0;
  for(let i=0;i<grid.length;i++){if(grid[i]!==2)tot++;if(grid[i]===1)cap++;}
  return tot?Math.floor(cap/tot*100):0;
}

function checkWin(){
  const pct=getCapturedPct();
  if(pct>=G.targetPct){
    cancelAnimationFrame(animId);
    if(G.timerInterval) clearInterval(G.timerInterval);
    if(G.isVersus){
      versusRoundEnd(pct, G.totalScore);
      return;
    }
    document.getElementById('winPct').textContent=pct+'%';
    document.getElementById('winScore').textContent=G.score.toLocaleString();
    document.getElementById('winTotal').textContent=G.totalScore.toLocaleString();
    document.getElementById('winOverlay').classList.add('active');
    dbPut('scores',{name:activeProfile.name,score:G.totalScore,level:G.level,mode:G.mode,date:new Date().toISOString(),profileId:activeProfile.id});
  }
}

function moveEnemies(dt){
  const spd=dt/16;
  enemies.forEach(en=>{
    en.x+=en.vx*spd; en.y+=en.vy*spd; en.angle+=0.05;
    if(en.hitCooldown>0) en.hitCooldown--;
    const hw=en.size*0.6;
    const gxL=Math.floor((en.x-hw)/CELL), gxR=Math.floor((en.x+hw)/CELL);
    const gyT=Math.floor((en.y-hw)/CELL), gyB=Math.floor((en.y+hw)/CELL);
    if([getCell(gxR,Math.floor(en.y/CELL)),getCell(gxL,Math.floor(en.y/CELL))].some(c=>c===1||c===2||c<0)){en.vx*=-1;en.x+=en.vx*spd*3;}
    if([getCell(Math.floor(en.x/CELL),gyB),getCell(Math.floor(en.x/CELL),gyT)].some(c=>c===1||c===2||c<0)){en.vy*=-1;en.y+=en.vy*spd*3;}
    en.x=Math.max(CELL,Math.min((gridW-2)*CELL,en.x));
    en.y=Math.max(CELL,Math.min((gridH-2)*CELL,en.y));
    if(en.hitCooldown===0) checkEnemyHit(en);
  });
}

function checkEnemyHit(en){
  if(isDrawing){
    const ex=Math.floor(en.x/CELL),ey=Math.floor(en.y/CELL);
    if(trail.some(t=>Math.abs(t.x-ex)<=1&&Math.abs(t.y-ey)<=1)){loseLife();return;}
  }
  const px=player.gx*CELL+CELL/2, py=player.gy*CELL+CELL/2;
  if(Math.hypot(en.x-px,en.y-py)<CELL*1.5) loseLife();
}

function loseLife(){
  trail.forEach(t=>{if(getCell(t.x,t.y)===3)setCell(t.x,t.y,0);});
  trail=[]; isDrawing=false;
  player.gx=1; player.gy=0; player.moving=false; player.dx=0; player.dy=0;
  enemies.forEach(en=>en.hitCooldown=90);
  G.lives--;
  if(G.lives<=0){
    cancelAnimationFrame(animId);
    if(G.timerInterval) clearInterval(G.timerInterval);
    document.getElementById('loseScore').textContent=G.totalScore.toLocaleString();
    document.getElementById('loseLevel').textContent=G.level;
    document.getElementById('loseOverlay').classList.add('active');
  }
}

// ── DRAW ──
function draw(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const bg = G.profile?.bgColor || '#111111';
  ctx.fillStyle = bg;
  ctx.fillRect(0,0,canvas.width,canvas.height);

  if(gameImg.complete&&gameImg.naturalWidth){
    ctx.save();
    ctx.beginPath();
    for(let y=0;y<gridH;y++) for(let x=0;x<gridW;x++) if(grid[y*gridW+x]===1) ctx.rect(x*CELL,y*CELL,CELL,CELL);
    ctx.clip();
    // object-fit: cover — mantiene proporción y llena el canvas
    const iw = gameImg.naturalWidth, ih = gameImg.naturalHeight;
    const cw = canvas.width, ch = canvas.height;
    const scale = Math.max(cw/iw, ch/ih);
    const sw = iw*scale, sh = ih*scale;
    const sx = (cw - sw) / 2, sy = (ch - sh) / 2;
    ctx.drawImage(gameImg, sx, sy, sw, sh);
    ctx.restore();
  }

  const trailCol = G.profile?.trailColor || '#FCD116';
  // Border cells
  ctx.fillStyle = 'rgba(0,163,224,0.75)';
  for(let y=0;y<gridH;y++) for(let x=0;x<gridW;x++) if(grid[y*gridW+x]===2) ctx.fillRect(x*CELL+1,y*CELL+1,CELL-2,CELL-2);

  // Trail
  if(trail.length>1){
    ctx.beginPath(); ctx.strokeStyle=trailCol; ctx.lineWidth=3;
    ctx.shadowColor=trailCol; ctx.shadowBlur=8;
    ctx.moveTo(trail[0].x*CELL+CELL/2,trail[0].y*CELL+CELL/2);
    trail.forEach(t=>ctx.lineTo(t.x*CELL+CELL/2,t.y*CELL+CELL/2));
    ctx.stroke(); ctx.shadowBlur=0;
  }

  enemies.forEach(drawEnemy);
  drawPlayer();
}

function drawPlayer(){
  const px=player.gx*CELL+CELL/2, py=player.gy*CELL+CELL/2;
  const col = isDrawing ? (G.profile?.trailColor||'#FCD116') : '#00A3E0';
  const shape = G.profile?.playerShape || 'circle';
  const r = CELL*0.75;
  ctx.fillStyle=col; ctx.shadowColor=col; ctx.shadowBlur=12;
  ctx.save(); ctx.translate(px,py);
  ctx.beginPath();
  if(shape==='circle'){ ctx.arc(0,0,r,0,Math.PI*2); }
  else if(shape==='diamond'){ ctx.moveTo(0,-r); ctx.lineTo(r,0); ctx.lineTo(0,r); ctx.lineTo(-r,0); ctx.closePath(); }
  else if(shape==='triangle'){ ctx.moveTo(0,-r); ctx.lineTo(r,r*0.7); ctx.lineTo(-r,r*0.7); ctx.closePath(); }
  else if(shape==='star'){
    for(let i=0;i<10;i++){
      const a=(i*Math.PI*2)/10 - Math.PI/2;
      const rad=i%2===0?r:r*0.45;
      i===0?ctx.moveTo(Math.cos(a)*rad,Math.sin(a)*rad):ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad);
    }
    ctx.closePath();
  }
  ctx.fill(); ctx.shadowBlur=0; ctx.restore();
}

function drawEnemy(en){
  ctx.save(); ctx.translate(en.x,en.y);
  const s=en.size;
  ctx.fillStyle=en.color; ctx.shadowColor=en.color; ctx.shadowBlur=16;
  ctx.beginPath();
  for(let i=0;i<6;i++){
    const a=(i*Math.PI*2)/6;
    const rad=i%2===0?s:s*0.45;
    ctx.lineTo(Math.cos(a)*rad,Math.sin(a)*rad);
  }
  ctx.closePath(); ctx.fill();
  ctx.rotate(en.angle);
  ctx.beginPath(); ctx.strokeStyle='rgba(255,255,255,0.4)'; ctx.lineWidth=1.5;
  ctx.moveTo(-s*0.4,0); ctx.lineTo(s*0.4,0);
  ctx.moveTo(0,-s*0.4); ctx.lineTo(0,s*0.4);
  ctx.stroke(); ctx.shadowBlur=0; ctx.restore();
}

// ── HUD ──
function updateHUD(){
  document.getElementById('hudScore').textContent=(G.totalScore||0).toLocaleString();
  document.getElementById('hudPct').textContent=getCapturedPct()+'%';
  document.getElementById('hudTarget').textContent=(G.targetPct||75)+'%';
  document.getElementById('hudLevel').textContent=G.level||1;
  if(G.mode!=='free'&&G.timeLeft!=null){
    document.getElementById('hudTarget').textContent=G.timeLeft+'s';
  }
  const el=document.getElementById('hudLives');
  el.innerHTML='';
  for(let i=0;i<3;i++){
    const d=document.createElement('div');
    d.className='life-dot';
    d.style.background=i<G.lives?'#FF6B00':'#333';
    el.appendChild(d);
  }
}

// ═══════════════════════════════════════════
//  SCORES
// ═══════════════════════════════════════════
async function renderScores(){
  const scores = await dbAll('scores');
  scores.sort((a,b)=>b.score-a.score);
  const tbody = document.getElementById('scoreTbody');
  if(!scores.length){ tbody.innerHTML='<tr><td colspan="4" class="empty-msg">Sin puntajes aún</td></tr>'; return; }
  tbody.innerHTML = scores.slice(0,10).map((s,i)=>`
    <tr class="${i===0?'score-gold':i===1?'score-silver':''}">
      <td class="score-rank">${i+1}</td>
      <td>${s.name}</td>
      <td class="score-lv">Nv.${s.level}</td>
      <td class="score-pts">${s.score.toLocaleString()}</td>
    </tr>`).join('');
}

async function clearScores(){
  if(!confirm('¿Borrar todos los puntajes?')) return;
  await dbClear('scores');
  renderScores();
}

// ═══════════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════════
function fileToDataURL(file){
  return new Promise(res=>{
    const r=new FileReader();
    r.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        const MAX=900;
        let w=img.width, h=img.height;
        if(w>MAX||h>MAX){
          if(w>h){ h=Math.round(h*MAX/w); w=MAX; }
          else    { w=Math.round(w*MAX/h); h=MAX; }
        }
        const c=document.createElement('canvas');
        c.width=w; c.height=h;
        c.getContext('2d').drawImage(img,0,0,w,h);
        res(c.toDataURL('image/jpeg',0.82));
      };
      img.src=e.target.result;
    };
    r.readAsDataURL(file);
  });
}

document.addEventListener('touchmove',e=>e.preventDefault(),{passive:false});


// ═══════════════════════════════════════════
//  VERSUS STATE
// ═══════════════════════════════════════════
let VS = {
  type: 'foto',       // 'foto' | 'turnos'
  p1: null,           // profile object
  p2: null,           // profile object
  photoId: null,      // selected photo id
  selectingPlayer: 1, // which player slot being filled
  // Round results
  results: [],        // [{profile, pct, score}]
  currentTurn: 0,     // 0=p1, 1=p2 (turnos mode)
  turnoScores: [0, 0],
};

// ═══════════════════════════════════════════
//  VERSUS SETUP
// ═══════════════════════════════════════════
function initVersusSetup() {
  VS = { type:'foto', p1:null, p2:null, photoId:null, selectingPlayer:1, results:[], currentTurn:0, turnoScores:[0,0] };
  showScreen('versusSetup');
  renderVsSetup();
}

function renderVsSetup() {
  // Photo strip — use active profile photos by default
  const photos = activeProfile?.photos || [];
  const strip = document.getElementById('vsPhotoStrip');
  strip.innerHTML = '';
  photos.forEach(p => {
    const img = document.createElement('img');
    img.className = 'vs-photo-thumb' + (p.id === VS.photoId ? ' selected' : '');
    img.src = p.dataURL;
    img.onclick = () => { VS.photoId = p.id; renderVsSetup(); };
    strip.appendChild(img);
  });

  // Player 1
  renderVsPlayerSlot(1);
  renderVsPlayerSlot(2);

  // Enable start button
  const canStart = VS.p1 && VS.p2 && VS.p1.id !== VS.p2.id &&
    (VS.type === 'turnos' || VS.photoId);
  document.getElementById('vsStartBtn').disabled = !canStart;
}

function renderVsPlayerSlot(n) {
  const p = n === 1 ? VS.p1 : VS.p2;
  const avatarEl = document.getElementById(`vsP${n}Avatar`);
  const nameEl   = document.getElementById(`vsP${n}Name`);
  const statsEl  = document.getElementById(`vsP${n}Stats`);
  const rowEl    = document.getElementById(`vsP${n}Row`);

  if (p) {
    avatarEl.innerHTML = avatarHTML(p, 40);
    nameEl.textContent = p.name;
    statsEl.textContent = `Nv.${p.level||1} · ${(p.totalScore||0).toLocaleString()} pts`;
    rowEl.classList.add('filled');
  } else {
    avatarEl.innerHTML = `<div style="width:40px;height:40px;border-radius:50%;background:var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--muted);">?</div>`;
    nameEl.textContent = '— Seleccionar —';
    statsEl.textContent = '';
    rowEl.classList.remove('filled');
  }
}

function selectVsType(type) {
  VS.type = type;
  document.getElementById('vsTypeFoto').classList.toggle('active', type==='foto');
  document.getElementById('vsTypeTurnos').classList.toggle('active', type==='turnos');
  document.getElementById('vsPhotoSection').style.display = type==='foto' ? '' : 'none';
  renderVsSetup();
}

function selectVsPlayer(n) {
  VS.selectingPlayer = n;
  document.getElementById('vsSelectTitle').textContent = `Jugador ${n}`;
  showScreen('versusPlayerSelect');
  renderVsProfileCards();
}

function renderVsProfileCards() {
  const container = document.getElementById('vsProfileCards');
  container.innerHTML = '';
  profiles.forEach(p => {
    const card = document.createElement('div');
    card.className = 'profile-card';
    const n = VS.selectingPlayer;
    const other = n === 1 ? VS.p2 : VS.p1;
    const isOther = other?.id === p.id;
    if (isOther) card.classList.add('locked');
    card.innerHTML = `
      ${avatarHTML(p, 48)}
      <div class="p-info">
        <div class="p-name">${p.name}</div>
        <div class="p-stats">Nv.${p.level||1} · ${(p.totalScore||0).toLocaleString()} pts</div>
      </div>
      ${isOther ? '<div style="font-size:10px;color:var(--muted);">En uso</div>' : ''}
    `;
    if (!isOther) {
      card.onclick = () => {
        if (n === 1) VS.p1 = p; else VS.p2 = p;
        showScreen('versusSetup');
        renderVsSetup();
      };
    }
    container.appendChild(card);
  });

  // Add "invite" hint if only 1 profile
  if (profiles.length < 2) {
    const hint = document.createElement('div');
    hint.style.cssText = 'text-align:center;color:var(--muted);font-size:11px;padding:20px;line-height:1.8;';
    hint.textContent = 'Necesitas al menos 2 perfiles para jugar Versus. Ve al menú principal y crea otro perfil.';
    container.appendChild(hint);
  }
}

// ═══════════════════════════════════════════
//  START VERSUS
// ═══════════════════════════════════════════
function startVersus() {
  VS.results = [];
  VS.turnoScores = [0, 0];
  VS.currentTurn = 0;

  if (VS.type === 'foto') {
    // P1 goes first
    showPassPhone(VS.p1, 'PRIMER TURNO');
  } else {
    // Turnos: P1 starts
    showPassPhone(VS.p1, 'PRIMER TURNO');
  }
}

function showPassPhone(profile, subtitle) {
  document.getElementById('passPhoneTitle').textContent = subtitle || 'PASA EL TELÉFONO';
  document.getElementById('passPhoneName').textContent = profile.name;
  const avatarEl = document.getElementById('passPhoneAvatar');
  avatarEl.innerHTML = avatarHTML(profile, 64);
  showScreen('passPhone');
}

function startVersusRound() {
  if (VS.type === 'foto') {
    const currentPlayer = VS.results.length === 0 ? VS.p1 : VS.p2;
    const photo = getVsPhoto();
    startVersusGame(currentPlayer, photo, 'foto');
  } else {
    const currentPlayer = VS.currentTurn === 0 ? VS.p1 : VS.p2;
    const photos = (VS.currentTurn === 0 ? VS.p1 : VS.p2).photos || [];
    const photo = photos[Math.floor(Math.random() * photos.length)];
    startVersusGame(currentPlayer, photo, 'turnos');
  }
}

function getVsPhoto() {
  // Find photo in P1's album first, then P2
  const allPhotos = [...(VS.p1?.photos||[]), ...(VS.p2?.photos||[])];
  return allPhotos.find(p => p.id === VS.photoId) || allPhotos[0];
}

function startVersusGame(profile, photo, vsType) {
  G = {
    profile,
    targetPct: 75,
    photo: photo?.dataURL || '',
    mode: 'free',
    speed: 'normal',
    level: 1,
    lives: 3,
    score: 0,
    totalScore: 0,
    timeLeft: null,
    timerInterval: null,
    isVersus: true,
    vsType,
  };
  showScreen('gameScreen');
  initCanvas();
}

// Called after a versus round ends (win or lose)
function versusRoundEnd(pct, score) {
  const currentPlayer = VS.type === 'foto'
    ? (VS.results.length === 0 ? VS.p1 : VS.p2)
    : (VS.currentTurn === 0 ? VS.p1 : VS.p2);

  VS.results.push({ profile: currentPlayer, pct, score });

  if (VS.type === 'foto') {
    if (VS.results.length < 2) {
      // P2's turn
      showPassPhone(VS.p2, 'TURNO DEL RIVAL');
    } else {
      showVersusResult();
    }
  } else {
    // Turnos: alternate until both have played once → show result
    VS.turnoScores[VS.currentTurn] += score;
    VS.currentTurn = VS.currentTurn === 0 ? 1 : 0;
    if (VS.results.length < 2) {
      const nextPlayer = VS.currentTurn === 0 ? VS.p1 : VS.p2;
      showPassPhone(nextPlayer, 'PASA EL TELÉFONO');
    } else {
      showVersusResult();
    }
  }
}

function showVersusResult() {
  const [r1, r2] = VS.results;
  const winner = r1.score >= r2.score ? r1 : r2;
  const isDraw = r1.score === r2.score;

  document.getElementById('vrWinnerName').textContent = isDraw ? '¡EMPATE!' : winner.profile.name;
  document.getElementById('vrWinnerSub').textContent = isDraw ? 'NADIE GANA… O GANAN TODOS' : '🏆 GANADOR';

  const cards = document.getElementById('vrCards');
  cards.innerHTML = '';
  [r1, r2].forEach(r => {
    const isWinner = !isDraw && r.profile.id === winner.profile.id;
    const card = document.createElement('div');
    card.className = 'vr-card' + (isWinner ? ' winner' : '');
    card.innerHTML = `
      ${avatarHTML(r.profile, 48)}
      <div class="vr-card-name">${r.profile.name}</div>
      <div class="vr-card-pct" style="color:${isWinner?'var(--yellow)':'var(--muted)'}">${r.pct}%</div>
      <div class="vr-card-score">${r.score.toLocaleString()} pts</div>
      ${isWinner ? '<div style="font-size:18px;">🏆</div>' : ''}
    `;
    cards.appendChild(card);
  });

  showScreen('versusResult');

  // Save scores
  VS.results.forEach(r => {
    dbPut('scores', {
      name: r.profile.name, score: r.score, level: 1,
      mode: 'versus_' + VS.type, date: new Date().toISOString(),
      profileId: r.profile.id,
    });
  });
}

// ─ BOOT ─
openDB().then(()=>initApp());
