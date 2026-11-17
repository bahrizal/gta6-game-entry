// Player, pedestrians, traffic and police — movement, driving, stealing,
// the wanted system and busted/wasted.
import { WORLD, CAR_MODELS, TUNING, KEYS } from './config.js';
import { mulberry32, range, pick, clamp, dist, angleTo, angleDiff } from './random.js';
import { isRoad, isWater, isBeach, collidesBuilding, resolveCircle, randomLane, randomSidewalkPoint, randomStreetPoint, roadPointNear } from './city.js';

let nextId = 1;

export function burst(G, x, y, n, color, speed, life) {
  for (let i = 0; i < n; i++) {
    const a = G.rng() * Math.PI * 2;
    const s = range(G.rng, speed * 0.3, speed);
    G.particles.push({
      x, y,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: range(G.rng, life * 0.5, life), maxLife: life,
      color, size: range(G.rng, 2, 5),
    });
  }
}

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0,
    hp: TUNING.playerHp, maxHp: TUNING.playerHp,
    cash: 250, weapon: 'fists',
    ammo: { pistol: 24, smg: 0 },
    inCar: null, speed: 0, moving: false,
    fireCooldown: 0, reloadTimer: 0,
    bustedTimer: 0, hurtFlash: 0, invuln: 0,
  };
}

export function makeCar(model, x, y, angle, driver) {
  const spec = CAR_MODELS[model];
  return {
    id: nextId++, model, spec,
    x, y, angle, speed: 0,
    color: pick(mulberry32((Math.random() * 1e9) | 0), spec.colors),
    hp: spec.hp, maxHp: spec.hp,
    driver: driver || 'traffic',
    smoke: 0, skid: [], targetSpeed: 0,
    ai: null, despawn: 0, stuck: 0,
  };
}

export function spawnTrafficCar(G, nearX, nearY) {
  const lane = randomLane(G.rng);
  let x = lane.x;
  let y = lane.y;
  if (nearX !== undefined) {
    // Try to place it on a road within ~700 of the focus point.
    for (let tries = 0; tries < 8; tries++) {
      const l = randomLane(G.rng);
      if (dist(l.x, l.y, nearX, nearY) < 750 && dist(l.x, l.y, nearX, nearY) > 260) {
        x = l.x; y = l.y;
        lane.angle = l.angle; lane.axis = l.axis; lane.dir = l.dir; lane.road = l.road;
        break;
      }
    }
  }
  const models = ['sedan', 'sedan', 'taxi', 'coupe', 'pickup', 'van'];
  const car = makeCar(pick(G.rng, models), x, y, lane.angle, 'traffic');
  car.speed = range(G.rng, 110, 170);
  car.ai = { axis: lane.axis, dir: lane.dir, road: lane.road, turnAt: 0 };
  G.cars.push(car);
  return car;
}

export function spawnParkedCar(G, x, y) {
  const models = ['sedan', 'coupe', 'pickup', 'van', 'taxi'];
  const car = makeCar(pick(G.rng, models), x, y, pick(G.rng, [0, Math.PI / 2, Math.PI, -Math.PI / 2]), 'none');
  G.cars.push(car);
  return car;
}

export function spawnPed(G, x, y) {
  const p = x !== undefined ? { x, y } : randomSidewalkPoint(G.rng);
  const ped = {
    id: nextId++,
    x: p.x, y: p.y,
    angle: G.rng() * Math.PI * 2,
    speed: range(G.rng, 40, 70),
    hp: 30, state: 'walk', panic: 0,
    color: pick(G.rng, ['#e05a5a', '#5a8ae0', '#e0b45a', '#7ab57a', '#b57ad8', '#e08a5a', '#5ad8d0']),
    walkPhase: G.rng() * 10, retarget: 0, dead: 0,
  };
  G.peds.push(ped);
  return ped;
}

export function spawnCop(G, kind) {
  const p = roadPointNear(G.player.x, G.player.y, G.rng, 120);
  // Push the spawn out to 500-700 away from the player.
  const a = angleTo(G.player.x, G.player.y, p.x, p.y);
  const d = range(G.rng, 520, 680);
  const x = clamp(G.player.x + Math.cos(a) * d, 80, WORLD.W - 80);
  const y = clamp(G.player.y + Math.sin(a) * d, 80, WORLD.BEACH_Y - 80);
  if (kind === 'cruiser') {
    const car = makeCar('cruiser', x, y, a, 'cop');
    car.speed = 200;
    G.cars.push(car);
    const cop = { id: nextId++, kind: 'cruiser', car, x, y, hp: 60, state: 'chase' };
    G.cops.push(cop);
    return cop;
  }
  const cop = {
    id: nextId++, kind: 'foot', x, y,
    angle: a, hp: 60, state: 'chase', punchTimer: 0, car: null,
  };
  G.cops.push(cop);
  return cop;
}

export function addHeat(G, amount, reason) {
  G.heat = clamp(G.heat + amount, 0, 100);
  G.lastCrime = G.time;
  if (reason) G.crimeFlash = reason;
}

export function wantedStars(heat) {
  if (heat >= 85) return 5;
  if (heat >= 65) return 4;
  if (heat >= 45) return 3;
  if (heat >= 25) return 2;
  if (heat >= 10) return 1;
  return 0;
}

export function nearestCar(G, x, y, maxD) {
  let best = null;
  let bestD = maxD * maxD;
  for (const c of G.cars) {
    const d2 = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
    if (d2 < bestD) { bestD = d2; best = c; }
  }
  return best;
}

function moveOnFoot(G, p, dx, dy, dt, radius) {
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return false;
  const nx = p.x + (dx / len) * p.speed * dt;
  const ny = p.y + (dy / len) * p.speed * dt;
  const pos = resolveCircle(G.city.buildings, nx, ny, radius);
  if (isWater(pos.x, pos.y)) return false;
  p.x = pos.x;
  p.y = pos.y;
  p.angle = Math.atan2(dy, dx);
  return true;
}

export function updatePlayer(G, dt, input) {
  const p = G.player;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.hurtFlash > 0) p.hurtFlash -= dt;
  if (p.fireCooldown > 0) p.fireCooldown -= dt;
  if (p.reloadTimer > 0) p.reloadTimer -= dt;

  if (p.inCar) {
    updateDriving(G, dt, input);
    return;
  }

  // On foot.
  let dx = 0;
  let dy = 0;
  if (input.anyDown(KEYS.up)) dy -= 1;
  if (input.anyDown(KEYS.down)) dy += 1;
  if (input.anyDown(KEYS.left)) dx -= 1;
  if (input.anyDown(KEYS.right)) dx += 1;
  const sprint = input.anyDown(KEYS.sprint);
  p.speed = sprint ? TUNING.playerSprint : TUNING.playerWalk;
  p.moving = moveOnFoot(G, p, dx, dy, dt, 14);
  if (p.moving) p.walkPhase = (p.walkPhase || 0) + dt * 10;

  // Aim at the mouse; the player faces the cursor when armed.
  const cam = G.camera;
  const mx = input.mouse.wx - p.x;
  const my = input.mouse.wy - p.y;
  if (Math.hypot(mx, my) > 24) p.angle = Math.atan2(my, mx);

  // Enter / steal a car.
  if (input.anyPressed(KEYS.enterCar)) {
    const car = nearestCar(G, p.x, p.y, 64);
    if (car) stealCar(G, car);
  }
  // Weapon switching.
  if (input.wasPressed('Digit1')) p.weapon = 'fists';
  if (input.wasPressed('Digit2') && p.ammo.pistol >= 0) p.weapon = 'pistol';
  if (input.wasPressed('Digit3') && p.ammo.smg > 0) p.weapon = 'smg';
}

export function stealCar(G, car) {
  const p = G.player;
  if (car.driver === 'traffic') {
    // The driver bails and flees.
    const d = spawnPed(G, car.x + 30, car.y);
    d.state = 'flee';
    d.panic = 3;
    addHeat(G, TUNING.heatPerCarTheft, 'Car stolen');
    G.stats.carsStolen++;
    G.audio.sfx('sirenBlip');
    G.message = 'Car stolen — the cops noticed!';
    G.messageTimer = 2.5;
  } else if (car.driver === 'cop') {
    addHeat(G, TUNING.heatPerCarTheft * 2, 'Cruiser stolen');
  }
  car.driver = 'player';
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  G.audio.setEngine(true, 0);
}

export function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  car.driver = 'none';
  car.speed = 0;
  p.inCar = null;
  p.x = car.x - Math.cos(car.angle) * 34;
  p.y = car.y - Math.sin(car.angle) * 34;
  const pos = resolveCircle(G.city.buildings, p.x, p.y, 14);
  p.x = pos.x;
  p.y = pos.y;
  G.audio.setEngine(false, 0);
}

function updateDriving(G, dt, input) {
  const p = G.player;
  const car = p.inCar;
  const spec = car.spec;
  const fwd = input.anyDown(KEYS.up);
  const back = input.anyDown(KEYS.down);
  const left = input.anyDown(KEYS.left);
  const right = input.anyDown(KEYS.right);

  if (fwd) car.speed += spec.accel * dt;
  else if (back) car.speed -= (car.speed > 5 ? spec.brake : spec.accel * 0.6) * dt;
  else {
    const drag = 90 * dt;
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), drag);
  }
  car.speed = clamp(car.speed, -spec.top * 0.45, spec.top);

  const spd = Math.abs(car.speed);
  const steer = (left ? -1 : 0) + (right ? 1 : 0);
  if (spd > 8) {
    const turnRate = spec.grip * (1 - Math.min(spd / spec.top, 0.75) * 0.45);
    car.angle += steer * turnRate * dt * Math.sign(car.speed);
    // Skid marks at hard turns.
    if (Math.abs(steer) > 0 && spd > 220) {
      car.skid.push({ x: car.x, y: car.y, life: 4 });
      if (car.skid.length > 40) car.skid.shift();
      if (G.rng() < 0.3) burst(G, car.x, car.y, 1, '#888888', 30, 0.5);
    }
  }

  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const before = { x: car.x, y: car.y };
  const pos = resolveCircle(G.city.buildings, nx, ny, 18);
  car.x = pos.x;
  car.y = pos.y;
  const hitWall = Math.abs(pos.x - nx) > 0.5 || Math.abs(pos.y - ny) > 0.5;
  if (hitWall && spd > 60) {
    car.speed *= -0.25;
    car.hp -= Math.floor(spd / 22);
    G.audio.sfx('crash');
    burst(G, car.x, car.y, 10, '#ffcc88', 120, 0.6);
    G.camera.shake = Math.min(G.camera.shake + 6, 12);
    if (car.hp <= 0) explodeCar(G, car);
  }
  if (isWater(car.x, car.y)) {
    car.x = before.x;
    car.y = before.y;
    car.speed *= -0.3;
  }
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  p.speed = car.speed;

  // Damage smoke and exhaust.
  if (car.hp < car.maxHp * 0.4) {
    car.smoke += dt;
    if (car.smoke > 0.08) {
      car.smoke = 0;
      burst(G, car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, '#555555', 20, 0.9);
    }
  }
  if (spd > 40 && G.rng() < 0.25) {
    burst(G, car.x - Math.cos(car.angle) * 22, car.y - Math.sin(car.angle) * 22, 1, '#aaaaaa', 15, 0.4);
  }

  // Car vs car.
  for (const other of G.cars) {
    if (other === car) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 40 && d > 0.01) {
      const push = (40 - d) / 2;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * push;
      car.y += uy * push;
      if (other.driver !== 'player') {
        other.x -= ux * push;
        other.y -= uy * push;
        other.speed *= 0.6;
      }
      if (spd > 120) {
        car.hp -= 4;
        other.hp -= 4;
        G.audio.sfx('crash');
        burst(G, (car.x + other.x) / 2, (car.y + other.y) / 2, 8, '#ffcc88', 100, 0.5);
        if (other.hp <= 0) explodeCar(G, other);
        if (car.hp <= 0) explodeCar(G, car);
      }
    }
  }

  // Car vs ped: running someone over is a crime.
  for (const ped of G.peds) {
    if (ped.dead) continue;
    if (dist(car.x, car.y, ped.x, ped.y) < 26 && spd > 60) {
      killPed(G, ped, true);
      addHeat(G, TUNING.heatPerPedHit, 'Pedestrian hit');
      G.audio.sfx('crash');
      burst(G, ped.x, ped.y, 12, '#cc3333', 90, 0.7);
    }
  }

  if (input.anyPressed(KEYS.enterCar)) exitCar(G);
  G.audio.setEngine(true, spd / spec.top);
}

export function explodeCar(G, car) {
  burst(G, car.x, car.y, 40, '#ff8833', 260, 1.0);
  burst(G, car.x, car.y, 25, '#333333', 140, 1.4);
  G.audio.sfx('explosion');
  G.camera.shake = Math.min(G.camera.shake + 10, 16);
  car.dead = true;
  if (G.player.inCar === car) {
    G.player.hp -= 35;
    G.player.inCar = null;
    G.player.x = car.x + 40;
    G.player.y = car.y;
    G.audio.setEngine(false, 0);
  }
  for (const ped of G.peds) {
    if (!ped.dead && dist(ped.x, ped.y, car.x, car.y) < 160) {
      ped.state = 'flee';
      ped.panic = 4;
    }
  }
}

export function killPed(G, ped, byCar) {
  ped.dead = true;
  ped.deadTimer = 0;
  if (!byCar) G.stats.kills++;
}

export function updatePeds(G, dt) {
  const p = G.player;
  for (const ped of G.peds) {
    if (ped.dead) {
      ped.deadTimer += dt;
      continue;
    }
    ped.walkPhase += dt * 8;
    ped.retarget -= dt;
    if (ped.panic > 0) ped.panic -= dt;

    // Flee gunfire, explosions and speeding cars.
    let threat = null;
    if (G.lastShotAt && G.time - G.lastShotAt < 1.2) {
      if (dist(ped.x, ped.y, G.lastShotX, G.lastShotY) < 320) threat = { x: G.lastShotX, y: G.lastShotY };
    }
    if (!threat && p.inCar && Math.abs(p.speed) > 150 && dist(ped.x, ped.y, p.x, p.y) < 130) {
      threat = { x: p.x, y: p.y };
    }
    if (threat) {
      ped.state = 'flee';
      ped.panic = 2;
    }
    if (ped.state === 'flee' && ped.panic <= 0) ped.state = 'walk';

    if (ped.state === 'flee') {
      const tx = threat || { x: p.x, y: p.y };
      const a = angleTo(tx.x, tx.y, ped.x, ped.y);
      ped.speed = TUNING.pedFleeSpeed;
      moveOnFoot(G, ped, Math.cos(a), Math.sin(a), dt, 12);
    } else {
      ped.speed = 55; // steady stroll
      if (ped.retarget <= 0) {
        ped.retarget = range(G.rng, 3, 8);
        // Walk along a sidewalk: pick a nearby road and head parallel to it.
        const lane = randomLane(G.rng);
        if (dist(lane.x, lane.y, ped.x, ped.y) < 420) {
          ped.angle = lane.angle + (G.rng() < 0.5 ? 0 : Math.PI);
        } else {
          ped.angle = G.rng() * Math.PI * 2;
        }
      }
      moveOnFoot(G, ped, Math.cos(ped.angle), Math.sin(ped.angle), dt, 12);
      // Stay out of the water and off the road centre.
      if (isWater(ped.x, ped.y) || isRoad(ped.x, ped.y)) {
        ped.angle += Math.PI / 2;
      }
    }
  }
  // Prune faded corpses, keep the crowd near the player.
  G.peds = G.peds.filter((ped) => !(ped.dead && ped.deadTimer > 8));
  let tries = 0;
  while (G.peds.length < 22 && tries++ < 4) spawnPed(G);
  for (let i = G.peds.length - 1; i >= 0; i--) {
    const ped = G.peds[i];
    if (!ped.dead && dist(ped.x, ped.y, p.x, p.y) > 1400) {
      G.peds.splice(i, 1);
      spawnPed(G);
    }
  }
}

export function updateTraffic(G, dt) {
  const p = G.player;
  for (const car of G.cars) {
    if (car.driver !== 'traffic') continue;
    const ai = car.ai;
    if (!ai) continue;
    // Slow for the car ahead in the same lane.
    let target = TUNING.trafficSpeed;
    for (const other of G.cars) {
      if (other === car) continue;
      const d = dist(car.x, car.y, other.x, other.y);
      if (d < 90) {
        const ahead = Math.cos(angleDiff(car.angle, angleTo(car.x, car.y, other.x, other.y)));
        if (ahead > 0.5) target = Math.min(target, 40);
      }
    }
    // Slow near the player when they are on foot in front of us.
    if (!p.inCar && dist(car.x, car.y, p.x, p.y) < 80) target = 0;
    car.speed += clamp(target - car.speed, -260 * dt, 180 * dt);
    // At intersections, sometimes turn.
    const nearX = WORLD.ROADS_X.some((rx) => Math.abs(car.x - rx) < 40);
    const nearY = WORLD.ROADS_Y.some((ry) => Math.abs(car.y - ry) < 40);
    if (nearX && nearY && G.time - ai.turnAt > 2) {
      ai.turnAt = G.time;
      if (G.rng() < 0.35) {
        car.angle += (G.rng() < 0.5 ? 1 : -1) * Math.PI / 2;
        if (Math.abs(Math.cos(car.angle)) > 0.5) { ai.axis = 'h'; ai.road = car.y; }
        else { ai.axis = 'v'; ai.road = car.x; }
        ai.dir = Math.abs(Math.sin(car.angle)) > 0.5 ? Math.sign(Math.sin(car.angle)) : Math.sign(Math.cos(car.angle));
      }
    }
    // Steer back onto the lane if drifted.
    const laneOffset = ai.axis === 'v' ? car.x - ai.road : car.y - ai.road;
    const want = ai.dir * 30;
    const steer = clamp((want - laneOffset) * 0.02, -0.5, 0.5);
    car.angle += steer * dt * (car.speed > 0 ? 1 : 0);
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    const pos = resolveCircle(G.city.buildings, nx, ny, 18);
    if (Math.abs(pos.x - nx) > 1 || Math.abs(pos.y - ny) > 1) {
      car.angle += Math.PI / 2;
      car.speed *= 0.5;
    }
    car.x = pos.x;
    car.y = pos.y;
    if (isWater(car.x, car.y)) {
      car.x = clamp(car.x, 100, WORLD.WATER_X - 100);
      car.y = clamp(car.y, 100, WORLD.BEACH_Y - 100);
    }
  }
  // Keep traffic populated near the player.
  let tries = 0;
  while (G.cars.filter((c) => c.driver === 'traffic').length < 12 && tries++ < 3) {
    spawnTrafficCar(G, p.x, p.y);
  }
  for (let i = G.cars.length - 1; i >= 0; i--) {
    const car = G.cars[i];
    if (car.dead) {
      G.cars.splice(i, 1);
      continue;
    }
    if (car.driver === 'traffic' && dist(car.x, car.y, p.x, p.y) > 1500) {
      G.cars.splice(i, 1);
    }
  }
}

export function updateCops(G, dt) {
  const p = G.player;
  const stars = wantedStars(G.heat);
  G.wanted = stars;
  // Heat decays when no cop is close enough to see the player.
  const copNear = G.cops.some((c) => dist(c.x, c.y, p.x, p.y) < 520);
  if (!copNear && stars > 0 && G.time - G.lastCrime > 4) {
    G.heat = Math.max(0, G.heat - TUNING.wantedDecay * dt);
  }

  // Spawn to the wanted level.
  const wantFoot = stars >= 1 ? Math.min(stars, 3) : 0;
  const wantCruiser = stars >= 2 ? Math.min(stars - 1, 3) : 0;
  const foot = G.cops.filter((c) => c.kind === 'foot').length;
  const cruisers = G.cops.filter((c) => c.kind === 'cruiser').length;
  if (foot < wantFoot && G.rng() < 0.05) spawnCop(G, 'foot');
  if (cruisers < wantCruiser && G.rng() < 0.04) spawnCop(G, 'cruiser');
  if (stars === 0) {
    // Cops give up and walk away.
    for (const c of G.cops) c.state = 'leave';
  }

  for (let i = G.cops.length - 1; i >= 0; i--) {
    const cop = G.cops[i];
    if (cop.hp <= 0) {
      burst(G, cop.x, cop.y, 10, '#cc3333', 80, 0.6);
      G.cops.splice(i, 1);
      continue;
    }
    if (cop.state === 'leave') {
      const a = angleTo(p.x, p.y, cop.x, cop.y) + Math.PI;
      cop.x += Math.cos(a) * 120 * dt;
      cop.y += Math.sin(a) * 120 * dt;
      if (dist(cop.x, cop.y, p.x, p.y) > 1200) G.cops.splice(i, 1);
      continue;
    }
    if (cop.kind === 'foot') {
      const d = dist(cop.x, cop.y, p.x, p.y);
      const a = angleTo(cop.x, cop.y, p.x, p.y);
      cop.angle = a;
      cop.speed = TUNING.copFootSpeed;
      if (d > 26) {
        // Close in, but stop at arm's length so the grab can finish.
        moveOnFoot(G, cop, Math.cos(a), Math.sin(a), dt, 13);
      }
      cop.x = clamp(cop.x, 40, WORLD.W - 40);
      cop.y = clamp(cop.y, 40, WORLD.H - 40);
      // Grab the player on foot — but never mid-mission: on a job the
      // cops want Rook dead, not arrested, and a grab would end the
      // mission by ambush while the player is fighting someone else.
      if (!p.inCar && d < 30 && !G.mission) {
        p.bustedTimer += dt;
        if (p.bustedTimer > TUNING.bustedTime) {
          G.screen = 'busted';
          G.audio.sfx('fail');
        }
      } else {
        p.bustedTimer = Math.max(0, p.bustedTimer - dt * 2);
      }
      // Punch the player — only when they are on foot and in reach.
      cop.punchTimer -= dt;
      if (!p.inCar && d < 40 && cop.punchTimer <= 0) {
        cop.punchTimer = 0.9;
        hurtPlayer(G, 8);
        G.audio.sfx('punch');
      }
    } else {
      // Cruiser chase: steer toward the player, ram on contact.
      const car = cop.car;
      if (!car || car.dead) {
        G.cops.splice(i, 1);
        continue;
      }
      cop.x = car.x;
      cop.y = car.y;
      const want = angleTo(car.x, car.y, p.x, p.y);
      const diff = angleDiff(car.angle, want);
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      const target = Math.min(TUNING.copCruiserSpeed, dist(car.x, car.y, p.x, p.y) * 0.9 + 120);
      car.speed += clamp(target - car.speed, -300 * dt, 260 * dt);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      const pos = resolveCircle(G.city.buildings, nx, ny, 18);
      car.x = pos.x;
      car.y = pos.y;
      if (isWater(car.x, car.y)) {
        car.angle += Math.PI;
        car.speed *= 0.5;
      }
      const d = dist(car.x, car.y, p.x, p.y);
      if (d < 46) {
        if (p.inCar) {
          p.inCar.hp -= 2;
          car.hp -= 1;
          if (p.inCar.hp <= 0) explodeCar(G, p.inCar);
        } else {
          hurtPlayer(G, 14 * dt * 4);
        }
        G.camera.shake = Math.min(G.camera.shake + 3, 10);
        if (G.rng() < 0.1) G.audio.sfx('crash');
      }
      if (car.hp <= 0) {
        explodeCar(G, car);
        G.cops.splice(i, 1);
      }
    }
  }
  G.audio.setSiren(stars >= 1 && G.cops.length > 0);
}

export function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.invuln > 0) return;
  p.hp -= amount;
  p.hurtFlash = 0.35;
  p.invuln = 0.25;
  if (p.hp <= 0) {
    p.hp = 0;
    G.screen = 'wasted';
    G.audio.sfx('fail');
    G.audio.setEngine(false, 0);
    G.audio.setSiren(false);
  }
}

export function respawnAfterBusted(G) {
  const p = G.player;
  const st = G.city.landmarks.find((l) => l.id === 'police');
  p.x = st.x;
  p.y = st.y + 140;
  p.hp = p.maxHp;
  p.cash = Math.max(0, p.cash - 200);
  p.weapon = 'fists';
  p.inCar = null;
  G.heat = 0;
  G.wanted = 0;
  G.cops.length = 0;
  G.screen = 'play';
  G.message = 'Busted — PD took $200. Marlowe is not happy.';
  G.messageTimer = 4;
}

export function respawnAfterWasted(G) {
  const p = G.player;
  const st = G.city.landmarks.find((l) => l.id === 'hospital');
  p.x = st.x;
  p.y = st.y + 140;
  p.hp = p.maxHp;
  p.cash = Math.max(0, p.cash - 300);
  p.weapon = 'fists';
  p.ammo = { pistol: 12, smg: 0 };
  p.inCar = null;
  G.heat = 0;
  G.wanted = 0;
  G.cops.length = 0;
  G.enemies.length = 0;
  if (G.mission) G.mission.failed = true;
  G.screen = 'play';
  G.message = 'Wasted — Solmar General patched you up. $300 gone.';
  G.messageTimer = 4;
}
