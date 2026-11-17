// Story missions (8, three acts), taxi fares and the 10 hidden packages.
import { MISSION_REWARDS, WORLD } from './config.js';
import { range, dist, angleTo, clamp } from './random.js';
import { landmarkById, randomStreetPoint, randomSidewalkPoint } from './city.js';
import { spawnEnemy, spawnPickup } from './combat.js';
import { spawnPed, spawnCop, addHeat, nearestCar, makeCar, explodeCar } from './entities.js';

export const MISSIONS = [
  { title: 'First Wheels', act: 'Act I — Coming Home', briefing: 'Rae "Rook" Calloway is back in Solmar, in debt to the fixer Marlowe. First job: steal a car and bring it to Kiki\'s garage.' },
  { title: 'The Pickup', act: 'Act I — Coming Home', briefing: 'A package is waiting downtown. Collect it and deliver it to the Harbor warehouse — and keep your nose clean.' },
  { title: 'Harbor Lights', act: 'Act I — Coming Home', briefing: 'The Harbor Kings are leaning on Marlowe\'s crew. Clear the warehouse at the docks. Take the SMG by the crates.' },
  { title: 'Getaway Driver', act: 'Act II — Heat Rising', briefing: 'Marlowe needs a wheelman tonight. The cops are already on you — lose them and reach the Palms Motel before the clock runs out.' },
  { title: 'The Informant', act: 'Act II — Heat Rising', briefing: 'A Kings driver knows where the money moves. Tail his car without being spotted, then confront him on foot.' },
  { title: 'Boardwalk Brawl', act: 'Act II — Heat Rising', briefing: 'The Kings run the boardwalk. Take the crew down, then run their leader down on the sand.' },
  { title: 'The Vault', act: 'Act III — All In', briefing: 'The big one: Solmar Bank. Hold the street against the police waves, then get the take to Kiki\'s garage.' },
  { title: 'King of Solmar', act: 'Act III — All In', briefing: 'End it. Hunt the Kings convoy through the Harbor, then take the warehouse — and the King himself.' },
];

const PACKAGE_SPOTS = [
  [480, 300], [1200, 1500], [1920, 600], [2640, 2250], [3360, 900],
  [480, 2100], [1200, 300], [1920, 2100], [2640, 1500], [3360, 2100],
];

export function placePackages(G) {
  for (const [x, y] of PACKAGE_SPOTS) {
    spawnPickup(G, x, y, 'package', 0);
  }
}

export function startMission(G, index) {
  const def = MISSIONS[index];
  G.mission = { index, def, stage: 0, state: {}, failed: false, timer: 0 };
  G.missionCard = { title: def.title, act: def.act, text: def.briefing, timer: 5 };
  G.audio.sfx('sting');
  // Mission-specific setup that only needs to happen once.
  if (index === 2) {
    // Arm the player on the approach to the warehouse, not inside it.
    spawnPickup(G, 860, 2260, 'weapon-smg', 0);
    spawnPickup(G, 820, 2280, 'health', 25);
  }
  if (index === 1) spawnPickup(G, 2040, 1200, 'weapon-pistol', 0);
  if (index === 2) {
    // Arm the player on the approach to the warehouse, not inside it.
    spawnPickup(G, 860, 2260, 'weapon-smg', 0);
    spawnPickup(G, 820, 2280, 'health', 25);
  }
  if (index === 5) {
    // SMG on the boardwalk road, on the approach to the crew.
    spawnPickup(G, 3060, 2400, 'weapon-smg', 0);
    spawnPickup(G, 3120, 2400, 'health', 25);
  }
  if (index === 6) {
    // North of the bank, on open ground — never inside the bank itself.
    spawnPickup(G, 2280, 1380, 'health', 50);
    spawnPickup(G, 2220, 1380, 'weapon-smg', 0);
  }
}

export function completeMission(G) {
  const m = G.mission;
  const reward = MISSION_REWARDS[m.index];
  G.player.cash += reward;
  G.stats.missionsDone++;
  G.message = 'Mission complete — +' + '$' + reward;
  G.messageTimer = 4;
  G.audio.sfx('cash');
  G.waypoint = null;
  // A finished job shakes the heat: the next job starts clean, so a
  // getaway's 3 stars never ambush the tail that follows it.
  G.heat = 0;
  G.heatLock = 0;
  G.wanted = 0;
  G.cops.length = 0;
  if (m.index === 7) {
    G.storyComplete = true;
    G.screen = 'win';
    return;
  }
  G.missionIndex = m.index + 1;
  G.mission = null;
  G.missionCard = { title: 'Next: ' + MISSIONS[G.missionIndex].title, act: MISSIONS[G.missionIndex].act, text: 'Press Enter to start the next job.', timer: 6 };
}

export function failMission(G, reason) {
  if (!G.mission) return;
  G.mission.failed = true;
  G.missionFailReason = reason;
  G.waypoint = null;
  G.audio.sfx('fail');
  G.enemies.length = 0;
}

export function objectiveText(G) {
  const m = G.mission;
  if (!m) return null;
  const s = m.state;
  switch (m.index) {
    case 0: return m.stage === 0 ? 'Steal a car (E near a car)' : 'Drive to Kiki\'s Garage';
    case 1:
      if (m.stage === 0) return 'Go to the package downtown';
      if (m.stage === 1) return 'Pick up the package';
      return 'Deliver the package to the Harbor';
    case 2: return m.stage === 0 ? 'Go to the Harbor warehouse' : 'Clear the warehouse (' + (s.kills || 0) + '/5 Kings down)';
    case 3: return m.stage === 0 ? 'Get in a car' : 'Reach the Palms Motel — ' + Math.ceil(m.timer) + 's left';
    case 4:
      if (m.stage === 0) return 'Tail the sedan — stay close, not too close (' + Math.floor(s.tail || 0) + '/20s)';
      return 'Confront the driver on foot';
    case 5:
      if (m.stage === 0) return 'Go to the boardwalk';
      if (m.stage === 1) return 'Take down the crew (' + (s.kills || 0) + '/6 down)';
      return 'Run the leader down on the sand';
    case 6:
      if (m.stage === 0) return 'Go to Solmar Bank';
      if (m.stage === 1) return 'Hold the street — wave ' + (s.wave || 1) + '/3';
      return 'Escape to Kiki\'s Garage with the take';
    case 7:
      if (m.stage === 0) return 'Destroy the Kings convoy (' + (s.kills || 0) + '/3 cars)';
      return 'Take the warehouse — finish the King (' + (s.kills || 0) + '/9 down)';
    default: return '';
  }
}

function setWaypoint(G, x, y, label) {
  G.waypoint = { x, y, label };
}

function garagePoint(G) {
  const g = landmarkById(G.city, 'garage');
  return { x: g.x, y: g.y + 130 };
}

export function updateMission(G, dt) {
  const m = G.mission;
  if (!m || m.failed) return;
  const p = G.player;
  const s = m.state;

  switch (m.index) {
    case 0: {
      if (m.stage === 0) {
        setWaypoint(G, p.x, p.y, 'Steal a car');
        G.waypoint = null;
        if (p.inCar) m.stage = 1;
      } else {
        const gp = garagePoint(G);
        setWaypoint(G, gp.x, gp.y, "Kiki's Garage");
        if (dist(p.x, p.y, gp.x, gp.y) < 110) completeMission(G);
      }
      break;
    }
    case 1: {
      if (m.stage === 0) {
        setWaypoint(G, 2100, 1200, 'Package');
        if (dist(p.x, p.y, 2100, 1200) < 90) {
          m.stage = 1;
          s.pkg = { x: 2100, y: 1200 };
          spawnPickup(G, 2100, 1200, 'package', 0);
          // The package pickup is the story one, not a hidden one.
          const pk = G.pickups[G.pickups.length - 1];
          pk.story = true;
        }
      } else if (m.stage === 1) {
        setWaypoint(G, 2100, 1200, 'Package');
        if (s.pkg && dist(p.x, p.y, s.pkg.x, s.pkg.y) < 40) {
          // Collect the story package directly.
          m.stage = 2;
          G.pickups = G.pickups.filter((pk) => !pk.story);
          G.message = 'Package secured. Deliver it to the Harbor.';
          G.messageTimer = 3;
        }
      } else {
        setWaypoint(G, 840, 2280, 'Warehouse');
        if (dist(p.x, p.y, 840, 2280) < 110) completeMission(G);
      }
      break;
    }
    case 2: {
      if (m.stage === 0) {
        setWaypoint(G, 840, 2100, 'Warehouse');
        if (dist(p.x, p.y, 840, 2100) < 200) {
          m.stage = 1;
          s.total = 5;
          s.kills = 0;
          // Yard around the warehouse, never inside the building itself.
          // South and side spots: clear lines of fire from the approach.
          const spots = [[720, 2260], [960, 2260], [680, 2140], [1000, 2140], [840, 2320]];
          for (const [x, y] of spots) spawnEnemy(G, x, y, 'goon');
        }
      } else {
        setWaypoint(G, 840, 2100, 'Warehouse');
        s.kills = s.total - G.enemies.filter((e) => e.hp > 0).length;
        if (G.enemies.filter((e) => e.hp > 0).length === 0) completeMission(G);
      }
      break;
    }
    case 3: {
      if (m.stage === 0) {
        G.waypoint = null;
        if (p.inCar) {
          m.stage = 1;
          m.timer = 75;
          G.heat = 50; // 3 stars
          G.heatLock = 75;
          G.message = '3 stars! Lose the cops and reach the Motel.';
          G.messageTimer = 3;
        }
      } else {
        m.timer -= dt;
        G.heat = Math.max(G.heat, 45);
        const motel = landmarkById(G.city, 'motel');
        setWaypoint(G, motel.x, motel.y + 120, 'Palms Motel');
        if (dist(p.x, p.y, motel.x, motel.y + 120) < 120) {
          G.heatLock = 0;
          completeMission(G);
        } else if (m.timer <= 0) {
          failMission(G, 'Out of time — the cops boxed you in.');
        }
      }
      break;
    }
    case 4: {
      if (m.stage === 0) {
        if (!s.target) {
          const car = makeCar('sedan', 1500, 1200, 0, 'target');
          car.color = '#222831';
          car.speed = 130;
          car.ai = { loop: [[1500, 1200], [2400, 1200], [2400, 1920], [1500, 1920]], wp: 0 };
          G.cars.push(car);
          s.target = car;
          s.tail = 0;
          s.lost = 0;
          setWaypoint(G, car.x, car.y, 'Target');
        }
        const t = s.target;
        if (t.dead) {
          failMission(G, 'You wrecked the target car — Marlowe wanted him alive.');
          break;
        }
        // Drive the target around its loop.
        const wp = t.ai.loop[t.ai.wp];
        const a = angleTo(t.x, t.y, wp[0], wp[1]);
        const diff = Math.atan2(Math.sin(a - t.angle), Math.cos(a - t.angle));
        t.angle += clamp(diff, -1.8 * dt, 1.8 * dt);
        t.x += Math.cos(t.angle) * t.speed * dt;
        t.y += Math.sin(t.angle) * t.speed * dt;
        if (dist(t.x, t.y, wp[0], wp[1]) < 60) t.ai.wp = (t.ai.wp + 1) % t.ai.loop.length;
        setWaypoint(G, t.x, t.y, 'Target');
        const d = dist(p.x, p.y, t.x, t.y);
        if (d < 70) {
          s.tail = Math.max(0, s.tail - dt * 2);
          G.message = 'Too close — he will spot you!';
          G.messageTimer = 1;
        } else if (d < 340) {
          s.tail += dt;
          s.lost = 0;
        } else {
          s.lost += dt;
          if (s.lost > 6) {
            failMission(G, 'You lost the target.');
            t.driver = 'none';
          }
        }
        if (s.tail >= 20) {
          m.stage = 1;
          // Stop south of the motel, on open ground — never inside it.
          t.ai.loop = [[3000, 2280]];
          t.ai.wp = 0; // the new loop has one point; reset the index
          t.speed = 150;
          G.message = 'He stopped at the Motel. Confront him.';
          G.messageTimer = 3;
        }
      } else {
        const t = s.target;
        const wp = t.ai.loop[t.ai.wp] || t.ai.loop[0];
        const a = angleTo(t.x, t.y, wp[0], wp[1]);
        const diff = Math.atan2(Math.sin(a - t.angle), Math.cos(a - t.angle));
        t.angle += clamp(diff, -1.8 * dt, 1.8 * dt);
        t.x += Math.cos(t.angle) * t.speed * dt;
        t.y += Math.sin(t.angle) * t.speed * dt;
        setWaypoint(G, t.x, t.y, 'Confront him');
        if (dist(t.x, t.y, wp[0], wp[1]) < 80) {
          t.speed = 0;
          t.driver = 'none';
          // The driver steps out and runs.
          if (!s.driverOut) {
            s.driverOut = true;
            const d = spawnPed(G, t.x + 20, t.y);
            d.state = 'flee';
            d.panic = 10;
            s.driver = d;
          }
        }
        if (s.driver && !p.inCar && dist(p.x, p.y, s.driver.x, s.driver.y) < 42) {
          completeMission(G);
        }
        // The driver only gets away if he stays out of reach for a while —
        // a single frame at long range (he just stepped out of the car)
        // must not fail the job on the spot.
        if (s.driver && dist(p.x, p.y, s.driver.x, s.driver.y) > 900) {
          s.driverLost = (s.driverLost || 0) + dt;
          if (s.driverLost > 5) failMission(G, 'The informant got away.');
        } else {
          s.driverLost = 0;
        }
      }
      break;
    }
    case 5: {
      if (m.stage === 0) {
        // Boardwalk fight happens on the open sand north of the pier —
        // the pier itself (3060,2580) blocks fire, so the trigger and
        // the crew stay north of it.
        setWaypoint(G, 3060, 2460, 'Boardwalk');
        if (dist(p.x, p.y, 3060, 2460) < 180) {
          m.stage = 1;
          s.total = 6;
          s.kills = 0;
          // Boardwalk yard north of the pier, never inside the pier itself.
          const spots = [[2920, 2480], [3200, 2480], [2900, 2420], [3220, 2420], [2960, 2400], [2840, 2460]];
          for (const [x, y] of spots) spawnEnemy(G, x, y, 'goon');
        }
      } else if (m.stage === 1) {
        setWaypoint(G, 3060, 2580, 'Boardwalk');
        s.kills = s.total - G.enemies.filter((e) => e.hp > 0).length;
        if (G.enemies.filter((e) => e.hp > 0).length === 0) {
          m.stage = 2;
          // The leader runs along the boardwalk's north side, on open ground.
          const leader = spawnPed(G, 3100, 2470);
          leader.state = 'flee';
          leader.panic = 60;
          leader.speed = 210;
          s.leader = leader;
          G.message = 'Their leader is running — catch him!';
          G.messageTimer = 3;
        }
      } else {
        const l = s.leader;
        if (l) {
          setWaypoint(G, l.x, l.y, 'Leader');
          // The leader runs along the boardwalk, away from the player.
          const a = angleTo(p.x, p.y, l.x, l.y);
          l.x += Math.cos(a) * 210 * dt;
          l.y = clamp(l.y, 2440, 2500);
          l.x = clamp(l.x, 200, WORLD.WATER_X - 100);
          if (dist(p.x, p.y, l.x, l.y) < 34) completeMission(G);
          if (dist(p.x, p.y, l.x, l.y) > 1000) failMission(G, 'The leader escaped down the beach.');
        }
      }
      break;
    }
    case 6: {
      if (m.stage === 0) {
        const bank = landmarkById(G.city, 'bank');
        setWaypoint(G, bank.x, bank.y + 150, 'Solmar Bank');
        if (dist(p.x, p.y, bank.x, bank.y + 150) < 140) {
          m.stage = 1;
          s.wave = 1;
          s.waveTotal = 3;
          G.heat = Math.max(G.heat, 45);
          spawnWave(G, 3);
        }
      } else if (m.stage === 1) {
        const bank = landmarkById(G.city, 'bank');
        setWaypoint(G, bank.x, bank.y + 150, 'Hold the street');
        const alive = G.cops.filter((c) => c.kind === 'foot' && c.hp > 0).length + G.enemies.filter((e) => e.hp > 0).length;
        if (alive === 0) {
          if (s.wave >= s.waveTotal) {
            m.stage = 2;
            G.message = 'The take is yours — get to Kiki\'s!';
            G.messageTimer = 3;
          } else {
            s.wave++;
            G.message = 'Wave ' + s.wave + ' incoming!';
            G.messageTimer = 2;
            spawnWave(G, 3 + s.wave);
          }
        }
      } else {
        const gp = garagePoint(G);
        setWaypoint(G, gp.x, gp.y, "Kiki's Garage");
        if (dist(p.x, p.y, gp.x, gp.y) < 110) completeMission(G);
      }
      break;
    }
    case 7: {
      if (m.stage === 0) {
        if (!s.convoy) {
          s.convoy = [];
          s.kills = 0;
          // Convoy runs a loop on the roads, never through buildings.
          const starts = [[480, 1200], [560, 1200], [640, 1200]];
          for (const [x, y] of starts) {
            const car = makeCar('pickup', x, y, 0, 'convoy');
            car.color = '#3a2a4a';
            car.speed = 150;
            car.ai = { loop: [[480, 1200], [480, 1920], [1200, 1920], [1200, 1200]], wp: 0 };
            G.cars.push(car);
            s.convoy.push(car);
          }
        }
        for (const car of s.convoy) {
          if (car.dead) continue;
          const wp = car.ai.loop[car.ai.wp];
          const a = angleTo(car.x, car.y, wp[0], wp[1]);
          const diff = Math.atan2(Math.sin(a - car.angle), Math.cos(a - car.angle));
          car.angle += clamp(diff, -1.8 * dt, 1.8 * dt);
          car.x += Math.cos(car.angle) * car.speed * dt;
          car.y += Math.sin(car.angle) * car.speed * dt;
          if (dist(car.x, car.y, wp[0], wp[1]) < 60) car.ai.wp = (car.ai.wp + 1) % car.ai.loop.length;
        }
        const alive = s.convoy.filter((c) => !c.dead).length;
        s.kills = s.convoy.length - alive;
        if (s.convoy.length > 0) setWaypoint(G, s.convoy.find((c) => !c.dead)?.x || 0, s.convoy.find((c) => !c.dead)?.y || 0, 'Convoy');
        if (alive === 0) {
          m.stage = 1;
          s.total = 9;
          s.kills = 0;
          // Arm the player on the warehouse approach before the last fight.
          spawnPickup(G, 860, 2260, 'weapon-smg', 0);
          spawnPickup(G, 900, 2260, 'ammo-smg', 60);
          spawnPickup(G, 820, 2280, 'health', 25);
          // Yard around the warehouse, never inside the building itself.
          const spots = [[720, 2260], [960, 2260], [700, 2040], [980, 2040], [840, 1960], [680, 2200], [1000, 2200], [760, 2320], [840, 2320]];
          for (let i = 0; i < spots.length; i++) {
            spawnEnemy(G, spots[i][0], spots[i][1], i === 8 ? 'boss' : 'goon');
          }
          G.message = 'The King is in the warehouse. End this.';
          G.messageTimer = 3;
        }
      } else {
        setWaypoint(G, 840, 2100, 'Warehouse');
        s.kills = s.total - G.enemies.filter((e) => e.hp > 0).length;
        if (G.enemies.filter((e) => e.hp > 0).length === 0) completeMission(G);
      }
      break;
    }
    default:
      break;
  }
}

function spawnWave(G, n) {
  for (let i = 0; i < n; i++) spawnCop(G, 'foot');
  if (n >= 4) spawnCop(G, 'cruiser');
}

// --- Taxi side job -------------------------------------------------------
export function updateTaxi(G, dt) {
  const p = G.player;
  const t = G.taxi;
  if (!t.active) {
    if (p.inCar && p.inCar.model === 'taxi' && !G.mission) {
      t.wait += dt;
      if (t.wait > 6) {
        t.wait = 0;
        const spot = randomSidewalkPoint(G.rng);
        if (dist(spot.x, spot.y, p.x, p.y) < 600) {
          t.active = true;
          t.stage = 'pickup';
          t.ped = spawnPed(G, spot.x, spot.y);
          t.ped.state = 'wait';
          t.fare = 0;
          G.message = 'A fare is waving you down — pick them up!';
          G.messageTimer = 3;
        }
      }
    }
    return;
  }
  if (t.stage === 'pickup') {
    G.waypoint = G.waypoint || { x: t.ped.x, y: t.ped.y, label: 'Fare' };
    if (p.inCar && dist(p.x, p.y, t.ped.x, t.ped.y) < 48 && Math.abs(p.speed) < 60) {
      G.peds = G.peds.filter((pd) => pd !== t.ped);
      t.stage = 'dropoff';
      const dest = randomStreetPoint(G.rng);
      t.dest = dest;
      t.fare = 40 + Math.floor(dist(p.x, p.y, dest.x, dest.y) / 25);
      G.message = 'Fare aboard — take them to the marker.';
      G.messageTimer = 3;
    }
    if (!p.inCar) {
      t.active = false;
      G.message = 'Fare cancelled.';
      G.messageTimer = 2;
    }
  } else if (t.stage === 'dropoff') {
    G.waypoint = { x: t.dest.x, y: t.dest.y, label: 'Drop-off' };
    if (p.inCar && dist(p.x, p.y, t.dest.x, t.dest.y) < 55) {
      p.cash += t.fare;
      G.message = 'Fare paid: $' + t.fare;
      G.messageTimer = 3;
      G.audio.sfx('cash');
      G.stats.fares++;
      t.active = false;
      t.wait = 0;
      G.waypoint = null;
    }
    if (!p.inCar) {
      t.active = false;
      G.waypoint = null;
    }
  }
}
