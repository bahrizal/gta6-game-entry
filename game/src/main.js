// Solmar Heat — boot, fixed-step loop, screens (title / play / pause /
// busted / wasted / win), save/load and the mission flow.
import { WORLD, TUNING, KEYS } from './config.js';
import { mulberry32, clamp, fmtCash } from './random.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildCity, randomStreetPoint, randomSidewalkPoint, landmarkById } from './city.js';
import {
  makePlayer, makeCar, spawnTrafficCar, spawnParkedCar, spawnPed,
  updatePlayer, updatePeds, updateTraffic, updateCops, exitCar,
  respawnAfterBusted, respawnAfterWasted, burst,
} from './entities.js';
import { updateCombat, spawnPickup } from './combat.js';
import { MISSIONS, startMission, updateMission, updateTaxi, placePackages, completeMission } from './missions.js';
import { drawHUD } from './hud.js';
import { drawWorld, dayFactor } from './render.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solmar-heat-save-v1';
const STEP = 1 / 60;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const input = createInput(canvas);
const audio = createAudio();

const params = new URLSearchParams(window.location.search);
const seed = parseInt(params.get('seed') || '1337', 10);
const shotName = params.get('shot');

function newGame(save) {
  const rng = mulberry32(seed);
  const city = buildCity(seed);
  const G = {
    rng, city, audio,
    time: 0,
    clock: TUNING.startClock,
    screen: 'title',
    titleSel: 0,
    pauseSel: 0,
    player: makePlayer(1920, 1140),
    cars: [], peds: [], cops: [], enemies: [],
    bullets: [], particles: [], pickups: [],
    heat: 0, heatLock: 0, wanted: 0, lastCrime: -99,
    lastShotAt: -99, lastShotX: 0, lastShotY: 0,
    missionIndex: 0, mission: null, missionCard: null,
    missionFailed: false, missionFailReason: '',
    waypoint: null, taxi: { active: false, stage: 'pickup', ped: null, dest: null, fare: 0, wait: 0 },
    packagesCollected: 0,
    camera: { x: 1920 - 640, y: 1140 - 360, shake: 0 },
    message: '', messageTimer: 0, crimeFlash: '',
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, fares: 0 },
    storyComplete: false,
    shotStaged: null,
    saveTimer: 0,
  };
  G.player.walkPhase = 0;
  // Populate the world.
  for (let i = 0; i < 12; i++) spawnTrafficCar(G);
  for (let i = 0; i < 22; i++) spawnPed(G);
  for (let i = 0; i < 6; i++) {
    const p = randomStreetPoint(rng);
    spawnParkedCar(G, p.x, p.y);
  }
  placePackages(G);
  spawnPickup(G, 1920, 1050, 'health', 25);
  spawnPickup(G, 1560, 780, 'ammo-pistol', 24);
  if (save) {
    G.player.cash = save.cash;
    G.missionIndex = save.missionIndex;
    G.player.x = save.x;
    G.player.y = save.y;
    G.player.weapon = save.weapon;
    G.player.ammo = save.ammo;
    G.packagesCollected = save.packagesCollected;
    G.stats = save.stats;
    G.camera.x = clamp(save.x - 640, 0, WORLD.W - 1280);
    G.camera.y = clamp(save.y - 360, 0, WORLD.H - 720);
  }
  return G;
}

let G = newGame(loadSave());
window.__game = G;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveGame() {
  try {
    const p = G.player;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: p.cash, missionIndex: G.missionIndex,
      x: p.x, y: p.y, weapon: p.weapon, ammo: p.ammo,
      packagesCollected: G.packagesCollected, stats: G.stats,
    }));
  } catch (e) {
    // Storage unavailable (private mode): the game still plays.
  }
}

function hasSave() {
  return loadSave() !== null;
}

// --- Screens ---------------------------------------------------------------
function drawTitle() {
  drawWorld(ctx, G);
  ctx.fillStyle = 'rgba(5,8,24,0.55)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24d';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('SOLMAR HEAT', 640, 220);
  ctx.fillStyle = '#fff';
  ctx.font = '24px system-ui, sans-serif';
  ctx.fillText('An open-world crime story — sun, streets and trouble.', 640, 262);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillStyle = '#cfe8ff';
  ctx.fillText('Rae "Rook" Calloway is back in Solmar. Marlowe owns his debt. The city owns everything else.', 640, 292);

  const items = ['New Game', hasSave() ? 'Continue' : 'Continue (no save yet)', 'How to Play'];
  for (let i = 0; i < items.length; i++) {
    const y = 380 + i * 56;
    const sel = G.titleSel === i;
    ctx.fillStyle = sel ? '#ffd24d' : 'rgba(255,255,255,0.85)';
    ctx.font = (sel ? 'bold ' : '') + '26px system-ui, sans-serif';
    if (sel) {
      ctx.fillStyle = 'rgba(255,210,77,0.18)';
      ctx.fillRect(440, y - 32, 400, 44);
      ctx.fillStyle = '#ffd24d';
    }
    ctx.fillText(items[i], 640, y);
  }
  ctx.fillStyle = '#9aa0b0';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('WASD move · E steal car · Space punch · Mouse aim + click shoot · P pause · M mute', 640, 580);
  ctx.fillText('A wholly original game. Not affiliated with any commercial title.', 640, 610);
}

function drawHowTo() {
  drawWorld(ctx, G);
  ctx.fillStyle = 'rgba(5,8,24,0.78)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24d';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', 640, 90);
  ctx.fillStyle = '#fff';
  ctx.font = '19px system-ui, sans-serif';
  ctx.textAlign = 'left';
  const lines = [
    'Move: WASD / arrows — Sprint: Shift — Punch: Space',
    'Aim with the mouse, click to shoot (pistol: click, SMG: hold).',
    'E: enter or steal a car. Drive with WASD. E again to get out.',
    '1 / 2 / 3: fists / pistol / SMG. R: reload. T: taxi fares (in a taxi).',
    'Crimes raise your wanted level. Cops chase, ram and grab you.',
    'Busted: you wake at the police station, $200 lighter.',
    'Wasted: you wake at Solmar General, $300 lighter.',
    'Missions: press Enter to start the next job. Gold marker = objective.',
    'Collect 10 hidden packages for a $2,000 bonus. Progress saves.',
    'P / Esc: pause. M: mute. The game saves when you pause.',
  ];
  lines.forEach((l, i) => ctx.fillText(l, 240, 150 + i * 42));
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd24d';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('Press Esc or Enter to go back', 640, 620);
}

function drawPause() {
  drawWorld(ctx, G);
  drawHUD(ctx, G);
  ctx.fillStyle = 'rgba(5,8,24,0.6)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.fillText('PAUSED', 640, 200);
  const items = ['Resume', 'Save Game', 'How to Play', 'Quit to Title'];
  for (let i = 0; i < items.length; i++) {
    const y = 300 + i * 52;
    const sel = G.pauseSel === i;
    ctx.fillStyle = sel ? '#ffd24d' : 'rgba(255,255,255,0.85)';
    ctx.font = (sel ? 'bold ' : '') + '26px system-ui, sans-serif';
    ctx.fillText(items[i], 640, y);
  }
  ctx.fillStyle = '#9aa0b0';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Cash ' + fmtCash(G.player.cash) + ' · Missions done ' + G.stats.missionsDone + '/8 · Fares ' + G.stats.fares, 640, 540);
}

function drawEndScreen(kind) {
  drawWorld(ctx, G);
  ctx.fillStyle = 'rgba(10,0,0,0.72)';
  ctx.fillRect(0, 0, 1280, 720);
  ctx.textAlign = 'center';
  if (kind === 'busted') {
    ctx.fillStyle = '#6aa8ff';
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.fillText('BUSTED', 640, 300);
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('The Solmar PD picked you up. $200 lighter, back on the street.', 640, 350);
  } else if (kind === 'wasted') {
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.fillText('WASTED', 640, 300);
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('Solmar General patched you up. $300 lighter — and the job still waits.', 640, 350);
  } else {
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 64px system-ui, sans-serif';
    ctx.fillText('KING OF SOLMAR', 640, 280);
    ctx.fillStyle = '#fff';
    ctx.font = '22px system-ui, sans-serif';
    ctx.fillText('The debt is settled. The city is yours, Rook.', 640, 330);
    ctx.fillText('Missions 8/8 · Cash ' + fmtCash(G.player.cash) + ' · Kills ' + G.stats.kills, 640, 370);
  }
  ctx.fillStyle = '#ffd24d';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText('Press Enter to continue', 640, 440);
}

function titleClick(my) {
  const items = [380, 436, 492];
  for (let i = 0; i < items.length; i++) {
    if (Math.abs(my - items[i]) < 26) return i;
  }
  return -1;
}

function pauseClick(my) {
  const items = [300, 352, 404, 456];
  for (let i = 0; i < items.length; i++) {
    if (Math.abs(my - items[i]) < 24) return i;
  }
  return -1;
}

// --- Update ----------------------------------------------------------------
function update(dt) {
  G.time += dt;
  G.clock = (G.clock + dt * (86400 / TUNING.dayLength)) % 86400;
  if (G.messageTimer > 0) G.messageTimer -= dt;
  if (G.missionCard && G.missionCard.timer > 0) G.missionCard.timer -= dt;
  if (G.heatLock > 0) {
    G.heatLock -= dt;
    if (G.heatLock <= 0) G.heat = Math.min(G.heat, 40);
  }

  // Mouse position in world coordinates.
  input.mouse.wx = G.camera.x + input.mouse.x;
  input.mouse.wy = G.camera.y + input.mouse.y;

  if (G.screen === 'title') {
    // Slow attract pan across downtown.
    G.camera.x = 1920 - 640 + Math.sin(G.time * 0.05) * 300;
    G.camera.y = 1140 - 360 + Math.cos(G.time * 0.04) * 120;
    if (input.anyPressed(KEYS.up) || input.anyPressed(['ArrowUp'])) G.titleSel = (G.titleSel + 2) % 3;
    if (input.anyPressed(KEYS.down) || input.anyPressed(['ArrowDown'])) G.titleSel = (G.titleSel + 1) % 3;
    if (input.mouse.clicked) {
      const hit = titleClick(input.mouse.y);
      if (hit >= 0) G.titleSel = hit;
    }
    const confirm = input.wasPressed('Enter') || (input.mouse.clicked && titleClick(input.mouse.y) >= 0);
    if (confirm) {
      audio.init();
      audio.startMusic();
      if (G.titleSel === 0) {
        G = newGame(null);
        window.__game = G;
        G.screen = 'play';
        startMission(G, 0);
      } else if (G.titleSel === 1 && hasSave()) {
        G = newGame(loadSave());
        window.__game = G;
        G.screen = 'play';
        if (G.missionIndex < 8) startMission(G, G.missionIndex);
      } else if (G.titleSel === 2) {
        G.screen = 'howto';
      }
      audio.sfx('click');
    }
    return;
  }

  if (G.screen === 'howto') {
    if (input.wasPressed('Enter') || input.wasPressed('Escape')) G.screen = 'title';
    return;
  }

  if (G.screen === 'pause') {
    if (input.anyPressed(KEYS.up)) G.pauseSel = (G.pauseSel + 3) % 4;
    if (input.anyPressed(KEYS.down)) G.pauseSel = (G.pauseSel + 1) % 4;
    if (input.mouse.clicked) {
      const hit = pauseClick(input.mouse.y);
      if (hit >= 0) G.pauseSel = hit;
    }
    const confirm = input.wasPressed('Enter') || (input.mouse.clicked && pauseClick(input.mouse.y) >= 0);
    if (input.anyPressed(KEYS.pause) && !confirm) {
      G.screen = 'play';
    } else if (confirm) {
      if (G.pauseSel === 0) G.screen = 'play';
      if (G.pauseSel === 1) {
        saveGame();
        G.message = 'Game saved.';
        G.messageTimer = 2;
        G.screen = 'play';
      }
      if (G.pauseSel === 2) G.screen = 'howto-pause';
      if (G.pauseSel === 3) {
        saveGame();
        G.screen = 'title';
      }
    }
    return;
  }

  if (G.screen === 'howto-pause') {
    if (input.wasPressed('Enter') || input.wasPressed('Escape')) G.screen = 'pause';
    return;
  }

  if (G.screen === 'busted' || G.screen === 'wasted') {
    if (input.wasPressed('Enter')) {
      if (G.screen === 'busted') respawnAfterBusted(G);
      else respawnAfterWasted(G);
      if (G.mission && G.mission.failed) {
        startMission(G, G.mission.index);
      }
    }
    return;
  }

  if (G.screen === 'win') {
    if (input.wasPressed('Enter')) {
      G.screen = 'play'; // free roam after the finale
      G.mission = null;
    }
    return;
  }

  if (G.screen !== 'play') return;

  // --- Play ---
  if (input.anyPressed(KEYS.pause)) {
    saveGame();
    G.screen = 'pause';
    return;
  }
  if (input.anyPressed(KEYS.mute)) {
    const m = audio.toggleMute();
    G.message = m ? 'Muted' : 'Sound on';
    G.messageTimer = 1.5;
  }
  // Start / retry missions with Enter.
  if (input.wasPressed('Enter')) {
    if (G.mission && G.mission.failed) {
      startMission(G, G.mission.index);
    } else if (!G.mission && G.missionIndex < MISSIONS.length) {
      startMission(G, G.missionIndex);
    }
  }
  // Engine hum follows driving.
  if (G.player.inCar) audio.setEngine(true, Math.abs(G.player.speed) / 400);
  else audio.setEngine(false, 0);

  updatePlayer(G, dt, input);
  updateCombat(G, dt, input);
  updatePeds(G, dt);
  updateTraffic(G, dt);
  updateCops(G, dt);
  updateMission(G, dt);
  updateTaxi(G, dt);

  // Particles.
  for (let i = G.particles.length - 1; i >= 0; i--) {
    const pt = G.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.985;
    pt.vy *= 0.985;
    pt.life -= dt;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
  // Skid marks fade.
  for (const car of G.cars) {
    if (!car.skid) continue;
    for (const s of car.skid) s.life -= dt;
    car.skid = car.skid.filter((s) => s.life > 0);
  }

  // Autosave every 30 s of play.
  G.saveTimer += dt;
  if (G.saveTimer > 30) {
    G.saveTimer = 0;
    saveGame();
  }

  // Mission failed overlay is handled by the HUD text; the player retries
  // with Enter (see above).
  if (G.mission && G.mission.failed && G.missionFailReason) {
    G.message = 'Mission failed: ' + G.missionFailReason + ' — Enter to retry';
    G.messageTimer = Math.max(G.messageTimer, 0.5);
  }
}

// --- Render ----------------------------------------------------------------
function render() {
  ctx.clearRect(0, 0, 1280, 720);
  switch (G.screen) {
    case 'title':
      drawTitle();
      break;
    case 'howto':
    case 'howto-pause':
      drawHowTo();
      break;
    case 'pause':
      drawPause();
      break;
    case 'busted':
      drawEndScreen('busted');
      break;
    case 'wasted':
      drawEndScreen('wasted');
      break;
    case 'win':
      drawEndScreen('win');
      break;
    default:
      drawWorld(ctx, G);
      drawHUD(ctx, G);
      break;
  }
  if (G.screen === 'play' && G.mission && G.mission.failed) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(340, 300, 600, 80);
    ctx.fillStyle = '#ff6666';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText('MISSION FAILED', 640, 330);
    ctx.fillStyle = '#fff';
    ctx.font = '17px system-ui, sans-serif';
    ctx.fillText(G.missionFailReason + ' — press Enter to retry', 640, 360);
  }
}

// --- Fixed-step loop --------------------------------------------------------
let last = performance.now();
let acc = 0;
let frames = 0;

function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  acc += elapsed;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    try {
      update(STEP);
    } catch (e) {
      // One bad update must never freeze the game: log it and keep
      // running so the player can keep playing (and the error stays
      // visible in the console for debugging).
      console.error('update failed:', e);
    }
    input.endStep();
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0;
  render();
  frames++;
  if (frames === 2 && shotName) {
    window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

// Stage a screenshot scene before the first frame.
if (shotName) {
  stageShot(G, shotName);
  // Keep the staged scene still for the shot: freeze play updates by
  // rendering the title-screen backdrop only for 'start'.
  if (shotName === 'start') G.screen = 'title';
}

document.getElementById('status').textContent =
  'Solmar Heat — ' + (shotName ? 'shot: ' + shotName : 'press Enter on the title screen to play');
requestAnimationFrame(frame);
