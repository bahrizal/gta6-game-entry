// Deterministic staged scenes for screenshots (?shot=<name>&seed=N).
// Each builds REAL world state with the game's own systems, paints it, and
// the boot code sets window.__shotReady. No edited or borrowed images.
import { enterCar, makeCar, spawnPeds, spawnTraffic } from './entities.js';
import { combat } from './combat.js';
import { objectiveText, startMission, waypoint } from './missions.js';

function baseScene(state, clock, px, py) {
  state.clock = clock;
  state.player.x = px;
  state.player.y = py;
  state.player.hp = 100;
  state.player.inCar = null;
  state.camera.x = px;
  state.camera.y = py;
  state.cars = state.cars.filter((c) => c.driver === 'parked');
  state.peds = [];
  state.enemies = [];
  state.cops = [];
  state.bullets = [];
  state.particles = [];
  state.wanted.heat = 0;
  state.wanted.stars = 0;
  spawnTraffic(state, state.rng, 12);
  spawnPeds(state, state.rng, 16);
}

export function stageShot(name, state) {
  const p = state.player;
  if (name === 'start') {
    // Title screen over the city at dusk.
    baseScene(state, 18.4, 1920, 1200);
    state.screen = 'title';
    state.titleMenu = 0;
    return { screen: 'title' };
  }
  if (name === 'drive') {
    // Daylight downtown drive: Rook in a coupe, traffic, 2 stars, cruisers behind.
    baseScene(state, 13.0, 1920, 1200);
    const coupe = makeCar('coupe', 1920, 1200, 0, 'parked');
    coupe.speed = 260;
    state.cars.push(coupe);
    enterCar(state, coupe);
    p.cash = 2450;
    state.wanted.heat = 40;
    state.wanted.stars = 2;
    for (let i = 0; i < 2; i++) {
      const cruiser = makeCar('cruiser', 1920 - 160 - i * 120, 1200 + (i === 0 ? 26 : -26), 0, 'police');
      cruiser.speed = 260;
      state.cars.push(cruiser);
    }
    state.screen = 'play';
    return { screen: 'play' };
  }
  if (name === 'mission') {
    // Night shootout at the docks: mission 3 live, briefing already cleared.
    baseScene(state, 22.2, 560, 2050);
    p.weapon = 'smg';
    p.mag.smg = 28;
    p.ammo.smg = 120;
    p.cash = 3800;
    startMission(state, 2);
    state.mission.briefingT = 0;
    // Advance to the kill step and spawn the crew.
    state.mission.step = 1;
    state.stats.missionKills = 0;
    combat.spawnGoons(state, 480, 2100, 6, { weapon: 'smg' });
    state.mission.data.spawned = true;
    // A few live bullets + muzzle flashes so the firefight reads in one frame.
    for (let i = 0; i < 3; i++) {
      const a = -0.4 + i * 0.5;
      state.bullets.push({
        x: p.x + Math.cos(a) * 60, y: p.y + Math.sin(a) * 60,
        vx: Math.cos(a) * 1050, vy: Math.sin(a) * 1050,
        life: 0.4, damage: 13, from: 'player',
      });
    }
    state.muzzle = { x: p.x + 30, y: p.y, t: 0.06 };
    state.wanted.heat = 40;
    state.wanted.stars = 2;
    state.objective = objectiveText(state);
    state.waypoint = waypoint(state);
    state.screen = 'play';
    return { screen: 'play' };
  }
  if (name === 'night') {
    // Night cruise on the beach road: headlights, palms, 1 star.
    baseScene(state, 23.4, 2000, 2400);
    const sedan = makeCar('sedan', 2000, 2400, 0, 'parked');
    sedan.speed = 220;
    state.cars.push(sedan);
    enterCar(state, sedan);
    p.cash = 5120;
    state.wanted.heat = 20;
    state.wanted.stars = 1;
    const cruiser = makeCar('cruiser', 2000 - 260, 2400 + 26, 0, 'police');
    cruiser.speed = 220;
    state.cars.push(cruiser);
    state.screen = 'play';
    return { screen: 'play' };
  }
  // Unknown shot name: fall back to the title.
  baseScene(state, 17.5, 1920, 1200);
  state.screen = 'title';
  return { screen: 'title' };
}
