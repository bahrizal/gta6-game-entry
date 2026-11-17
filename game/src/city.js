// Procedural Solmar: three districts on one road grid, a beach and water
// along the south and east edges, fixed story landmarks, deterministic
// from the seed.
import { WORLD, PALETTE } from './config.js';
import { mulberry32, range, int, pick, clamp } from './random.js';

const LANDMARKS = [
  { id: 'garage', name: "Kiki's Garage", x: 1560, y: 900, w: 220, h: 150, hgt: 26, color: '#c25a2e' },
  { id: 'bank', name: 'Solmar Bank', x: 2280, y: 1500, w: 240, h: 170, hgt: 64, color: '#8a7f6a' },
  { id: 'warehouse', name: 'Harbor Warehouse', x: 840, y: 2100, w: 260, h: 180, hgt: 30, color: '#5d6b7a' },
  { id: 'hospital', name: 'Solmar General', x: 1560, y: 1620, w: 240, h: 160, hgt: 52, color: '#d8d2c4' },
  { id: 'police', name: 'Solmar PD', x: 2280, y: 900, w: 220, h: 150, hgt: 40, color: '#3a4a6b' },
  { id: 'motel', name: 'Palms Motel', x: 3000, y: 2100, w: 240, h: 140, hgt: 24, color: '#d88a4a' },
  { id: 'diner', name: 'Sunset Diner', x: 3000, y: 900, w: 180, h: 120, hgt: 20, color: '#c24a6a' },
  { id: 'pier', name: 'Boardwalk Pier', x: 3060, y: 2580, w: 200, h: 90, hgt: 8, color: '#8a6a4a' },
];

const DOWNTOWN_COLORS = ['#6b7a8a', '#8a7f6a', '#5d6b7a', '#7a6a7a', '#4a5a6a', '#9a8a6a'];
const HARBOR_COLORS = ['#5d6b7a', '#6b5d4f', '#7a6a55', '#4a5a52'];
const PALMS_COLORS = ['#d88a4a', '#c24a6a', '#e0b45a', '#7ab5a0', '#b57a8a'];

export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const props = [];
  const palms = [];

  const xs = [0, ...WORLD.ROADS_X, WORLD.W];
  const ys = [0, ...WORLD.ROADS_Y, WORLD.H];
  const half = WORLD.ROAD_W / 2;

  // Ordinary buildings, one or two per block cell, kept out of road corridors.
  for (let i = 0; i < xs.length - 1; i++) {
    for (let j = 0; j < ys.length - 1; j++) {
      const x0 = xs[i] + (i === 0 ? 30 : half + 26);
      const x1 = xs[i + 1] - (i === xs.length - 2 ? 30 : half + 26);
      const y0 = ys[j] + (j === 0 ? 30 : half + 26);
      const y1 = ys[j + 1] - (j === ys.length - 2 ? 30 : half + 26);
      if (x1 - x0 < 120 || y1 - y0 < 120) continue;
      // Skip beach and water cells.
      if (y0 >= WORLD.BEACH_Y || x0 >= WORLD.WATER_X) continue;
      const cx = (x0 + x1) / 2;
      const district = cx < 1200 ? 'harbor' : cx < 2640 ? 'downtown' : 'palms';
      const colors = district === 'downtown' ? DOWNTOWN_COLORS : district === 'harbor' ? HARBOR_COLORS : PALMS_COLORS;
      const n = district === 'downtown' && rng() < 0.6 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        const w = range(rng, 130, Math.min(260, x1 - x0 - 20));
        const h = range(rng, 110, Math.min(220, y1 - y0 - 20));
        buildings.push({
          x: n === 1 ? cx : x0 + (x1 - x0) * (k + 0.5) / n,
          y: (y0 + y1) / 2,
          w, h,
          hgt: district === 'downtown' ? int(rng, 40, 120) : int(rng, 18, 46),
          color: pick(rng, colors),
          district,
        });
      }
    }
  }
  // Landmarks replace whatever sat on their spot.
  for (const lm of LANDMARKS) {
    for (let i = buildings.length - 1; i >= 0; i--) {
      const b = buildings[i];
      if (Math.abs(b.x - lm.x) < (b.w + lm.w) / 2 + 10 && Math.abs(b.y - lm.y) < (b.h + lm.h) / 2 + 10) {
        buildings.splice(i, 1);
      }
    }
    buildings.push({ ...lm, district: lm.x < 1200 ? 'harbor' : lm.x < 2640 ? 'downtown' : 'palms', landmark: lm.id });
  }

  // Palms along the beach and the boardwalk; hydrants and dumpsters in town.
  for (let x = 240; x < WORLD.WATER_X; x += 130) {
    palms.push({ x: x + range(rng, -20, 20), y: WORLD.BEACH_Y + 46 + range(rng, -8, 8) });
  }
  for (let i = 0; i < 60; i++) {
    const x = range(rng, 120, WORLD.WATER_X - 120);
    const y = range(rng, 120, WORLD.BEACH_Y - 120);
    if (isRoad(x, y)) continue;
    if (collidesBuilding(buildings, x, y, 30)) continue;
    palms.push({ x, y });
  }
  for (let i = 0; i < 26; i++) {
    const p = randomStreetPoint(rng);
    props.push({ kind: rng() < 0.5 ? 'hydrant' : 'dumpster', x: p.x + range(rng, -90, 90), y: p.y + range(rng, -90, 90) });
  }
  // Billboards face the main avenues.
  for (const bx of [1200, 1920, 2640]) {
    props.push({ kind: 'billboard', x: bx + 90, y: 480 - 90, text: 'SOLMAR' });
    props.push({ kind: 'billboard', x: bx - 90, y: 1920 + 90, text: 'PALMS' });
  }

  return { buildings, props, palms, seed, landmarks: LANDMARKS };
}

export function isRoad(x, y) {
  const half = WORLD.ROAD_W / 2;
  for (const rx of WORLD.ROADS_X) if (Math.abs(x - rx) <= half) return true;
  for (const ry of WORLD.ROADS_Y) if (Math.abs(y - ry) <= half) return true;
  return false;
}

export function isWater(x, y) {
  return x >= WORLD.WATER_X || y >= WORLD.WATER_Y;
}

export function isBeach(x, y) {
  return !isWater(x, y) && y >= WORLD.BEACH_Y && x < WORLD.WATER_X;
}

export function districtAt(x) {
  return x < 1200 ? 'Harbor' : x < 2640 ? 'Downtown' : 'Palms';
}

export function collidesBuilding(buildings, x, y, r) {
  for (const b of buildings) {
    if (Math.abs(x - b.x) < b.w / 2 + r && Math.abs(y - b.y) < b.h / 2 + r) return b;
  }
  return null;
}

// Push a circle out of buildings and the world bounds; returns corrected pos.
export function resolveCircle(buildings, x, y, r) {
  x = clamp(x, r + 8, WORLD.W - r - 8);
  y = clamp(y, r + 8, WORLD.H - r - 8);
  for (let iter = 0; iter < 3; iter++) {
    const b = collidesBuilding(buildings, x, y, r);
    if (!b) break;
    const dx = x - b.x;
    const dy = y - b.y;
    const px = b.w / 2 + r - Math.abs(dx);
    const py = b.h / 2 + r - Math.abs(dy);
    if (px < py) x = b.x + (dx >= 0 ? b.w / 2 + r : -(b.w / 2 + r));
    else y = b.y + (dy >= 0 ? b.h / 2 + r : -(b.h / 2 + r));
  }
  return { x, y };
}

export function randomStreetPoint(rng) {
  if (rng() < 0.5) {
    const rx = pick(rng, WORLD.ROADS_X);
    return { x: rx + range(rng, -40, 40), y: range(rng, 100, WORLD.BEACH_Y - 100) };
  }
  const ry = pick(rng, WORLD.ROADS_Y);
  return { x: range(rng, 100, WORLD.WATER_X - 100), y: ry + range(rng, -40, 40) };
}

export function randomSidewalkPoint(rng) {
  const p = randomStreetPoint(rng);
  const off = WORLD.ROAD_W / 2 + 26;
  if (rng() < 0.5) p.x += rng() < 0.5 ? off : -off;
  else p.y += rng() < 0.5 ? off : -off;
  return { x: clamp(p.x, 60, WORLD.W - 60), y: clamp(p.y, 60, WORLD.H - 60) };
}

// A lane on a road: axis 'v' or 'h', direction +1/-1, lane offset for side.
export function randomLane(rng) {
  const axis = rng() < 0.5 ? 'v' : 'h';
  const dir = rng() < 0.5 ? 1 : -1;
  const lane = 30;
  if (axis === 'v') {
    const rx = pick(rng, WORLD.ROADS_X);
    return {
      x: rx + dir * lane,
      y: range(rng, 120, WORLD.BEACH_Y - 120),
      angle: dir > 0 ? Math.PI / 2 : -Math.PI / 2,
      axis, dir, road: rx,
    };
  }
  const ry = pick(rng, WORLD.ROADS_Y);
  return {
    x: range(rng, 120, WORLD.WATER_X - 120),
    y: ry + dir * lane,
    angle: dir > 0 ? 0 : Math.PI,
    axis, dir, road: ry,
  };
}

export function landmarkById(city, id) {
  return city.landmarks.find((l) => l.id === id);
}

export function roadPointNear(x, y, rng, radius) {
  // Nearest point on the road grid to (x, y), jittered.
  let best = null;
  let bestD = Infinity;
  for (const rx of WORLD.ROADS_X) {
    const px = rx;
    const py = clamp(y, 100, WORLD.BEACH_Y - 100);
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: px, y: py }; }
  }
  for (const ry of WORLD.ROADS_Y) {
    const px = clamp(x, 100, WORLD.WATER_X - 100);
    const py = ry;
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: px, y: py }; }
  }
  if (best) {
    best.x += range(rng, -radius, radius);
    best.y += range(rng, -radius, radius);
  }
  return best || { x, y };
}

export { PALETTE };
