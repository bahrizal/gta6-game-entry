// Combat: player weapons, enemy AI, bullets, pickups and damage.
// Enemies are the Harbor Kings crew and corrupt cops; peds are never targets.
import { WEAPONS } from './config.js';
import { addHeat, damagePlayer, explodeCar, moveCircle, spawnSmoke } from './entities.js';
import { collides, roadPointNear } from './city.js';

export const combat = {
  fireWeapon(state, shooter, tx, ty) {
    const p = state.player;
    const weapon = WEAPONS[p.weapon];
    if (!weapon || p.fireCd > 0) return false;
    if (p.weapon !== 'fists') {
      if (p.mag[p.weapon] <= 0) {
        // Dry click: auto-reload if there is reserve ammo.
        if (p.ammo[p.weapon] > 0) this.reload(state);
        return false;
      }
      p.mag[p.weapon] -= 1;
    }
    p.fireCd = weapon.rate;
    const angle = Math.atan2(ty - shooter.y, tx - shooter.x);
    if (p.weapon === 'fists') {
      p.punchCd = weapon.rate;
      state.audio.punch();
      this.meleeHit(state, shooter, angle);
      return true;
    }
    const spread = (Math.random() - 0.5) * 2 * weapon.spread;
    const a = angle + spread;
    state.bullets.push({
      x: shooter.x + Math.cos(angle) * 26, y: shooter.y + Math.sin(angle) * 26,
      vx: Math.cos(a) * weapon.speed, vy: Math.sin(a) * weapon.speed,
      life: weapon.range / weapon.speed, damage: weapon.damage, from: 'player',
    });
    state.muzzle = { x: shooter.x + Math.cos(angle) * 30, y: shooter.y + Math.sin(angle) * 30, t: 0.06 };
    state.lastShot = { x: shooter.x, y: shooter.y };
    state.audio.shot(p.weapon);
    if (state.wanted.heat < 10) addHeat(state, 4);
    return true;
  },

  meleeHit(state, shooter, angle) {
    const hit = (ent, radius) => {
      const dx = ent.x - shooter.x;
      const dy = ent.y - shooter.y;
      const d = Math.hypot(dx, dy);
      if (d > WEAPONS.fists.range + radius) return false;
      const dot = (dx * Math.cos(angle) + dy * Math.sin(angle)) / (d || 1);
      return dot > 0.3;
    };
    for (const e of state.enemies) {
      if (e.hp > 0 && hit(e, 16)) this.damageEnemy(state, e, WEAPONS.fists.damage, shooter);
    }
    for (const c of state.cops) {
      if (c.hp > 0 && hit(c, 14)) {
        c.hp -= WEAPONS.fists.damage;
        state.audio.hit();
        if (c.hp <= 0) {
          addHeat(state, 25);
          state.stats.copsDown += 1;
        }
      }
    }
    for (const ped of state.peds) {
      if (hit(ped, 12)) {
        ped.state = 'flee';
        ped.fleeX = shooter.x;
        ped.fleeY = shooter.y;
        ped.fleeT = 4;
        addHeat(state, 8);
      }
    }
  },

  reload(state) {
    const p = state.player;
    const weapon = WEAPONS[p.weapon];
    if (!weapon || p.weapon === 'fists') return;
    const need = weapon.mag - p.mag[p.weapon];
    const take = Math.min(need, p.ammo[p.weapon]);
    if (take <= 0) return;
    p.mag[p.weapon] += take;
    p.ammo[p.weapon] -= take;
    p.fireCd = Math.max(p.fireCd, 0.7);
    state.audio.pickup();
  },

  enemyShoot(state, shooter) {
    const p = state.player;
    const dx = p.x - shooter.x;
    const dy = p.y - shooter.y;
    const d = Math.hypot(dx, dy) || 1;
    const spread = (Math.random() - 0.5) * 0.14;
    const a = Math.atan2(dy, dx) + spread;
    state.bullets.push({
      x: shooter.x + Math.cos(a) * 26, y: shooter.y + Math.sin(a) * 26,
      vx: Math.cos(a) * 900, vy: Math.sin(a) * 900,
      life: 0.6, damage: 9, from: 'enemy',
    });
    state.muzzle = { x: shooter.x + Math.cos(a) * 30, y: shooter.y + Math.sin(a) * 30, t: 0.06 };
    state.audio.shot('pistol');
  },

  spawnGoons(state, x, y, count, opts = {}) {
    const made = [];
    let attempts = 0;
    while (made.length < count && attempts < count * 12) {
      attempts += 1;
      const gx = x + (Math.random() - 0.5) * 260;
      const gy = y + (Math.random() - 0.5) * 260;
      if (collides(state.city, gx, gy, 16)) continue;
      const e = {
        id: state.nextId++, x: gx, y: gy, angle: 0, hp: opts.hp || 55,
        speed: 165 + Math.random() * 30, state: 'advance', shootCd: 0.5 + Math.random(),
        strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: 0, weapon: opts.weapon || 'pistol',
        boss: !!opts.boss,
      };
      if (e.boss) e.hp = 320;
      state.enemies.push(e);
      made.push(e);
    }
    // Last resort: place the rest on the nearest road so a kill step can
    // never soft-lock for want of a target.
    while (made.length < count) {
      const rp = roadPointNear(state.rng, x, y, 200);
      const e = {
        id: state.nextId++, x: rp.x, y: rp.y, angle: 0, hp: opts.hp || 55,
        speed: 165 + Math.random() * 30, state: 'advance', shootCd: 0.5 + Math.random(),
        strafeDir: 1, strafeT: 0, weapon: opts.weapon || 'pistol', boss: false,
      };
      state.enemies.push(e);
      made.push(e);
    }
    return made;
  },

  damageEnemy(state, e, dmg, shooter) {
    e.hp -= dmg;
    state.audio.hit();
    state.particles.push({
      x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 8,
      color: '#ff4040', kind: 'hit',
    });
    if (e.hp <= 0) {
      state.stats.kills += 1;
      state.stats.missionKills += 1;
      if (Math.random() < 0.35) {
        state.pickups.push({
          x: e.x, y: e.y, kind: Math.random() < 0.5 ? 'health' : 'ammo', amount: 0, t: 0,
        });
      }
      if (e.boss) {
        state.audio.sting();
        state.mission.data.bossDown = true;
      }
    }
  },

  updateBullets(state, dt) {
    const p = state.player;
    for (const b of state.bullets) {
      b.life -= dt;
      const nx = b.x + b.vx * dt;
      const ny = b.y + b.vy * dt;
      if (collides(state.city, nx, ny, 2)) {
        b.life = 0;
        state.particles.push({
          x: nx, y: ny, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: 5,
          color: '#ffd23c', kind: 'spark',
        });
        continue;
      }
      b.x = nx;
      b.y = ny;
      if (b.from === 'player') {
        let hitSomething = false;
        for (const e of state.enemies) {
          if (e.hp > 0 && Math.hypot(e.x - b.x, e.y - b.y) < 18) {
            this.damageEnemy(state, e, b.damage, p);
            hitSomething = true;
            break;
          }
        }
        if (!hitSomething) {
          for (const c of state.cops) {
            if (c.hp > 0 && Math.hypot(c.x - b.x, c.y - b.y) < 16) {
              c.hp -= b.damage;
              state.audio.hit();
              if (c.hp <= 0) {
                addHeat(state, 25);
                state.stats.copsDown += 1;
              }
              hitSomething = true;
              break;
            }
          }
        }
        if (!hitSomething) {
          for (const ped of state.peds) {
            if (Math.hypot(ped.x - b.x, ped.y - b.y) < 14) {
              ped.state = 'flee';
              ped.fleeX = p.x;
              ped.fleeY = p.y;
              ped.fleeT = 5;
              addHeat(state, 10);
              state.stats.pedsHit += 1;
              hitSomething = true;
              break;
            }
          }
        }
        if (!hitSomething) {
          for (const car of state.cars) {
            if (car.driver === 'player' || car.driver === 'wreck') continue;
            const dx = car.x - b.x;
            const dy = car.y - b.y;
            const along = Math.abs(dx * Math.cos(car.angle) + dy * Math.sin(car.angle));
            const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
            if (along < car.len / 2 + 4 && side < car.wid / 2 + 4) {
              car.health -= b.damage;
              state.audio.hit();
              if (car.health <= 0) explodeCar(state, car);
              hitSomething = true;
              break;
            }
          }
        }
        if (hitSomething) b.life = 0;
      } else if (!p.inCar && Math.hypot(p.x - b.x, p.y - b.y) < 16) {
        damagePlayer(state, b.damage);
        b.life = 0;
      } else if (p.inCar && Math.hypot(p.x - b.x, p.y - b.y) < 26) {
        p.inCar.health -= b.damage * 0.5;
        if (p.inCar.health <= 0) explodeCar(state, p.inCar);
        b.life = 0;
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  },

  updateEnemies(state, dt) {
    const p = state.player;
    for (const e of state.enemies) {
      if (e.hp <= 0) continue;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      e.angle = Math.atan2(dy, dx);
      e.shootCd -= dt;
      e.strafeT -= dt;
      // Stuck detection: if an advancing goon barely moves for ~0.8s it is
      // wedged on a building corner, so it detours sideways for a beat.
      if (e._sx === undefined) {
        e._sx = e.x;
        e._sy = e.y;
        e._stuck = 0;
        e.detourT = 0;
      }
      const moved = Math.hypot(e.x - e._sx, e.y - e._sy);
      if (moved > 10) {
        e._sx = e.x;
        e._sy = e.y;
        e._stuck = 0;
      } else {
        e._stuck += dt;
      }
      if (e.hp < 16 && dist >= 180) e.state = 'flee';
      else if (e.detourT > 0) {
        e.state = 'detour';
        e.detourT -= dt;
      } else if (e._stuck > 0.8 && dist > 120) {
        e.state = 'detour';
        e.detourT = 0.9;
        e.detourDir = Math.random() < 0.5 ? 1 : -1;
        e._stuck = 0;
      } else if (dist > 300) e.state = 'advance';
      else if (dist < 130) e.state = 'strafe';
      else e.state = 'hold';
      if (e.state === 'flee') {
        moveCircle(state, e, (-dx / dist) * e.speed * dt, (-dy / dist) * e.speed * dt, 14);
      } else if (e.state === 'advance') {
        moveCircle(state, e, (dx / dist) * e.speed * dt, (dy / dist) * e.speed * dt, 14);
      } else if (e.state === 'detour') {
        const sx = -dy / dist * e.detourDir;
        const sy = dx / dist * e.detourDir;
        moveCircle(state, e, sx * e.speed * dt, sy * e.speed * dt, 14);
      } else if (e.state === 'strafe') {
        if (e.strafeT <= 0) {
          e.strafeDir *= -1;
          e.strafeT = 0.9 + Math.random() * 0.8;
        }
        const sx = -dy / dist * e.strafeDir;
        const sy = dx / dist * e.strafeDir;
        moveCircle(state, e, sx * e.speed * 0.7 * dt, sy * e.speed * 0.7 * dt, 14);
      }
      if (dist < 400 && e.shootCd <= 0 && e.state !== 'flee') {
        e.shootCd = e.weapon === 'smg' ? 0.9 : 1.5;
        this.enemyShoot(state, e);
      }
    }
    state.enemies = state.enemies.filter((e) => e.hp > 0 || e.deathT === undefined);
    // Keep corpses out of the list entirely; kills are counted at damage time.
    state.enemies = state.enemies.filter((e) => e.hp > 0);
  },

  updatePickups(state, dt) {
    const p = state.player;
    for (const pk of state.pickups) {
      pk.t += dt;
      if (Math.hypot(pk.x - p.x, pk.y - p.y) < 34) {
        pk.taken = true;
        if (pk.kind === 'health') {
          p.hp = Math.min(100, p.hp + 40);
          state.audio.pickup();
        } else if (pk.kind === 'ammo') {
          p.ammo.pistol += 24;
          p.ammo.smg += 60;
          if (p.weapon === 'fists') p.weapon = 'pistol';
          state.audio.pickup();
        } else if (pk.kind === 'smg') {
          p.weapon = 'smg';
          p.ammo.smg += 90;
          p.mag.smg = 32;
          state.audio.cash();
        } else if (pk.kind === 'cash') {
          p.cash += pk.amount;
          state.audio.cash();
        }
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken && pk.t < 60);
  },

  checkPackages(state) {
    const p = state.player;
    for (const pkg of state.city.packages) {
      if (!pkg.taken && Math.hypot(pkg.x - p.x, pkg.y - p.y) < 36) {
        pkg.taken = true;
        p.cash += 250;
        state.stats.packages += 1;
        state.audio.cash();
        state.hudFlash = { text: 'Hidden package +$250', t: 2 };
      }
    }
  },
};
