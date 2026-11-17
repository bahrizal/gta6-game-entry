// Player, cars, pedestrians and police: movement, driving physics, traffic AI,
// wanted heat and the bust/waste rules. All movement collides with the city.
import {
  CAR_MODELS, H_ROADS, MISSION_HEAT_CAP, PLAYER_HP, PLAYER_SPRINT, PLAYER_WALK,
  SAND_EAST, SAND_SOUTH, V_ROADS, WANTED_MAX_HEAT, WORLD_H, WORLD_W,
} from './config.js';
import { collides, districtAt, isSand, isWater, lightFor, onRoad, roadPointNear } from './city.js';

let nextId = 1;

export function createPlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, hp: PLAYER_HP, cash: 200,
    weapon: 'fists', ammo: { pistol: 48, smg: 0 }, mag: { pistol: 12, smg: 0 },
    inCar: null, speed: 0, vx: 0, vy: 0, punchCd: 0, fireCd: 0, hurtT: 0,
    bustT: 0, dead: false, moving: false,
  };
}

export function makeCar(model, x, y, angle, driver) {
  const def = CAR_MODELS[model];
  return {
    id: nextId++, model, label: def.label, x, y, angle, speed: 0, vx: 0, vy: 0,
    color: def.color, roof: def.roof, len: def.len, wid: def.wid,
    maxSpeed: def.maxSpeed, accel: def.accel, handling: def.handling, grip: def.grip,
    health: 100, driver, smoke: 0, brake: false, honkT: 0,
    // Traffic AI state.
    axis: 'v', road: x, dir: 1, lane: 0, turnCd: 0, cruise: def.maxSpeed * 0.55,
    target: null, ramCd: 0,
  };
}

export function spawnParkedCars(state, rng, count) {
  const models = ['sedan', 'taxi', 'coupe', 'pickup', 'van'];
  let placed = 0;
  let guard = 0;
  while (placed < count && guard++ < count * 20) {
    const p = roadPointNear(rng, rng.range(400, 3400), rng.range(400, 2400), 0);
    const axis = rng.chance(0.5) ? 'v' : 'h';
    const angle = axis === 'v' ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const off = axis === 'v' ? 30 : 30;
    const x = axis === 'v' ? p.x + off : p.x;
    const y = axis === 'v' ? p.y : p.y + off;
    if (collides(state.city, x, y, 30)) continue;
    if (state.cars.some((c) => Math.hypot(c.x - x, c.y - y) < 90)) continue;
    const car = makeCar(rng.pick(models), x, y, angle, 'parked');
    car.axis = axis;
    car.road = axis === 'v' ? p.x : p.y;
    state.cars.push(car);
    placed++;
  }
}

export function spawnTraffic(state, rng, count) {
  const models = ['sedan', 'taxi', 'coupe', 'pickup', 'van'];
  for (let i = 0; i < count; i++) {
    const p = roadPointNear(rng, state.player.x + rng.range(-900, 900), state.player.y + rng.range(-700, 700), 400);
    const axis = rng.chance(0.5) ? 'v' : 'h';
    const dir = rng.chance(0.5) ? 1 : -1;
    const angle = axis === 'v' ? (dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (dir > 0 ? 0 : Math.PI);
    const car = makeCar(rng.pick(models), p.x, p.y, angle, 'traffic');
    car.axis = axis;
    car.road = axis === 'v' ? p.x : p.y;
    car.dir = dir;
    car.lane = rng.chance(0.5) ? 22 : -22;
    car.speed = rng.range(110, 180);
    car.cruise = car.speed;
    state.cars.push(car);
  }
}

export function spawnPeds(state, rng, count) {
  const shirts = ['#d94f3d', '#3d7ad9', '#e8c33c', '#7ad93d', '#c03dd9', '#e8e8e8', '#3dd9c0'];
  for (let i = 0; i < count; i++) {
    const p = roadPointNear(rng, state.player.x + rng.range(-800, 800), state.player.y + rng.range(-600, 600), 300);
    const axis = rng.chance(0.5) ? 'v' : 'h';
    state.peds.push({
      id: nextId++, x: p.x + rng.range(-40, 40), y: p.y + rng.range(-40, 40),
      angle: rng.range(0, Math.PI * 2), speed: rng.range(45, 75), color: rng.pick(shirts),
      state: 'walk', axis, road: axis === 'v' ? p.x : p.y, dir: rng.chance(0.5) ? 1 : -1,
      side: rng.chance(0.5) ? 62 : -62, fleeX: 0, fleeY: 0, fleeT: 0, taxiFare: false,
    });
  }
}

export function nearestCar(state, x, y, maxD) {
  let best = null;
  let bestD = maxD;
  for (const c of state.cars) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

// Move a circle through the world, sliding along building walls. Returns true if blocked.
export function moveCircle(state, ent, dx, dy, r) {
  const nx = ent.x + dx;
  if (!collides(state.city, nx, ent.y, r)) ent.x = nx;
  else return true;
  const ny = ent.y + dy;
  if (!collides(state.city, ent.x, ny, r)) ent.y = ny;
  else return true;
  return false;
}

function carBlockedAhead(state, car, dist) {
  const px = car.x + Math.cos(car.angle) * (car.len / 2 + dist);
  const py = car.y + Math.sin(car.angle) * (car.len / 2 + dist);
  if (collides(state.city, px, py, 14)) return true;
  for (const o of state.cars) {
    if (o === car) continue;
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < car.len / 2 + dist + o.len / 2 && side < 30) return true;
  }
  return false;
}

function driveCar(state, car, dt, steerInput, throttle) {
  const def = CAR_MODELS[car.model];
  const target = throttle * def.maxSpeed;
  if (throttle !== 0) {
    const rate = throttle > 0 ? def.accel : def.accel * 0.8;
    car.speed += Math.sign(target - car.speed) * Math.min(Math.abs(target - car.speed), rate * dt);
  } else {
    car.speed *= Math.max(0, 1 - 1.6 * dt);
    if (Math.abs(car.speed) < 4) car.speed = 0;
  }
  const speedFrac = Math.min(1, Math.abs(car.speed) / def.maxSpeed);
  car.angle += steerInput * def.handling * speedFrac * dt * (car.speed < 0 ? -1 : 1) * 0.9;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const desiredVx = fx * car.speed;
  const desiredVy = fy * car.speed;
  const g = Math.min(1, def.grip * dt);
  car.vx += (desiredVx - car.vx) * g;
  car.vy += (desiredVy - car.vy) * g;
  const blocked = moveCircle(state, car, car.vx * dt, car.vy * dt, 20);
  if (blocked) {
    if (Math.abs(car.speed) > 260) {
      car.health -= Math.abs(car.speed) * 0.08;
      state.shake = Math.min(14, state.shake + 6);
      state.audio.crash();
      spawnSmoke(state, car.x, car.y, 8);
      if (car.driver === 'player') damagePlayer(state, Math.abs(car.speed) * 0.03);
    }
    car.speed *= -0.25;
    car.vx *= -0.25;
    car.vy *= -0.25;
  }
  if (Math.abs(car.speed) > 300 && steerInput !== 0 && Math.random() < 0.3) {
    state.skids.push({ x: car.x - fx * car.len / 2, y: car.y - fy * car.len / 2, a: car.angle, life: 2.5 });
  }
  if (car.health < 45) {
    car.smoke += dt;
    if (car.smoke > 0.12) {
      car.smoke = 0;
      spawnSmoke(state, car.x - fx * car.len / 2, car.y - fy * car.len / 2, 1);
    }
  }
  if (car.health <= 0 && car.driver !== 'player') {
    explodeCar(state, car);
  }
}

export function spawnSmoke(state, x, y, n) {
  for (let i = 0; i < n; i++) {
    state.particles.push({
      x: x + (Math.random() - 0.5) * 20, y: y + (Math.random() - 0.5) * 20,
      vx: (Math.random() - 0.5) * 30, vy: -30 - Math.random() * 30,
      life: 0.8 + Math.random() * 0.6, maxLife: 1.4, size: 5 + Math.random() * 7,
      color: '#888888', kind: 'smoke',
    });
  }
}

export function explodeCar(state, car) {
  const wasPlayer = car.driver === 'player';
  car.health = 0;
  car.driver = 'wreck';
  state.shake = Math.min(18, state.shake + 10);
  state.audio.explosion();
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 260;
    state.particles.push({
      x: car.x, y: car.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0.5 + Math.random() * 0.7, maxLife: 1.2, size: 3 + Math.random() * 6,
      color: Math.random() < 0.5 ? '#ff8c1a' : '#ffd23c', kind: 'fire',
    });
  }
  spawnSmoke(state, car.x, car.y, 14);
  if (wasPlayer) {
    // The player is thrown clear of the wreck.
    state.player.inCar = null;
    state.player.x = car.x + 60;
    state.player.y = car.y + 60;
    damagePlayer(state, 30);
  }
  if (state.mission.active && state.mission.data.chaseCar === car) {
    state.mission.data.chaseDown = true;
  }
}

export function damagePlayer(state, amount) {
  if (state.player.dead) return;
  state.player.hp -= amount;
  state.player.hurtT = 0.5;
  if (state.player.hp <= 0) {
    state.player.hp = 0;
    state.player.dead = true;
  }
}

export function addHeat(state, amount) {
  state.wanted.heat = Math.min(WANTED_MAX_HEAT, state.wanted.heat + amount);
  if (state.mission.active) {
    state.wanted.heat = Math.min(MISSION_HEAT_CAP, state.wanted.heat);
  }
  state.wanted.stars = Math.ceil(state.wanted.heat / 20);
  state.wanted.lastCrime = state.time;
}

export function starsOf(heat) {
  return Math.ceil(heat / 20);
}

function updatePlayerOnFoot(state, input, dt) {
  const p = state.player;
  const dir = input.direction();
  const sprint = input.sprinting();
  const speed = sprint ? PLAYER_SPRINT : PLAYER_WALK;
  p.moving = dir.x !== 0 || dir.y !== 0;
  if (p.moving) {
    const targetAngle = Math.atan2(dir.y, dir.x);
    let diff = targetAngle - p.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    p.angle += diff * Math.min(1, 14 * dt);
    moveCircle(state, p, dir.x * speed * dt, dir.y * speed * dt, 14);
  }
  // Aim follows the mouse; the player faces the cursor when shooting.
  const cam = state.camera;
  const worldMouseX = cam.x + input.mouse.x - 640;
  const worldMouseY = cam.y + input.mouse.y - 360;
  if (input.mouse.down || p.weapon !== 'fists') {
    p.angle = Math.atan2(worldMouseY - p.y, worldMouseX - p.x);
  }
  p.punchCd = Math.max(0, p.punchCd - dt);
  p.fireCd = Math.max(0, p.fireCd - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
}

function updatePlayerDriving(state, input, dt) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  const dir = input.direction();
  let throttle = 0;
  if (dir.y < 0) throttle = 1;
  else if (dir.y > 0) throttle = -0.7;
  let steer = 0;
  if (dir.x < 0) steer = -1;
  else if (dir.x > 0) steer = 1;
  car.brake = dir.y > 0 && car.speed > 60;
  driveCar(state, car, dt, steer, throttle);
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = car.speed;
  state.audio.setEngine(Math.min(1, Math.abs(car.speed) / car.maxSpeed), true);
}

export function updatePlayer(state, input, dt) {
  if (state.player.dead) return;
  if (state.player.inCar) updatePlayerDriving(state, input, dt);
  else {
    updatePlayerOnFoot(state, input, dt);
    state.audio.setEngine(0, false);
  }
}

export function enterCar(state, car) {
  const p = state.player;
  if (car.driver === 'traffic' || car.driver === 'parked' || car.driver === 'mission') {
    // Stealing a car with a driver inside: the driver bails and flees.
    if (car.driver === 'traffic') {
      state.peds.push({
        id: nextId++, x: car.x + 40, y: car.y + 40, angle: 0, speed: 200, color: '#e8c33c',
        state: 'flee', axis: 'v', road: car.x, dir: 1, side: 0, fleeX: car.x, fleeY: car.y, fleeT: 4, taxiFare: false,
      });
      addHeat(state, 15);
      state.stats.carsStolen += 1;
    }
    car.driver = 'player';
  }
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  state.audio.unlock();
}

export function exitCar(state) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'parked';
  car.speed = 0;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 44;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 44;
  if (collides(state.city, p.x, p.y, 14)) {
    p.x = car.x - Math.cos(car.angle + Math.PI / 2) * 44;
    p.y = car.y - Math.sin(car.angle + Math.PI / 2) * 44;
  }
}

function updateTrafficCar(state, car, dt) {
  car.turnCd = Math.max(0, car.turnCd - dt);
  const axisRoads = car.axis === 'v' ? V_ROADS : H_ROADS;
  const crossRoads = car.axis === 'v' ? H_ROADS : V_ROADS;
  const pos = car.axis === 'v' ? car.y : car.x;
  // Approaching an intersection: maybe turn, and obey the light.
  let nearestCross = null;
  let nearestD = Infinity;
  for (const cr of crossRoads) {
    const d = (cr - pos) * car.dir;
    if (d > 0 && d < nearestD) {
      nearestD = d;
      nearestCross = cr;
    }
  }
  let targetSpeed = car.cruise;
  if (nearestCross !== null && nearestD < 110) {
    const light = state.city.lights.find((l) => (car.axis === 'v' ? l.x === car.road && l.y === nearestCross : l.y === car.road && l.x === nearestCross));
    if (light && !lightFor(light, state.time, car.axis)) targetSpeed = 0;
    if (nearestD < 55 && car.turnCd <= 0 && Math.random() < 0.45) {
      // Turn onto the crossing road.
      const newAxis = car.axis === 'v' ? 'h' : 'v';
      const newDir = Math.random() < 0.5 ? 1 : -1;
      car.axis = newAxis;
      car.dir = newDir;
      car.road = nearestCross;
      car.lane = Math.random() < 0.5 ? 22 : -22;
      car.angle = newAxis === 'v' ? (newDir > 0 ? Math.PI / 2 : -Math.PI / 2) : (newDir > 0 ? 0 : Math.PI);
      car.turnCd = 2;
    }
  }
  if (carBlockedAhead(state, car, 60)) targetSpeed = Math.min(targetSpeed, 40);
  car.speed += (targetSpeed - car.speed) * Math.min(1, 1.8 * dt);
  if (car.speed < 1) car.speed = 0;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  // Stay in lane: gently pull back toward the lane line.
  const lanePos = car.axis === 'v' ? car.x : car.y;
  const laneTarget = car.road + car.lane;
  const off = laneTarget - lanePos;
  const px = -Math.sin(car.angle);
  const py = Math.cos(car.angle);
  const nx = car.x + (fx * car.speed + px * off * 0.8) * dt;
  const ny = car.y + (fy * car.speed + py * off * 0.8) * dt;
  if (!collides(state.city, nx, ny, 20)) {
    car.x = nx;
    car.y = ny;
  } else {
    car.speed = 0;
  }
  // Keep inside the road network; respawn far away if lost.
  if (car.x < 200 || car.x > WORLD_W - 200 || car.y < 200 || car.y > WORLD_H - 200) {
    const p = roadPointNear(state.rng, state.player.x, state.player.y, 700);
    car.x = p.x;
    car.y = p.y;
  }
}

function updatePoliceCruiser(state, car, dt) {
  const p = state.player;
  car.ramCd = Math.max(0, car.ramCd - dt);
  const dx = p.x - car.x;
  const dy = p.y - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  let throttle = 1;
  if (dist < 90) throttle = 0.4;
  driveCar(state, car, dt, steer, throttle);
  // Ram the player's car or the player on foot.
  if (dist < 70 && car.ramCd <= 0) {
    car.ramCd = 0.8;
    if (p.inCar) {
      p.inCar.health -= 6;
      state.shake = Math.min(12, state.shake + 5);
      state.audio.crash();
      if (p.inCar.health <= 0) explodeCar(state, p.inCar);
    } else {
      damagePlayer(state, 12);
      state.shake = Math.min(12, state.shake + 5);
    }
  }
  if (dist > 1800) {
    const pos = roadPointNear(state.rng, p.x, p.y, 800);
    car.x = pos.x;
    car.y = pos.y;
  }
}

export function updateCars(state, dt) {
  for (const car of state.cars) {
    if (car.driver === 'traffic') updateTrafficCar(state, car, dt);
    else if (car.driver === 'police') updatePoliceCruiser(state, car, dt);
    else if (car.driver === 'wreck') {
      car.speed *= Math.max(0, 1 - 2 * dt);
    }
  }
  // Thin out traffic far from the player so the world stays lively nearby.
  if (state.cars.filter((c) => c.driver === 'traffic').length < 10) {
    spawnTraffic(state, state.rng, 2);
  }
}

export function updatePeds(state, dt) {
  const p = state.player;
  for (const ped of state.peds) {
    if (ped.state === 'flee') {
      ped.fleeT -= dt;
      const dx = ped.x - ped.fleeX;
      const dy = ped.y - ped.fleeY;
      const d = Math.hypot(dx, dy) || 1;
      ped.angle = Math.atan2(dy, dx);
      moveCircle(state, ped, (dx / d) * ped.speed * 2.4 * dt, (dy / d) * ped.speed * 2.4 * dt, 12);
      if (ped.fleeT <= 0) ped.state = 'walk';
      continue;
    }
    // Panic: gunfire nearby makes peds run.
    const gunD = state.lastShot ? Math.hypot(ped.x - state.lastShot.x, ped.y - state.lastShot.y) : Infinity;
    if (gunD < 320) {
      ped.state = 'flee';
      ped.fleeX = state.lastShot.x;
      ped.fleeY = state.lastShot.y;
      ped.fleeT = 3;
      continue;
    }
    // Walk the sidewalk along a road.
    const along = ped.axis === 'v' ? ped.y : ped.x;
    const cross = ped.axis === 'v' ? H_ROADS : V_ROADS;
    let near = null;
    let nd = Infinity;
    for (const cr of cross) {
      const d = (cr - along) * ped.dir;
      if (d > 0 && d < nd) {
        nd = d;
        near = cr;
      }
    }
    if (near !== null && nd < 8 && Math.random() < 0.4) {
      ped.axis = ped.axis === 'v' ? 'h' : 'v';
      ped.road = near;
      ped.dir = Math.random() < 0.5 ? 1 : -1;
      ped.side = Math.random() < 0.5 ? 62 : -62;
    }
    const mx = ped.axis === 'v' ? 0 : ped.dir;
    const my = ped.axis === 'v' ? ped.dir : 0;
    ped.angle = Math.atan2(my, mx);
    const tx = ped.axis === 'v' ? ped.road + ped.side : ped.x;
    const ty = ped.axis === 'v' ? ped.y : ped.road + ped.side;
    const blocked = moveCircle(state, ped, (tx - ped.x) * 2 * dt + mx * ped.speed * dt, (ty - ped.y) * 2 * dt + my * ped.speed * dt, 12);
    if (blocked) ped.dir *= -1;
    if (ped.x < 100 || ped.x > WORLD_W - 100 || ped.y < 100 || ped.y > WORLD_H - 100) {
      const q = roadPointNear(state.rng, p.x, p.y, 600);
      ped.x = q.x;
      ped.y = q.y;
    }
  }
  // Keep the sidewalks populated near the player.
  if (state.peds.filter((q) => Math.hypot(q.x - p.x, q.y - p.y) < 900).length < 12) {
    spawnPeds(state, state.rng, 3);
  }
  // Cap the crowd: drop the peds farthest from the player.
  if (state.peds.length > 36) {
    state.peds.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
    state.peds.length = 36;
  }
}

export function spawnCop(state, onFoot) {
  const p = state.player;
  const pos = roadPointNear(state.rng, p.x, p.y, 750);
  if (onFoot) {
    state.cops.push({
      id: nextId++, x: pos.x, y: pos.y, angle: 0, hp: 60, speed: 205,
      state: 'chase', shootCd: 1, bustT: 0, weapon: 'pistol',
    });
  } else {
    const car = makeCar('cruiser', pos.x, pos.y, 0, 'police');
    car.speed = 200;
    state.cars.push(car);
  }
}

export function updatePolice(state, dt) {
  const p = state.player;
  const stars = state.wanted.stars;
  const wantFoot = stars >= 1 ? Math.min(3, stars) : 0;
  const wantCars = stars >= 2 ? Math.min(3, stars - 1) : 0;
  const foot = state.cops.length;
  const cruisers = state.cars.filter((c) => c.driver === 'police').length;
  if (foot < wantFoot && Math.random() < dt * 1.5) spawnCop(state, true);
  if (cruisers < wantCars && Math.random() < dt * 1.2) spawnCop(state, false);

  for (const cop of state.cops) {
    const dx = p.x - cop.x;
    const dy = p.y - cop.y;
    const dist = Math.hypot(dx, dy) || 1;
    cop.angle = Math.atan2(dy, dx);
    if (stars === 0) {
      // No heat: cops wander off and leave.
      cop.state = 'leave';
      moveCircle(state, cop, -dx / dist * cop.speed * 0.5 * dt, -dy / dist * cop.speed * 0.5 * dt, 12);
      if (dist > 1400) cop.gone = true;
      continue;
    }
    if (p.inCar) {
      // On foot cops cannot catch a car; they hold position and radio it in.
      cop.state = 'hold';
      cop.shootCd -= dt;
      if (dist < 420 && cop.shootCd <= 0) {
        cop.shootCd = 1.4;
        state.combat.enemyShoot(state, cop);
      }
      continue;
    }
    cop.state = 'chase';
    // During a story mission cops close in and shoot, but they never bust
    // Rook mid-mission: a scripted shootout must not end on a touch.
    if (state.mission.active && dist < 150) {
      cop.shootCd -= dt;
      if (cop.shootCd <= 0) {
        cop.shootCd = 1.6;
        state.combat.enemyShoot(state, cop);
      }
    } else {
      moveCircle(state, cop, (dx / dist) * cop.speed * dt, (dy / dist) * cop.speed * dt, 12);
    }
    if (dist < 48 && !state.mission.active) {
      cop.bustT += dt;
      if (cop.bustT > 1.2) {
        state.screen = 'busted';
        state.audio.fail();
        return;
      }
    } else {
      cop.bustT = 0;
    }
    cop.shootCd -= dt;
    if (dist < 380 && dist > 120 && cop.shootCd <= 0) {
      cop.shootCd = 1.6;
      state.combat.enemyShoot(state, cop);
    }
  }
  state.cops = state.cops.filter((c) => !c.gone && c.hp > 0);
  // Cruisers with no heat cruise away and despawn.
  if (stars === 0) {
    for (const car of state.cars) {
      if (car.driver === 'police') car.driver = 'traffic';
    }
  }
}

export function updateWanted(state, dt) {
  const w = state.wanted;
  const p = state.player;
  const copNear = state.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 520)
    || state.cars.some((c) => c.driver === 'police' && Math.hypot(c.x - p.x, c.y - p.y) < 520);
  if (!copNear && state.time - w.lastCrime > 6) {
    w.heat = Math.max(0, w.heat - 1.6 * dt);
  }
  if (state.mission.active) w.heat = Math.min(MISSION_HEAT_CAP, w.heat);
  w.stars = starsOf(w.heat);
}

export function updateParticles(state, dt) {
  for (const pt of state.particles) {
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= Math.max(0, 1 - 2 * dt);
    pt.vy *= Math.max(0, 1 - 2 * dt);
  }
  state.particles = state.particles.filter((pt) => pt.life > 0);
  for (const s of state.skids) s.life -= dt;
  state.skids = state.skids.filter((s) => s.life > 0);
}
