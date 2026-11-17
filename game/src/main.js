// Solmar Heat — boot, fixed-step loop, screens (title / play / pause /
// busted / wasted / how-to), save/load and the ?shot= staging hook.
import { SAVE_KEY, STEP, VIEW_H, VIEW_W } from './config.js';
import { createRandom } from './random.js';
import { ACTION_CONFIRM, ACTION_DOWN, ACTION_INTERACT, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, ACTION_RELOAD, ACTION_UP, createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity } from './city.js';
import {
  addHeat, createPlayer, damagePlayer, enterCar, exitCar, nearestCar,
  spawnParkedCars, spawnPeds, spawnTraffic, updateCars, updateParticles,
  updatePeds, updatePlayer, updatePolice, updateWanted,
} from './entities.js';
import { combat } from './combat.js';
import {
  MISSIONS, createMissionState, failMission, missionMarker, objectiveText,
  startMission, updateMissions, updateTaxi, waypoint,
} from './missions.js';
import { drawHUD } from './hud.js';
import { drawWorld } from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const statusEl = document.getElementById('status');
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const ctx = canvas.getContext('2d');

function createState(seedValue) {
  const rng = createRandom(seedValue);
  const city = buildCity(rng);
  const state = {
    rng,
    city,
    seed: seedValue,
    time: 0,
    clock: 17.5,
    screen: 'title',
    titleMenu: 0,
    pauseMenu: 0,
    menuRects: [],
    camera: { x: 1920, y: 1200 },
    shake: 0,
    player: createPlayer(1920, 2080),
    cars: [],
    peds: [],
    cops: [],
    enemies: [],
    bullets: [],
    particles: [],
    pickups: [],
    skids: [],
    wanted: { heat: 0, stars: 0, lastCrime: -100 },
    mission: createMissionState(),
    missions: MISSIONS,
    taxi: { active: false, phase: 'pickup', ped: null, dest: null, fare: 0, timer: 0, cool: 8 },
    stats: { kills: 0, missionKills: 0, carsStolen: 0, copsDown: 0, pedsHit: 0, packages: 0, missionsDone: 0, taxiEarned: 0 },
    lastShot: null,
    muzzle: null,
    hudFlash: null,
    objective: '',
    prompt: '',
    waypoint: null,
    marker: null,
    nextId: 1,
    audio: createAudio(),
    combat,
    saveExists: false,
    hasSmg: false,
    onSave: null,
  };
  spawnParkedCars(state, rng, 16);
  spawnTraffic(state, rng, 12);
  spawnPeds(state, rng, 18);
  // A pistol-ammo pickup and an SMG pickup on the roads near the start,
  // so combat is reachable fast. (Road points, never inside a building.)
  state.pickups.push({ x: 1920, y: 2100, kind: 'ammo', amount: 0, t: 0 });
  state.pickups.push({ x: 2100, y: 1920, kind: 'smg', amount: 0, t: 0 });
  return state;
}

const state = createState(seed);
state.onSave = saveGame;
window.__solmar = state;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveGame() {
  const p = state.player;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash, weapon: p.weapon, ammo: p.ammo, mag: p.mag,
      x: p.x, y: p.y, clock: state.clock,
      missionIdx: state.mission.idx, completed: state.mission.completed,
      packages: state.city.packages.map((pk) => pk.taken),
      stats: state.stats, hasSmg: state.hasSmg,
    }));
    state.saveExists = true;
  } catch { /* storage can be off */ }
}

function loadSave() {
  const s = readSave();
  if (!s) return false;
  const p = state.player;
  p.cash = s.cash ?? 200;
  p.weapon = s.weapon ?? 'fists';
  p.ammo = s.ammo ?? { pistol: 48, smg: 0 };
  p.mag = s.mag ?? { pistol: 12, smg: 0 };
  p.x = s.x ?? 1920;
  p.y = s.y ?? 2080;
  p.hp = 100;
  p.inCar = null;
  state.clock = s.clock ?? 17.5;
  state.mission.idx = s.missionIdx ?? 0;
  state.mission.completed = s.completed ?? [];
  state.hasSmg = !!s.hasSmg;
  if (Array.isArray(s.packages)) {
    s.packages.forEach((taken, i) => {
      if (state.city.packages[i]) state.city.packages[i].taken = !!taken;
    });
  }
  if (s.stats) Object.assign(state.stats, s.stats);
  state.camera.x = p.x;
  state.camera.y = p.y;
  return true;
}

state.saveExists = !!readSave();

function announce(message) {
  statusEl.textContent = message;
}

function updateCamera(dt) {
  const p = state.player;
  if (state.screen === 'title') {
    state.camera.x = 1920 + Math.sin(state.time * 0.05) * 700;
    state.camera.y = 1200 + Math.cos(state.time * 0.04) * 380;
    return;
  }
  const tx = Math.max(VIEW_W / 2, Math.min(3840 - VIEW_W / 2, p.x));
  const ty = Math.max(VIEW_H / 2, Math.min(2880 - VIEW_H / 2, p.y));
  const k = Math.min(1, 6 * dt);
  state.camera.x += (tx - state.camera.x) * k;
  state.camera.y += (ty - state.camera.y) * k;
}

function computePrompt() {
  const p = state.player;
  if (state.mission.active || state.screen !== 'play') {
    state.prompt = '';
    return;
  }
  const marker = missionMarker(state);
  if (marker && Math.hypot(p.x - marker.x, p.y - marker.y) < 110) {
    state.prompt = `Press E — start mission: ${MISSIONS[state.mission.idx].title}`;
    return;
  }
  if (p.inCar) {
    state.prompt = 'E — exit car';
    return;
  }
  const car = nearestCar(state, p.x, p.y, 80);
  if (car) {
    state.prompt = car.driver === 'traffic' ? 'E — steal car (the driver will run)' : 'E — drive';
    return;
  }
  state.prompt = '';
}

function updateWorld(dt, input) {
  state.time += dt;
  state.clock = (state.clock + dt / 60) % 24;
  state.shake = Math.max(0, state.shake - 30 * dt);
  if (state.muzzle) {
    state.muzzle.t -= dt;
    if (state.muzzle.t <= 0) state.muzzle = null;
  }
  if (state.hudFlash) {
    state.hudFlash.t -= dt;
    if (state.hudFlash.t <= 0) state.hudFlash = null;
  }
  // Briefing card: the world holds still.
  if (state.mission.briefingT > 0) {
    updateMissions(state, dt);
    updateCamera(dt);
    return;
  }
  if (input) updatePlayer(state, input, dt);
  updateCars(state, dt);
  updatePeds(state, dt);
  updatePolice(state, dt);
  updateWanted(state, dt);
  combat.updateBullets(state, dt);
  combat.updateEnemies(state, dt);
  combat.updatePickups(state, dt);
  combat.checkPackages(state);
  updateMissions(state, dt);
  updateTaxi(state, dt);
  updateParticles(state, dt);
  updateCamera(dt);
  state.objective = objectiveText(state);
  state.waypoint = waypoint(state);
  state.marker = missionMarker(state);
  computePrompt();
  state.audio.setSiren(state.wanted.stars >= 2, state.time);
  // Autosave every 20 seconds of play so progress survives a reload.
  state.saveT = (state.saveT || 0) + dt;
  if (state.saveT >= 20) {
    state.saveT = 0;
    saveGame();
  }
  if (state.player.dead && state.screen === 'play') {
    state.screen = 'wasted';
    state.audio.fail();
    announce('Wasted. Press Enter to wake up at the hospital.');
  }
}

function respawn(kind) {
  const p = state.player;
  p.dead = false;
  p.hp = 100;
  p.inCar = null;
  p.weapon = 'fists';
  if (kind === 'busted') {
    p.x = 1200;
    p.y = 560;
    p.cash = Math.floor(p.cash * 0.85);
    state.wanted.heat = 0;
    state.wanted.stars = 0;
    if (state.mission.active) failMission(state, 'Busted by the police');
  } else {
    p.x = 1200;
    p.y = 1840;
    p.cash = Math.floor(p.cash * 0.9);
    state.wanted.heat = 0;
    state.wanted.stars = 0;
    if (state.mission.active) failMission(state, 'Wasted on the streets');
  }
  state.cops = [];
  for (const car of state.cars) {
    if (car.driver === 'police') car.driver = 'traffic';
  }
  state.camera.x = p.x;
  state.camera.y = p.y;
  state.screen = 'play';
  saveGame();
}

function startNewGame() {
  const fresh = createState(Math.floor(Math.random() * 4294967296));
  Object.keys(fresh).forEach((k) => {
    state[k] = fresh[k];
  });
  state.audio = createAudio();
  state.combat = combat;
  state.onSave = saveGame;
  state.screen = 'play';
  state.audio.unlock();
  state.audio.startMusic();
  announce('Playing. Steal a car, reach the gold M, and take the first job.');
}

function continueGame() {
  if (loadSave()) {
    state.screen = 'play';
    state.audio.unlock();
    state.audio.startMusic();
    announce('Welcome back to Solmar.');
  }
}

function drawTitle() {
  const cx = VIEW_W / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 18, 0.55)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('ALDERRA  ·  A SUN-SOAKED COASTAL CITY', cx, 150);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('SOLMAR HEAT', cx, 240);
  ctx.fillStyle = '#ffb347';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('Rook Calloway is back — and Marlowe wants his money.', cx, 278);
  const items = ['New Game', state.saveExists ? 'Continue' : null, 'How to Play'].filter(Boolean);
  state.menuRects = [];
  items.forEach((label, i) => {
    const y = 340 + i * 56;
    const selected = state.titleMenu === i;
    ctx.fillStyle = selected ? 'rgba(255,210,60,0.92)' : 'rgba(12,16,22,0.92)';
    ctx.beginPath();
    ctx.roundRect(cx - 170, y - 24, 340, 44, 8);
    ctx.fill();
    ctx.fillStyle = selected ? '#111' : '#fff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(label, cx, y + 6);
    state.menuRects.push({ x: cx - 170, y: y - 24, w: 340, h: 44, i });
  });
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('WASD move · Shift sprint · Mouse aim · Click shoot · Space punch · E enter / steal car · R reload · P pause · M mute', cx, 560);
  ctx.fillText('8 story missions · taxi fares · 10 hidden packages · wanted level 0–5 stars', cx, 586);
  ctx.fillText('An original game. Not affiliated with any commercial game series.', cx, 640);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawHowTo() {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 18, 0.88)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 34px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('HOW TO PLAY', VIEW_W / 2, 90);
  ctx.fillStyle = '#fff';
  ctx.font = '17px system-ui, sans-serif';
  const lines = [
    'Move: WASD / arrows — Sprint: Shift — Punch: Space',
    'Aim with the mouse, click to shoot — R reloads — 1/2/3 switch weapons',
    'E: enter a car, steal one with a driver, or exit your car',
    'Crimes raise your wanted level. Cops chase on foot and in cruisers.',
    'At 3 stars the heat is serious; at 5 stars Solmar wants you gone.',
    'Gold M on the map starts the next story mission. Gold diamonds mark objectives.',
    'Taxi fares appear while you drive with no mission active — green $ on the map.',
    '10 hidden packages are scattered around Solmar — each pays $250.',
    'Progress saves to this browser. P pauses, M mutes, Esc quits to the title.',
  ];
  lines.forEach((line, i) => ctx.fillText(line, VIEW_W / 2, 150 + i * 40));
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('Press Enter or Esc to go back', VIEW_W / 2, 560);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawPause() {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 18, 0.7)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText('PAUSED', VIEW_W / 2, 200);
  const items = ['Resume', state.audio.muted ? 'Unmute (M)' : 'Mute (M)', 'Save & quit to title'];
  state.menuRects = [];
  items.forEach((label, i) => {
    const y = 280 + i * 56;
    const selected = state.pauseMenu === i;
    ctx.fillStyle = selected ? 'rgba(255,210,60,0.92)' : 'rgba(12,16,22,0.92)';
    ctx.beginPath();
    ctx.roundRect(VIEW_W / 2 - 170, y - 24, 340, 44, 8);
    ctx.fill();
    ctx.fillStyle = selected ? '#111' : '#fff';
    ctx.font = 'bold 19px system-ui, sans-serif';
    ctx.fillText(label, VIEW_W / 2, y + 6);
    state.menuRects.push({ x: VIEW_W / 2 - 170, y: y - 24, w: 340, h: 44, i });
  });
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = '14px system-ui, sans-serif';
  const p = state.player;
  ctx.fillText(`Cash $${p.cash.toLocaleString('en-US')}  ·  Missions done ${state.stats.missionsDone}/8  ·  Packages ${state.stats.packages}/10`, VIEW_W / 2, 500);
  ctx.textAlign = 'left';
  ctx.restore();
}

function drawEndScreen(kind) {
  ctx.save();
  ctx.fillStyle = 'rgba(8, 10, 18, 0.8)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = kind === 'busted' ? '#3d7ad9' : '#d9382b';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(kind === 'busted' ? 'BUSTED' : 'WASTED', VIEW_W / 2, 300);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(
    kind === 'busted'
      ? 'The Solmar PD hauled you in. You lost 15% of your cash and your guns.'
      : 'Rook went down. The hospital patched you up — for 10% of your cash.',
    VIEW_W / 2, 350,
  );
  ctx.fillStyle = '#ffd23c';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('Press Enter to get back out there', VIEW_W / 2, 400);
  ctx.textAlign = 'left';
  ctx.restore();
}

function draw() {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  drawWorld(ctx, state);
  if (state.screen === 'title') drawTitle();
  else if (state.screen === 'howto') drawHowTo();
  else if (state.screen === 'paused') {
    drawHUD(ctx, state);
    drawPause();
  } else if (state.screen === 'busted') drawEndScreen('busted');
  else if (state.screen === 'wasted') drawEndScreen('wasted');
  else drawHUD(ctx, state);
}

function menuClick(x, y) {
  for (const r of state.menuRects) {
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return r.i;
  }
  return -1;
}

function runShot(name) {
  stageShot(name, state);
  let painted = 0;
  function paint() {
    updateCamera(0.016);
    draw();
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let accumulator = 0;
  let last = performance.now();

  announce('Solmar Heat. Press Enter or click to start.');

  function handleActions() {
    const { bits, clicked } = input.takeActions();
    const mx = input.mouse.x;
    const my = input.mouse.y;
    if (bits & ACTION_MUTE) {
      const muted = state.audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (state.screen === 'title') {
      if (bits & ACTION_CONFIRM && !clicked) {
        const items = ['New Game', state.saveExists ? 'Continue' : null, 'How to Play'].filter(Boolean);
        const choice = items[state.titleMenu];
        if (choice === 'New Game') startNewGame();
        else if (choice === 'Continue') continueGame();
        else if (choice === 'How to Play') state.screen = 'howto';
        return;
      }
      if (bits & ACTION_UP) state.titleMenu = Math.max(0, state.titleMenu - 1);
      if (bits & ACTION_DOWN) {
        const n = (state.saveExists ? 3 : 2);
        state.titleMenu = Math.min(n - 1, state.titleMenu + 1);
      }
      if (clicked) {
        const hit = menuClick(mx, my);
        if (hit >= 0) {
          state.titleMenu = hit;
          const items = ['New Game', state.saveExists ? 'Continue' : null, 'How to Play'].filter(Boolean);
          const choice = items[hit];
          if (choice === 'New Game') startNewGame();
          else if (choice === 'Continue') continueGame();
          else if (choice === 'How to Play') state.screen = 'howto';
        }
      }
      return;
    }
    if (state.screen === 'howto') {
      if (bits & (ACTION_CONFIRM | ACTION_PAUSE)) state.screen = 'title';
      return;
    }
    if (state.screen === 'paused') {
      if (bits & ACTION_PAUSE) {
        state.screen = 'play';
        announce('Playing.');
        return;
      }
      if (bits & ACTION_CONFIRM && !clicked) {
        if (state.pauseMenu === 0) state.screen = 'play';
        else if (state.pauseMenu === 1) state.audio.toggleMute();
        else if (state.pauseMenu === 2) {
          saveGame();
          state.screen = 'title';
        }
        return;
      }
      if (bits & ACTION_UP) state.pauseMenu = Math.max(0, state.pauseMenu - 1);
      if (bits & ACTION_DOWN) state.pauseMenu = Math.min(2, state.pauseMenu + 1);
      if (clicked) {
        const hit = menuClick(mx, my);
        if (hit === 0) state.screen = 'play';
        else if (hit === 1) state.audio.toggleMute();
        else if (hit === 2) {
          saveGame();
          state.screen = 'title';
        }
      }
      return;
    }
    if (state.screen === 'busted' || state.screen === 'wasted') {
      if (bits & ACTION_CONFIRM) respawn(state.screen);
      return;
    }
    // Play screen.
    if (bits & ACTION_PAUSE) {
      state.screen = 'paused';
      state.pauseMenu = 0;
      saveGame();
      announce('Paused. Progress saved.');
      return;
    }
    if (bits & ACTION_INTERACT) {
      const p = state.player;
      const marker = missionMarker(state);
      if (!state.mission.active && marker && Math.hypot(p.x - marker.x, p.y - marker.y) < 110) {
        startMission(state, state.mission.idx);
      } else if (p.inCar) {
        exitCar(state);
      } else {
        const car = nearestCar(state, p.x, p.y, 80);
        if (car) enterCar(state, car);
      }
    }
    if (bits & ACTION_RELOAD) combat.reload(state);
    if (input.isDown('Digit1')) state.player.weapon = 'fists';
    if (input.isDown('Digit2')) state.player.weapon = 'pistol';
    if (input.isDown('Digit3') && state.hasSmg) state.player.weapon = 'smg';
    // Space = punch (fists) when on foot. Uses the sticky ACTION_PUNCH bit:
    // a quick tap can fall between frames, and sampling the held key would miss it.
    if (bits & ACTION_PUNCH && !state.player.inCar && state.player.weapon === 'fists') {
      const p = state.player;
      const cam = state.camera;
      const wx = cam.x + input.mouse.x - VIEW_W / 2;
      const wy = cam.y + input.mouse.y - VIEW_H / 2;
      combat.fireWeapon(state, p, wx, wy);
    }
    // Mouse held = shoot toward the cursor. Works on foot and from a car
    // (drive-by): the bullet leaves from Rook's position toward the mouse.
    if (input.mouse.down) {
      const p = state.player;
      const cam = state.camera;
      const wx = cam.x + input.mouse.x - VIEW_W / 2;
      const wy = cam.y + input.mouse.y - VIEW_H / 2;
      combat.fireWeapon(state, p, wx, wy);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (state.screen === 'title' || state.screen === 'howto') {
      // Ambient city life behind the menus.
      while (accumulator >= STEP) {
        state.time += STEP;
        state.clock = (state.clock + STEP / 60) % 24;
        updateCars(state, STEP);
        updatePeds(state, STEP);
        updateParticles(state, STEP);
        updateCamera(STEP);
        accumulator -= STEP;
      }
      accumulator = 0;
    } else if (state.screen === 'play') {
      while (accumulator >= STEP) {
        updateWorld(STEP, input);
        accumulator -= STEP;
        if (state.screen !== 'play') break;
      }
    } else {
      accumulator = 0;
    }
    draw();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.screen === 'play') {
      state.screen = 'paused';
      state.pauseMenu = 0;
      saveGame();
      announce('Paused. Progress saved.');
    }
  });

  // First user gesture unlocks audio.
  window.addEventListener('pointerdown', () => state.audio.unlock(), { once: true });
  window.addEventListener('keydown', () => state.audio.unlock(), { once: true });

  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
