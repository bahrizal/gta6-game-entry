// Deterministic staged scenes for screenshots: each builds REAL world
// state with the game's own systems, then the game paints it.
// ?shot=start | drive | mission | night  (with &seed=1)
import { TUNING } from './config.js';
import { makeCar, spawnTrafficCar, spawnPed, burst } from './entities.js';
import { spawnEnemy, spawnPickup } from './combat.js';
import { startMission } from './missions.js';

function parkCars(G, spots) {
  for (const [x, y, a] of spots) {
    const car = makeCar('sedan', x, y, a, 'none');
    G.cars.push(car);
  }
}

export function stageShot(G, name) {
  const p = G.player;
  if (name === 'start') {
    // Title screen over the city at dusk.
    G.clock = TUNING.duskClock;
    p.x = 1920;
    p.y = 1140;
    G.camera.x = 1920 - 640;
    G.camera.y = 1140 - 360;
    parkCars(G, [[1830, 1200, 0], [2010, 1200, Math.PI], [1920, 1290, Math.PI / 2]]);
    spawnPed(G, 1860, 1080);
    spawnPed(G, 1980, 1080);
    G.screen = 'title';
  } else if (name === 'drive') {
    // Driving downtown in daylight, traffic around, 2 stars on the HUD.
    G.clock = 11 * 3600;
    const car = makeCar('coupe', 1920, 1200, 0, 'player');
    car.color = '#8e2f8f';
    car.speed = 260;
    G.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = 0;
    p.cash = 1240;
    G.heat = 30;
    G.wanted = 2;
    for (let i = 0; i < 5; i++) spawnTrafficCar(G, 1920, 1200);
    spawnPed(G, 1850, 1080);
    spawnPed(G, 2100, 1320);
    spawnPed(G, 1700, 1140);
    G.screen = 'play';
  } else if (name === 'mission') {
    // Docks shootout at night: mission 3 in progress, muzzle flashes.
    G.clock = 22 * 3600 + 30 * 60;
    p.x = 840;
    p.y = 2280;
    p.angle = -Math.PI / 2;
    p.weapon = 'smg';
    p.ammo.smg = 90;
    p.cash = 2480;
    G.heat = 55;
    G.wanted = 3;
    startMission(G, 2);
    G.mission.stage = 1;
    G.mission.state.total = 5;
    G.mission.state.kills = 0;
    const spots = [[720, 2260], [960, 2260], [680, 2140], [1000, 2140], [840, 2320]];
    for (const [x, y] of spots) spawnEnemy(G, x, y, 'goon');
    spawnPickup(G, 900, 2200, 'health', 25);
    // A burst of live fire for the frame.
    G.bullets.push({ x: 840, y: 2240, vx: 0, vy: -900, life: 0.4, damage: 14, from: 'player' });
    G.bullets.push({ x: 880, y: 2100, vx: 300, vy: 700, life: 0.4, damage: 8, from: 'enemy' });
    burst(G, 840, 2250, 6, '#ffd24d', 140, 0.2);
    burst(G, 880, 2100, 6, '#ffd24d', 140, 0.2);
    G.screen = 'play';
  } else if (name === 'night') {
    // Night cruise on the beach road, headlights on, 1 star.
    G.clock = 23 * 3600;
    const car = makeCar('sedan', 2400, 2460, 0, 'player');
    car.color = '#c23b2e';
    car.speed = 220;
    G.cars.push(car);
    p.inCar = car;
    p.x = car.x;
    p.y = car.y;
    p.angle = 0;
    p.cash = 3120;
    G.heat = 12;
    G.wanted = 1;
    for (let i = 0; i < 3; i++) spawnTrafficCar(G, 2400, 2460);
    spawnPed(G, 2300, 2500);
    G.screen = 'play';
  }
  G.shotStaged = name;
}
