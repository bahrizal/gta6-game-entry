// Combat: weapons, bullets, damage, enemy AI and pickups.
import { WEAPONS, TUNING } from './config.js';
import { range, dist, angleTo, clamp } from './random.js';
import { collidesBuilding, resolveCircle } from './city.js';
import { burst, addHeat, hurtPlayer, killPed, explodeCar } from './entities.js';

export function fireWeapon(G) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  if (p.fireCooldown > 0 || p.reloadTimer > 0) return;
  if (p.inCar) return; // no drive-by in this build; shoot on foot
  p.fireCooldown = w.rate;
  G.lastShotAt = G.time;
  G.lastShotX = p.x;
  G.lastShotY = p.y;

  if (w.melee) {
    G.audio.sfx('punch');
    const hx = p.x + Math.cos(p.angle) * 34;
    const hy = p.y + Math.sin(p.angle) * 34;
    burst(G, hx, hy, 4, '#ffffff', 60, 0.25);
    // Hit whatever is in front: ped, cop, enemy.
    for (const ped of G.peds) {
      if (!ped.dead && dist(ped.x, ped.y, hx, hy) < 34) damagePed(G, ped, w.damage);
    }
    for (const cop of G.cops) {
      if (cop.kind === 'foot' && dist(cop.x, cop.y, hx, hy) < 34) damageCop(G, cop, w.damage);
    }
    for (const e of G.enemies) {
      if (e.hp > 0 && dist(e.x, e.y, hx, hy) < 34) damageEnemy(G, e, w.damage);
    }
    addHeat(G, 1, 'Fight');
    return;
  }

  const ammoKey = w.ammo;
  if (p.ammo[ammoKey] <= 0) {
    G.audio.sfx('click');
    reloadWeapon(G);
    return;
  }
  p.ammo[ammoKey]--;
  const a = p.angle + range(G.rng, -w.spread, w.spread);
  G.bullets.push({
    x: p.x + Math.cos(p.angle) * 26,
    y: p.y + Math.sin(p.angle) * 26,
    vx: Math.cos(a) * w.speed,
    vy: Math.sin(a) * w.speed,
    life: w.range / w.speed,
    damage: w.damage,
    from: 'player',
  });
  burst(G, p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30, 3, '#ffd24d', 120, 0.12);
  G.audio.sfx('shot');
  G.camera.shake = Math.min(G.camera.shake + 1.5, 6);
  addHeat(G, TUNING.heatPerShot, 'Shots fired');
}

export function reloadWeapon(G) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  if (w.melee || p.reloadTimer > 0) return;
  if (p.ammo[w.ammo] <= 0) return;
  p.reloadTimer = 0.7;
  G.audio.sfx('reload');
}

export function damagePed(G, ped, dmg) {
  ped.hp -= dmg;
  burst(G, ped.x, ped.y, 6, '#cc3333', 80, 0.5);
  if (ped.hp <= 0) {
    killPed(G, ped, false);
    addHeat(G, TUNING.heatPerKill, 'Pedestrian killed');
  } else {
    ped.state = 'flee';
    ped.panic = 3;
  }
}

export function damageCop(G, cop, dmg) {
  cop.hp -= dmg;
  burst(G, cop.x, cop.y, 6, '#3366cc', 80, 0.5);
  G.audio.sfx('hit');
  if (cop.hp <= 0) {
    addHeat(G, TUNING.heatPerCopKill, 'Cop down');
    G.stats.kills++;
    if (cop.kind === 'cruiser' && cop.car) {
      cop.car.driver = 'none';
      cop.car.speed = 0;
    }
  }
}

export function damageEnemy(G, e, dmg) {
  e.hp -= dmg;
  burst(G, e.x, e.y, 6, '#ff5533', 80, 0.5);
  G.audio.sfx('hit');
  if (e.hp <= 0) {
    e.dead = true;
    G.stats.kills++;
    burst(G, e.x, e.y, 14, '#ff5533', 140, 0.8);
    if (G.rng() < 0.4) spawnPickup(G, e.x, e.y, 'cash', 40);
    if (G.rng() < 0.25) spawnPickup(G, e.x, e.y, 'health', 25);
  }
}

export function spawnEnemy(G, x, y, kind) {
  const e = {
    x, y, angle: 0, hp: kind === 'boss' ? 220 : kind === 'heavy' ? 90 : 50,
    kind: kind || 'goon', state: 'guard',
    fireTimer: range(G.rng, 0.5, 1.5), moveTimer: 0,
    speed: 120, dead: false, target: null,
  };
  G.enemies.push(e);
  return e;
}

export function spawnPickup(G, x, y, kind, amount) {
  G.pickups.push({ x, y, kind, amount: amount || 0, bob: G.rng() * 6 });
}

export function updateBullets(G, dt) {
  for (let i = G.bullets.length - 1; i >= 0; i--) {
    const b = G.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    let dead = b.life <= 0;
    if (!dead && collidesBuilding(G.city.buildings, b.x, b.y, 2)) {
      burst(G, b.x, b.y, 4, '#ffcc66', 90, 0.3);
      dead = true;
    }
    if (!dead) {
      if (b.from === 'player') {
        for (const ped of G.peds) {
          if (!ped.dead && dist(ped.x, ped.y, b.x, b.y) < 14) {
            damagePed(G, ped, b.damage);
            dead = true;
            break;
          }
        }
        if (!dead) {
          for (const cop of G.cops) {
            if (cop.kind === 'foot' && dist(cop.x, cop.y, b.x, b.y) < 15) {
              damageCop(G, cop, b.damage);
              dead = true;
              break;
            }
            if (cop.kind === 'cruiser' && cop.car && dist(cop.car.x, cop.car.y, b.x, b.y) < 24) {
              cop.car.hp -= b.damage;
              if (cop.car.hp <= 0) {
                cop.hp = 0;
              }
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const e of G.enemies) {
            if (e.hp > 0 && dist(e.x, e.y, b.x, b.y) < 15) {
              damageEnemy(G, e, b.damage);
              dead = true;
              break;
            }
          }
        }
        if (!dead) {
          for (const car of G.cars) {
            if ((car.driver === 'traffic' || car.driver === 'convoy' || car.driver === 'target') && dist(car.x, car.y, b.x, b.y) < 22) {
              car.hp -= b.damage;
              burst(G, b.x, b.y, 4, '#888888', 70, 0.3);
              if (car.hp <= 0) explodeCar(G, car);
              dead = true;
              break;
            }
          }
        }
      } else {
        // Enemy bullet: only the player can be hurt.
        const p = G.player;
        if (!p.inCar && dist(p.x, p.y, b.x, b.y) < 14) {
          hurtPlayer(G, b.damage);
          dead = true;
        } else if (p.inCar && dist(p.inCar.x, p.inCar.y, b.x, b.y) < 24) {
          p.inCar.hp -= b.damage;
          dead = true;
        }
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }
}

export function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of G.enemies) {
    if (e.dead) continue;
    e.fireTimer -= dt;
    e.moveTimer -= dt;
    const d = dist(e.x, e.y, p.x, p.y);
    const a = angleTo(e.x, e.y, p.x, p.y);
    e.angle = a;
    if (d < 520) {
      e.state = 'fight';
      if (d > 260) {
        // Advance, strafing a little.
        const strafe = Math.sin(G.time * 1.3 + e.x) * 0.5;
        const mx = Math.cos(a) * 0.9 + Math.cos(a + Math.PI / 2) * strafe * 0.4;
        const my = Math.sin(a) * 0.9 + Math.sin(a + Math.PI / 2) * strafe * 0.4;
        const pos = resolveCircle(G.city.buildings, e.x + mx * e.speed * dt, e.y + my * e.speed * dt, 13);
        e.x = pos.x;
        e.y = pos.y;
      } else if (e.hp < 25 && e.moveTimer <= 0) {
        // Low health: fall back.
        e.moveTimer = 1.2;
        const pos = resolveCircle(G.city.buildings, e.x - Math.cos(a) * e.speed * dt * 1.4, e.y - Math.sin(a) * e.speed * dt * 1.4, 13);
        e.x = pos.x;
        e.y = pos.y;
      }
      if (d < 460 && e.fireTimer <= 0) {
        e.fireTimer = e.kind === 'boss' ? 0.7 : 1.1;
        const spread = range(G.rng, -0.08, 0.08);
        G.bullets.push({
          x: e.x + Math.cos(a) * 24, y: e.y + Math.sin(a) * 24,
          vx: Math.cos(a + spread) * 760, vy: Math.sin(a + spread) * 760,
          life: 0.6, damage: e.kind === 'boss' ? 12 : 8, from: 'enemy',
        });
        burst(G, e.x + Math.cos(a) * 28, e.y + Math.sin(a) * 28, 2, '#ffd24d', 100, 0.1);
        G.audio.sfx('shotEnemy');
      }
    } else {
      e.state = 'guard';
    }
  }
  G.enemies = G.enemies.filter((e) => !e.dead || G.time - (e.deadAt || 0) < 0.2);
  for (const e of G.enemies) if (e.dead && !e.deadAt) e.deadAt = G.time;
}

export function updatePickups(G, dt) {
  const p = G.player;
  for (let i = G.pickups.length - 1; i >= 0; i--) {
    const pk = G.pickups[i];
    if (pk.story) continue; // story package: the mission script collects it
    pk.bob += dt;
    const d = dist(pk.x, pk.y, p.x, p.y);
    const reach = p.inCar ? 44 : 30;
    if (d < reach) {
      switch (pk.kind) {
        case 'health':
          p.hp = clamp(p.hp + pk.amount, 0, p.maxHp);
          G.message = 'Health +' + pk.amount;
          break;
        case 'ammo-pistol':
          p.ammo.pistol += pk.amount;
          G.message = 'Pistol ammo +' + pk.amount;
          break;
        case 'ammo-smg':
          p.ammo.smg += pk.amount;
          if (p.weapon === 'fists') p.weapon = 'smg';
          G.message = 'SMG ammo +' + pk.amount;
          break;
        case 'weapon-smg':
          p.weapon = 'smg';
          p.ammo.smg += 60;
          G.message = 'Picked up the SMG!';
          break;
        case 'weapon-pistol':
          p.weapon = 'pistol';
          p.ammo.pistol += 24;
          G.message = 'Picked up a pistol!';
          break;
        case 'cash':
          p.cash += pk.amount;
          G.message = '+' + '$' + pk.amount;
          G.audio.sfx('cash');
          break;
        case 'package': {
          G.packagesCollected++;
          G.message = 'Hidden package ' + G.packagesCollected + '/10';
          p.cash += 150;
          if (G.packagesCollected >= 10) {
            p.cash += 2000;
            G.message = 'All 10 packages! Bonus $2,000';
          }
          G.audio.sfx('pickup');
          break;
        }
        default:
          break;
      }
      if (pk.kind !== 'cash' && pk.kind !== 'package') G.audio.sfx('pickup');
      G.messageTimer = 2;
      G.pickups.splice(i, 1);
    }
  }
}

export function updateCombat(G, dt, input) {
  const p = G.player;
  const w = WEAPONS[p.weapon];
  if (input.wasPressed('KeyR')) reloadWeapon(G);
  if (w.melee) {
    if (input.anyPressed(['Space'])) fireWeapon(G);
  } else if (w.auto) {
    if (input.mouse.down) fireWeapon(G);
  } else if (input.mouse.clicked) {
    fireWeapon(G);
  }
  updateBullets(G, dt);
  updateEnemies(G, dt);
  updatePickups(G, dt);
}
