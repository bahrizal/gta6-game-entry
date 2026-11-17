// Solmar: a procedural coastal city on one connected road grid.
// Districts: Harbor (west), Downtown (centre), Palms (east + beachfront).
// Water runs along the south and east edges; a wooden pier reaches into it.
import { H_ROADS, PALETTE, SAND_EAST, SAND_SOUTH, V_ROADS, WATER_EAST, WATER_SOUTH, WORLD_H, WORLD_W } from './config.js';

const BLOCK_X = [[48, 432], [528, 1152], [1248, 1872], [1968, 2592], [2688, 3312], [3408, 3560]];
const BLOCK_Y = [[48, 432], [528, 1152], [1248, 1872], [1968, 2352]];

const HARBOR_COLORS = ['#7d8894', '#6b7c8c', '#8c7f6b', '#5f7484'];
const DOWNTOWN_COLORS = ['#b8a06a', '#7a8ba0', '#a07a6b', '#6b8a7a', '#9a7ab0', '#c0a878'];
const PALMS_COLORS = ['#e0b48a', '#d98a7a', '#a8c0a0', '#e8d0a0', '#c09a8a'];
const ROOF_TRIMS = ['#3a3f45', '#4a4038', '#2f3a45'];

export function districtAt(x, y) {
  if (y >= SAND_SOUTH || x >= SAND_EAST) return 'beach';
  if (x < 1200) return 'harbor';
  if (x >= 2640) return 'palms';
  return 'downtown';
}

export function isWater(x, y) {
  return x >= WATER_EAST || y >= WATER_SOUTH;
}

export function isSand(x, y) {
  if (isWater(x, y)) return false;
  return x >= SAND_EAST || y >= SAND_SOUTH;
}

export function onRoad(city, x, y) {
  for (const rx of V_ROADS) {
    if (Math.abs(x - rx) <= 48 && y >= 240 && y <= SAND_SOUTH) return true;
  }
  for (const ry of H_ROADS) {
    if (Math.abs(y - ry) <= 48 && x >= 240 && x <= SAND_EAST) return true;
  }
  return false;
}

function buildingAt(city, x, y, pad) {
  for (const b of city.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

// Circle vs buildings / water / world edge. Returns the blocking building or null.
export function collides(city, x, y, r) {
  if (x < 24 + r || x > WORLD_W - 24 - r || y < 24 + r || y > WORLD_H - 24 - r) return { edge: true };
  if (isWater(x, y)) {
    // The pier is walkable planks over the water.
    if (!(x >= 2980 && x <= 3080 && y >= SAND_SOUTH && y <= 2800)) return { water: true };
  }
  return buildingAt(city, x, y, r);
}

export function buildCity(rng) {
  const buildings = [];
  const palms = [];
  const props = [];
  const lights = [];

  for (let bx = 0; bx < BLOCK_X.length; bx++) {
    for (let by = 0; by < BLOCK_Y.length; by++) {
      const [x0, x1] = BLOCK_X[bx];
      const [y0, y1] = BLOCK_Y[by];
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const count = district === 'downtown' ? rng.int(2, 4) : rng.int(1, 3);
      const cellW = (x1 - x0) / Math.ceil(Math.sqrt(count));
      const cellH = (y1 - y0) / Math.ceil(Math.sqrt(count));
      for (let i = 0; i < count; i++) {
        const gx = x0 + (i % Math.ceil(Math.sqrt(count))) * cellW;
        const gy = y0 + Math.floor(i / Math.ceil(Math.sqrt(count))) * cellH;
        const w = rng.range(cellW * 0.45, cellW * 0.8);
        const h = rng.range(cellH * 0.45, cellH * 0.8);
        const x = gx + (cellW - w) / 2 + rng.range(-8, 8);
        const y = gy + (cellH - h) / 2 + rng.range(-8, 8);
        let color;
        let height;
        let type = 'block';
        if (district === 'harbor') {
          color = rng.pick(HARBOR_COLORS);
          height = rng.int(10, 26);
          type = rng.chance(0.55) ? 'warehouse' : 'block';
        } else if (district === 'downtown') {
          color = rng.pick(DOWNTOWN_COLORS);
          height = rng.int(28, 95);
          type = height > 60 ? 'tower' : 'block';
        } else {
          color = rng.pick(PALMS_COLORS);
          height = rng.int(8, 20);
          type = rng.chance(0.5) ? 'motel' : 'house';
        }
        buildings.push({ x, y, w, h, color, trim: rng.pick(ROOF_TRIMS), height, type, district, seed: rng.int(0, 9999) });
      }
    }
  }

  // Beachfront motels along the sand strip.
  for (let x = 560; x < 3300; x += 300) {
    if (rng.chance(0.7)) {
      buildings.push({
        x: x + rng.range(-30, 30), y: 2452, w: rng.range(110, 170), h: 76,
        color: rng.pick(PALMS_COLORS), trim: '#3a3f45', height: 12, type: 'motel', district: 'palms', seed: rng.int(0, 9999),
      });
    }
  }

  // Palms: dense along the beach road, scattered in Palms district.
  for (let x = 560; x < 3480; x += 150) {
    if (rng.chance(0.8)) palms.push({ x: x + rng.range(-20, 20), y: 2478 + rng.range(-6, 6), s: rng.range(0.8, 1.3) });
  }
  for (let i = 0; i < 46; i++) {
    const x = rng.range(2700, 3480);
    const y = rng.range(300, 2500);
    if (!buildingAt({ buildings }, x, y, 20) && !onRoad(null, x, y)) palms.push({ x, y, s: rng.range(0.7, 1.2) });
  }
  for (let i = 0; i < 18; i++) {
    palms.push({ x: rng.range(300, 3400), y: rng.range(300, 2500), s: rng.range(0.7, 1.1) });
  }

  // Props: hydrants at intersections, dumpsters by warehouses, billboards, cranes.
  for (const rx of V_ROADS) {
    for (const ry of H_ROADS) {
      lights.push({ x: rx, y: ry, phase: rng.range(0, 16) });
      if (rng.chance(0.5)) props.push({ kind: 'hydrant', x: rx + 62, y: ry + 62 });
      if (rng.chance(0.35)) props.push({ kind: 'billboard', x: rx - 90, y: ry - 90, text: rng.pick(['SOLMAR', 'PALMS MOTEL', 'HARBOR FISH', 'ALDERRA', 'ROOK AUTO']) });
    }
  }
  for (let i = 0; i < 14; i++) {
    props.push({ kind: 'dumpster', x: rng.range(560, 1150), y: rng.range(560, 2350) });
  }
  // Harbor cranes (decorative, with a small collision base).
  for (const cy of [900, 1500, 2100]) {
    props.push({ kind: 'crane', x: 300, y: cy });
    buildings.push({ x: 268, y: cy - 26, w: 64, h: 52, color: '#5f7484', trim: '#2f3a45', height: 8, type: 'crane-base', district: 'harbor', seed: 1 });
  }

  // Ten hidden packages tucked at sidewalk corners and landmarks.
  // Each spot is nudged to the nearest open ground so no package ever
  // spawns inside a building.
  const packageSpots = [
    [560, 560], [1120, 400], [2000, 560], [2720, 400], [3280, 1120],
    [560, 1280], [2000, 2000], [2720, 2000], [3280, 2320], [3030, 2650],
  ];
  const packages = packageSpots.map(([x, y]) => {
    let px = x;
    let py = y;
    if (buildingAt({ buildings }, px, py, 18)) {
      outer: for (const r of [50, 100, 180, 280]) {
        for (let a = 0; a < 8; a++) {
          const qx = x + Math.cos((a / 8) * Math.PI * 2) * r;
          const qy = y + Math.sin((a / 8) * Math.PI * 2) * r;
          if (!buildingAt({ buildings }, qx, qy, 18)) {
            px = qx;
            py = qy;
            break outer;
          }
        }
      }
    }
    return { x: px, y: py, taken: false };
  });

  return { buildings, palms, props, lights, packages, palette: PALETTE };
}

// Traffic light state for one intersection at game time t (seconds).
export function lightFor(l, t, axis) {
  const c = (t + l.phase) % 16;
  // Vertical roads get green in the first half of the cycle.
  return axis === 'v' ? c < 8 : c >= 8;
}

// A drivable point on a road near (x, y): used for spawns.
export function roadPointNear(rng, x, y, maxDist) {
  const axis = rng.chance(0.5) ? 'v' : 'h';
  if (axis === 'v') {
    const rx = V_ROADS.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a));
    return { x: rx + rng.range(-20, 20), y: Math.max(300, Math.min(SAND_SOUTH - 60, y + rng.range(-maxDist, maxDist))) };
  }
  const ry = H_ROADS.reduce((a, b) => (Math.abs(b - y) < Math.abs(a - y) ? b : a));
  return { x: Math.max(300, Math.min(SAND_EAST - 60, x + rng.range(-maxDist, maxDist))), y: ry + rng.range(-20, 20) };
}
