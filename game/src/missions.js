// Story missions (8, three acts), taxi fares and the mission marker.
// Each mission is a list of steps; the controller checks the live game state.
import { MISSION_MARKER } from './config.js';
import { addHeat, enterCar, makeCar, spawnSmoke } from './entities.js';
import { roadPointNear } from './city.js';
import { combat } from './combat.js';

export const MISSIONS = [
  {
    id: 1, title: 'First Wheels', reward: 400,
    brief: 'Marlowe wants his money. Kiki can set you up — but first you need wheels. Steal a car and bring it to her garage.',
    steps: [
      { type: 'steal', label: 'Steal a car (walk up and press E)' },
      { type: 'drive', x: 1560, y: 480, r: 90, label: 'Drive to Kiki\'s garage' },
    ],
  },
  {
    id: 2, title: 'The Pickup', reward: 800,
    brief: 'A package is waiting downtown. Collect it, then run it to the Harbor docks. Patrols are out — keep it clean.',
    steps: [
      { type: 'goto', x: 2100, y: 1200, r: 80, label: 'Collect the package downtown' },
      { type: 'drive', x: 480, y: 2100, r: 90, label: 'Deliver to the Harbor docks' },
    ],
  },
  {
    id: 3, title: 'Harbor Lights', reward: 1500,
    brief: 'The Harbor Kings are moving product through warehouse 4. Clear the docks — on foot, loud if you have to.',
    steps: [
      { type: 'goto', x: 480, y: 2100, r: 110, label: 'Reach the docks' },
      { type: 'kill', count: 6, spawnAt: [480, 2100], label: 'Clear the warehouse crew (0/6)' },
    ],
  },
  {
    id: 4, title: 'Getaway Driver', reward: 1800,
    brief: 'The job went sideways and the whole precinct is on you. Lose the heat and reach the safehouse — 3 stars and counting.',
    steps: [
      { type: 'survive', seconds: 40, wanted: 3, label: 'Survive the heat (0s / 40s)' },
      { type: 'drive', x: 2640, y: 480, r: 90, label: 'Reach the safehouse' },
    ],
  },
  {
    id: 5, title: 'The Informant', reward: 2000,
    brief: 'A Harbor Kings courier is rolling through downtown. Tail him — close enough to see, far enough that he never notices — then take him down.',
    steps: [
      { type: 'tail', seconds: 25, label: 'Tail the courier without being spotted' },
      { type: 'kill', count: 2, spawnAt: [1920, 1920], label: 'Confront the courier\'s crew (0/2)' },
    ],
  },
  {
    id: 6, title: 'Boardwalk Brawl', reward: 2200,
    brief: 'The Kings own the boardwalk tonight. Walk the Palms strip and settle it — they will come to you.',
    steps: [
      { type: 'goto', x: 3000, y: 2400, r: 110, label: 'Reach the Palms boardwalk' },
      { type: 'kill', count: 8, spawnAt: [3000, 2400], label: 'Beat the boardwalk crew (0/8)' },
    ],
  },
  {
    id: 7, title: 'The Vault', reward: 3000,
    brief: 'Marlowe\'s big one: the Alderra Trust bank. Hold the lobby against the police waves, then run with the take.',
    steps: [
      { type: 'goto', x: 1920, y: 1200, r: 100, label: 'Reach the Alderra Trust bank' },
      { type: 'holdout', seconds: 60, label: 'Hold the bank against the waves' },
      { type: 'drive', x: 480, y: 480, r: 90, label: 'Escape with the take' },
    ],
  },
  {
    id: 8, title: 'King of Solmar', reward: 3500,
    brief: 'One last debt. The Harbor Kings\' boss is running for the docks in his armored coupe. Run him off the road, then finish it at the warehouse.',
    steps: [
      { type: 'chase', label: 'Run the boss\'s coupe off the road' },
      { type: 'kill', count: 6, spawnAt: [1000, 1500], label: 'Finish the Kings at the warehouse (0/6)' },
    ],
  },
];

export function createMissionState() {
  return {
    idx: 0, active: false, step: 0, briefingT: 0, data: {},
    completed: [], failed: false, failReason: '',
  };
}

export function missionMarker(state) {
  if (state.mission.active || state.mission.idx >= MISSIONS.length) return null;
  return MISSION_MARKER;
}

export function startMission(state, idx) {
  const m = MISSIONS[idx];
  if (!m) return;
  state.mission.active = true;
  state.mission.idx = idx;
  state.mission.step = 0;
  state.mission.data = {};
  state.mission.briefingT = 5;
  state.mission.failed = false;
  state.stats.missionKills = 0;
  state.audio.sting();
  // Mission 4 opens hot; mission 8 spawns the boss car.
  if (m.id === 4) addHeat(state, 60);
  if (m.id === 8) {
    const boss = makeCar('coupe', 2400, 1200, 0, 'mission');
    boss.health = 260;
    boss.cruise = 300;
    boss.axis = 'h';
    boss.road = 1200;
    boss.dir = 1;
    boss.target = { x: 1000, y: 1500 };
    state.cars.push(boss);
    state.mission.data.chaseCar = boss;
  }
}

function completeStep(state) {
  state.mission.step += 1;
  state.mission.data = { ...state.mission.data, stepT: 0, spawned: false, waveT: 0, tailT: 0, spottedT: 0 };
  state.audio.pickup();
  if (state.mission.step >= MISSIONS[state.mission.idx].steps.length) {
    completeMission(state);
  }
}

function completeMission(state) {
  const m = MISSIONS[state.mission.idx];
  state.player.cash += m.reward;
  state.mission.completed.push(m.id);
  state.mission.active = false;
  state.mission.idx += 1;
  state.mission.data = {};
  state.hudFlash = { text: `Mission complete: ${m.title}  +$${m.reward}`, t: 3.5 };
  state.audio.cash();
  state.audio.sting();
  state.stats.missionsDone += 1;
}

export function failMission(state, reason) {
  state.mission.active = false;
  state.mission.failed = true;
  state.mission.failReason = reason;
  state.mission.data = {};
  state.hudFlash = { text: `Mission failed: ${reason}`, t: 3.5 };
  state.audio.fail();
}

function stepLabel(state, step) {
  if (step.type === 'kill') {
    const done = Math.min(step.count, state.stats.missionKills);
    return step.label.replace(/\(\d+\/\d+\)/, `(${done}/${step.count})`);
  }
  if (step.type === 'survive') {
    const t = Math.floor(state.mission.data.stepT || 0);
    return step.label.replace(/\(\d+s \/ \d+s\)/, `(${t}s / ${step.seconds}s)`);
  }
  return step.label;
}

export function objectiveText(state) {
  if (!state.mission.active) {
    if (state.mission.idx < MISSIONS.length) return `Next job: ${MISSIONS[state.mission.idx].title} — reach the gold M`;
    return 'All missions complete. Solmar is yours, Rook.';
  }
  const m = MISSIONS[state.mission.idx];
  const step = m.steps[state.mission.step];
  if (!step) return m.title;
  return `${m.title}: ${stepLabel(state, step)}`;
}

export function waypoint(state) {
  if (!state.mission.active) return missionMarker(state);
  const m = MISSIONS[state.mission.idx];
  const step = m.steps[state.mission.step];
  if (!step) return null;
  if (step.type === 'tail' && state.mission.data.tailCar) {
    return { x: state.mission.data.tailCar.x, y: state.mission.data.tailCar.y, tail: true };
  }
  if (step.type === 'chase' && state.mission.data.chaseCar) {
    return { x: state.mission.data.chaseCar.x, y: state.mission.data.chaseCar.y, chase: true };
  }
  if (step.x !== undefined) return { x: step.x, y: step.y };
  if (step.spawnAt) return { x: step.spawnAt[0], y: step.spawnAt[1] };
  return null;
}

function spawnTailCar(state) {
  const car = makeCar('sedan', 2100, 1200, 0, 'mission');
  car.axis = 'h';
  car.road = 1200;
  car.dir = 1;
  car.cruise = 150;
  car.speed = 150;
  state.cars.push(car);
  state.mission.data.tailCar = car;
  return car;
}

function driveTailCar(state, car, dt) {
  // The courier cruises the downtown grid; he turns at random intersections.
  car.turnCd = Math.max(0, (car.turnCd || 0) - dt);
  const axisRoads = car.axis === 'v' ? [480, 1200, 1920, 2400] : [480, 1200, 1920, 2640, 3360];
  const crossRoads = car.axis === 'v' ? [480, 1200, 1920, 2640, 3360] : [480, 1200, 1920, 2400];
  const pos = car.axis === 'v' ? car.y : car.x;
  let nearestCross = null;
  let nearestD = Infinity;
  for (const cr of crossRoads) {
    const d = (cr - pos) * car.dir;
    if (d > 0 && d < nearestD) {
      nearestD = d;
      nearestCross = cr;
    }
  }
  if (nearestCross !== null && nearestD < 40 && car.turnCd <= 0 && Math.random() < 0.6) {
    const newAxis = car.axis === 'v' ? 'h' : 'v';
    car.axis = newAxis;
    car.dir = Math.random() < 0.5 ? 1 : -1;
    car.road = nearestCross;
    car.angle = newAxis === 'v' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI);
    car.turnCd = 2;
  }
  car.speed += (car.cruise - car.speed) * Math.min(1, 1.5 * dt);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
}

export function updateMissions(state, dt) {
  const ms = state.mission;
  if (ms.briefingT > 0) {
    ms.briefingT -= dt;
    return; // Briefing card holds the world still.
  }
  if (!ms.active) return;
  const m = MISSIONS[ms.idx];
  const step = m.steps[ms.step];
  if (!step) return;
  const p = state.player;
  const d = ms.data;
  d.stepT = (d.stepT || 0) + dt;

  switch (step.type) {
    case 'steal':
      if (p.inCar) completeStep(state);
      break;
    case 'goto':
    case 'drive': {
      const dist = Math.hypot(p.x - step.x, p.y - step.y);
      if (dist < step.r) completeStep(state);
      break;
    }
    case 'kill': {
      if (!d.spawned) {
        d.spawned = true;
        state.stats.missionKills = 0;
        combat.spawnGoons(state, step.spawnAt[0], step.spawnAt[1], step.count, { weapon: step.count > 6 ? 'smg' : 'pistol' });
        if (step.count > 6) state.pickups.push({ x: step.spawnAt[0] + 60, y: step.spawnAt[1], kind: 'smg', amount: 0, t: 0 });
      }
      if (state.stats.missionKills >= step.count) completeStep(state);
      break;
    }
    case 'survive': {
      if (state.wanted.heat < step.wanted * 20 - 5) addHeat(state, 30 * dt);
      if (d.stepT >= step.seconds) completeStep(state);
      break;
    }
    case 'tail': {
      if (!d.tailCar) spawnTailCar(state);
      const car = d.tailCar;
      driveTailCar(state, car, dt);
      const dist = Math.hypot(p.x - car.x, p.y - car.y);
      if (dist < 130) {
        d.spottedT = (d.spottedT || 0) + dt;
        if (d.spottedT > 3) {
          failMission(state, 'The courier spotted you');
          return;
        }
      } else {
        d.spottedT = 0;
      }
      if (dist > 800) {
        failMission(state, 'You lost the courier');
        return;
      }
      d.tailT = (d.tailT || 0) + dt;
      if (d.tailT >= step.seconds) {
        car.driver = 'parked';
        car.speed = 0;
        combat.spawnGoons(state, car.x, car.y, 2, {});
        completeStep(state);
      }
      break;
    }
    case 'chase': {
      const car = d.chaseCar;
      if (!car) break;
      if (d.chaseDown || car.health <= 0) {
        if (car.health > 0) explodeCar(state, car);
        completeStep(state);
        break;
      }
      // The boss flees toward the docks along the roads.
      car.turnCd = Math.max(0, (car.turnCd || 0) - dt);
      const tx = 1000;
      const ty = 1500;
      const want = Math.atan2(ty - car.y, tx - car.x);
      let diff = want - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const steer = Math.max(-1, Math.min(1, diff * 2));
      car.speed += ((car.cruise + 120) - car.speed) * Math.min(1, 1.2 * dt);
      car.angle += steer * 2.2 * dt;
      car.x += Math.cos(car.angle) * car.speed * dt;
      car.y += Math.sin(car.angle) * car.speed * dt;
      if (Math.hypot(car.x - tx, car.y - ty) < 120) {
        car.cruise = 120;
      }
      break;
    }
    case 'holdout': {
      d.waveT = (d.waveT || 0) - dt;
      const wave = Math.floor(d.stepT / 15) + 1;
      if (d.waveT <= 0) {
        d.waveT = 6;
        const n = Math.min(2 + wave, 5);
        combat.spawnGoons(state, p.x + (Math.random() < 0.5 ? -320 : 320), p.y + (Math.random() < 0.5 ? -260 : 260), n, { weapon: 'smg' });
        addHeat(state, 20);
        spawnSmoke(state, p.x, p.y, 4);
      }
      if (d.stepT >= step.seconds) completeStep(state);
      break;
    }
    default:
      break;
  }
}

// ---- Taxi fares -----------------------------------------------------------
// When Rook is driving with no mission, a fare may appear on a nearby sidewalk.
// Eight candidate spots within 900px are tried so a fare almost always appears.
export function updateTaxi(state, dt) {
  const taxi = state.taxi;
  const p = state.player;
  if (state.mission.active) {
    if (taxi.active) {
      taxi.active = false;
      if (taxi.ped) taxi.ped.taxiFare = false;
    }
    return;
  }
  if (!taxi.active) {
    taxi.cool -= dt;
    if (taxi.cool > 0 || !p.inCar) return;
    // Try 8 sidewalk points near the cab.
    for (let i = 0; i < 8; i++) {
      const cand = roadPointNear(state.rng, p.x, p.y, 900);
      const ped = state.peds.find((q) => Math.hypot(q.x - cand.x, q.y - cand.y) < 160 && !q.taxiFare);
      if (ped) {
        ped.taxiFare = true;
        const dest = roadPointNear(state.rng, p.x + (Math.random() < 0.5 ? -1400 : 1400), p.y + (Math.random() < 0.5 ? -1000 : 1000), 500);
        taxi.active = true;
        taxi.phase = 'pickup';
        taxi.ped = ped;
        taxi.dest = dest;
        taxi.fare = 60 + Math.floor(Math.hypot(dest.x - ped.x, dest.y - ped.y) / 40);
        taxi.timer = 90;
        break;
      }
    }
    return;
  }
  taxi.timer -= dt;
  if (taxi.timer <= 0) {
    taxi.active = false;
    if (taxi.ped) taxi.ped.taxiFare = false;
    state.hudFlash = { text: 'Fare cancelled — too slow', t: 2 };
    taxi.cool = 20;
    return;
  }
  if (taxi.phase === 'pickup') {
    if (Math.hypot(p.x - taxi.ped.x, p.y - taxi.ped.y) < 70 && p.inCar) {
      taxi.phase = 'dropoff';
      taxi.ped.gone = true;
      state.audio.pickup();
      state.hudFlash = { text: `Fare aboard — take them to the gold marker ($${taxi.fare})`, t: 2.5 };
    }
  } else if (Math.hypot(p.x - taxi.dest.x, p.y - taxi.dest.y) < 80) {
    p.cash += taxi.fare;
    state.stats.taxiEarned += taxi.fare;
    state.audio.cash();
    state.hudFlash = { text: `Fare paid +$${taxi.fare}`, t: 2.5 };
    taxi.active = false;
    taxi.cool = 25;
  }
  state.peds = state.peds.filter((q) => !q.gone);
}
