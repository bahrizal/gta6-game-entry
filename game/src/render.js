// World renderer: camera, ground, roads, buildings, props, vehicles,
// people, particles, day/night lighting and screen shake.
import { WORLD, PALETTE } from './config.js';
import { clamp, lerp } from './random.js';
import { isRoad, isWater, isBeach } from './city.js';

// 0 = full night, 1 = full day.
export function dayFactor(clock) {
  const h = (clock % 86400) / 3600;
  if (h >= 7 && h < 17.5) return 1;
  if (h >= 18.5 || h < 6) return 0;
  if (h >= 6 && h < 7) return (h - 6) / 1;
  return 1 - (h - 17.5) / 1;
}

function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return ((h ^ (h >> 16)) >>> 0) / 4294967296;
}

export function drawWorld(ctx, G) {
  const p = G.player;
  const cam = G.camera;
  // Camera follows the player, clamped to the world.
  const tx = clamp(p.x - 640, 0, WORLD.W - 1280);
  const ty = clamp(p.y - 360, 0, WORLD.H - 720);
  cam.x = lerp(cam.x, tx, 0.12);
  cam.y = lerp(cam.y, ty, 0.12);
  const shakeX = cam.shake > 0 ? (G.rng() - 0.5) * cam.shake : 0;
  const shakeY = cam.shake > 0 ? (G.rng() - 0.5) * cam.shake : 0;
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - 30 * (1 / 60));
  const vx = cam.x + shakeX;
  const vy = cam.y + shakeY;
  const view = { x0: vx - 40, y0: vy - 40, x1: vx + 1320, y1: vy + 760 };
  const day = dayFactor(G.clock);
  const night = 1 - day;

  ctx.save();
  ctx.translate(-vx, -vy);

  // Ground.
  ctx.fillStyle = PALETTE.grass;
  ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
  // Mow stripes for a little texture.
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  const stripe = 120;
  for (let y = Math.floor(view.y0 / stripe) * stripe; y < view.y1; y += stripe * 2) {
    ctx.fillRect(view.x0, y, view.x1 - view.x0, stripe);
  }
  // Beach and water.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(view.x0, WORLD.BEACH_Y, view.x1 - view.x0, WORLD.WATER_Y - WORLD.BEACH_Y);
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(WORLD.WATER_X - 120, view.y0, 120, view.y1 - view.y0);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WORLD.WATER_X, view.y0, view.x1 - WORLD.WATER_X, view.y1 - view.y0);
  ctx.fillRect(view.x0, WORLD.WATER_Y, view.x1 - view.x0, view.y1 - WORLD.WATER_Y);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  for (let i = 0; i < 8; i++) {
    const wy = WORLD.WATER_Y + 30 + i * 26 + Math.sin(G.time * 0.7 + i) * 6;
    ctx.fillRect(view.x0, wy, view.x1 - view.x0, 3);
  }

  drawRoads(ctx, G, view);
  drawBuildings(ctx, G, view, night);
  drawProps(ctx, G, view);
  drawPickups(ctx, G, view);
  drawSkids(ctx, G, view);
  for (const car of G.cars) drawCar(ctx, G, car, view, night);
  for (const ped of G.peds) drawPed(ctx, G, ped, view);
  for (const e of G.enemies) drawEnemy(ctx, G, e, view);
  for (const cop of G.cops) {
    if (cop.kind === 'foot') drawCop(ctx, G, cop, view);
  }
  drawBullets(ctx, G, view);
  drawParticles(ctx, G, view);
  if (!p.inCar) drawPlayer(ctx, G, view);
  drawWaypoint(ctx, G, view);

  // Night tint + headlights.
  if (night > 0.03) {
    ctx.fillStyle = 'rgba(8,10,44,' + (night * 0.42).toFixed(3) + ')';
    ctx.fillRect(view.x0, view.y0, view.x1 - view.x0, view.y1 - view.y0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const car of G.cars) {
      if (Math.abs(car.speed) < 5 && car.driver === 'none') continue;
      const hx = car.x + Math.cos(car.angle) * 24;
      const hy = car.y + Math.sin(car.angle) * 24;
      const grad = ctx.createRadialGradient(hx, hy, 4, hx, hy, 150);
      grad.addColorStop(0, 'rgba(255,240,180,' + (0.20 * night).toFixed(3) + ')');
      grad.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(hx, hy, 150, 0, Math.PI * 2);
      ctx.fill();
    }
    // Street lamps glow.
    for (const rx of WORLD.ROADS_X) {
      for (const ry of WORLD.ROADS_Y) {
        const lx = rx + 80;
        const ly = ry - 80;
        if (lx < view.x0 || lx > view.x1 || ly < view.y0 || ly > view.y1) continue;
        const grad = ctx.createRadialGradient(lx, ly, 2, lx, ly, 90);
        grad.addColorStop(0, 'rgba(255,220,140,' + (0.25 * night).toFixed(3) + ')');
        grad.addColorStop(1, 'rgba(255,220,140,0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(lx, ly, 90, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  ctx.restore();
}

function drawRoads(ctx, G, view) {
  const half = WORLD.ROAD_W / 2;
  // Sidewalk aprons.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const rx of WORLD.ROADS_X) {
    ctx.fillRect(rx - half - 18, view.y0, WORLD.ROAD_W + 36, view.y1 - view.y0);
  }
  for (const ry of WORLD.ROADS_Y) {
    ctx.fillRect(view.x0, ry - half - 18, view.x1 - view.x0, WORLD.ROAD_W + 36);
  }
  // Asphalt.
  ctx.fillStyle = PALETTE.road;
  for (const rx of WORLD.ROADS_X) {
    ctx.fillRect(rx - half, view.y0, WORLD.ROAD_W, view.y1 - view.y0);
  }
  for (const ry of WORLD.ROADS_Y) {
    ctx.fillRect(view.x0, ry - half, view.x1 - view.x0, WORLD.ROAD_W);
  }
  // Lane dashes.
  ctx.fillStyle = PALETTE.lane;
  for (const rx of WORLD.ROADS_X) {
    for (let y = Math.floor(view.y0 / 64) * 64; y < view.y1; y += 64) {
      if (WORLD.ROADS_Y.some((ry) => Math.abs(y - ry) < 90)) continue;
      ctx.fillRect(rx - 2, y, 4, 32);
    }
  }
  for (const ry of WORLD.ROADS_Y) {
    for (let x = Math.floor(view.x0 / 64) * 64; x < view.x1; x += 64) {
      if (WORLD.ROADS_X.some((rx) => Math.abs(x - rx) < 90)) continue;
      ctx.fillRect(x, ry - 2, 32, 4);
    }
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  for (const rx of WORLD.ROADS_X) {
    for (const ry of WORLD.ROADS_Y) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 16 - 5, ry - half - 12, 10, 24);
        ctx.fillRect(rx + i * 16 - 5, ry + half - 12, 10, 24);
      }
    }
  }
  // Boardwalk planks along the beach.
  ctx.fillStyle = '#a87c4f';
  ctx.fillRect(view.x0, WORLD.BEACH_Y - 14, view.x1 - view.x0, 14);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  for (let x = Math.floor(view.x0 / 46) * 46; x < view.x1; x += 46) {
    ctx.fillRect(x, WORLD.BEACH_Y - 14, 2, 14);
  }
}

function drawBuildings(ctx, G, view, night) {
  for (let i = 0; i < G.city.buildings.length; i++) {
    const b = G.city.buildings[i];
    if (b.x + b.w / 2 < view.x0 || b.x - b.w / 2 > view.x1 || b.y + b.h / 2 < view.y0 || b.y - b.h / 2 > view.y1) continue;
    const x = b.x - b.w / 2;
    const y = b.y - b.h / 2;
    // Drop shadow for height.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x + b.hgt * 0.18, y + b.hgt * 0.18, b.w, b.h);
    // Roof.
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(x, y, b.w, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + b.h - 12, b.w, 12);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, b.w, b.h);
    // Windows, lit at night.
    const cols = Math.max(2, Math.floor(b.w / 34));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let cx = 0; cx < cols; cx++) {
      for (let cy = 0; cy < rows; cy++) {
        const lit = hash2(i * 7 + cx * 3, cy * 5 + 1) < 0.5;
        ctx.fillStyle = night > 0.4 && lit ? '#ffd97a' : 'rgba(20,30,50,0.55)';
        ctx.fillRect(x + 12 + cx * ((b.w - 24) / cols), y + 12 + cy * ((b.h - 24) / rows), 12, 10);
      }
    }
    // Landmark label.
    if (b.landmark) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.name, b.x, b.y);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

function drawProps(ctx, G, view) {
  for (const palm of G.city.palms) {
    if (palm.x < view.x0 || palm.x > view.x1 || palm.y < view.y0 || palm.y > view.y1) continue;
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 4, palm.y - 26);
    ctx.stroke();
    ctx.fillStyle = '#3f8a3f';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ctx.beginPath();
      ctx.ellipse(palm.x + 4 + Math.cos(a) * 12, palm.y - 28 + Math.sin(a) * 8, 13, 5, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const pr of G.city.props) {
    if (pr.x < view.x0 || pr.x > view.x1 || pr.y < view.y0 || pr.y > view.y1) continue;
    if (pr.kind === 'hydrant') {
      ctx.fillStyle = '#c22e2e';
      ctx.fillRect(pr.x - 5, pr.y - 8, 10, 16);
      ctx.fillStyle = '#ffd24d';
      ctx.fillRect(pr.x - 5, pr.y - 8, 10, 4);
    } else if (pr.kind === 'dumpster') {
      ctx.fillStyle = '#2e6b34';
      ctx.fillRect(pr.x - 14, pr.y - 10, 28, 20);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(pr.x - 14, pr.y - 10, 28, 5);
    } else if (pr.kind === 'billboard') {
      ctx.fillStyle = '#222';
      ctx.fillRect(pr.x - 3, pr.y, 6, 26);
      ctx.fillStyle = '#1a2a4a';
      ctx.fillRect(pr.x - 44, pr.y - 34, 88, 34);
      ctx.fillStyle = '#ffd24d';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pr.text, pr.x, pr.y - 12);
    }
  }
}

function drawPickups(ctx, G, view) {
  for (const pk of G.pickups) {
    if (pk.x < view.x0 || pk.x > view.x1 || pk.y < view.y0 || pk.y > view.y1) continue;
    const bob = Math.sin(pk.bob * 3) * 3;
    const y = pk.y + bob;
    ctx.save();
    ctx.translate(pk.x, y);
    if (pk.kind === 'health') {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = '#e03a3a';
      ctx.fillRect(-3, -8, 6, 16);
      ctx.fillRect(-8, -3, 16, 6);
    } else if (pk.kind === 'cash') {
      ctx.fillStyle = '#2e7a3a';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#7dff8a';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, 1);
      ctx.textBaseline = 'alphabetic';
    } else if (pk.kind === 'package') {
      const glow = 0.6 + Math.sin(pk.bob * 4) * 0.3;
      ctx.fillStyle = 'rgba(255,210,77,' + glow.toFixed(2) + ')';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6a1a';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = '#ffd24d';
      ctx.fillRect(-8, -2, 16, 4);
    } else {
      ctx.fillStyle = '#c9a13a';
      ctx.fillRect(-11, -7, 22, 14);
      ctx.fillStyle = '#333';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pk.kind === 'weapon-smg' ? 'SMG' : pk.kind === 'weapon-pistol' ? 'PISTOL' : 'AMMO', 0, 1);
      ctx.textBaseline = 'alphabetic';
    }
    ctx.restore();
  }
}

function drawSkids(ctx, G, view) {
  ctx.fillStyle = 'rgba(20,20,20,0.35)';
  for (const car of G.cars) {
    for (const s of car.skid || []) {
      if (s.x < view.x0 || s.x > view.x1 || s.y < view.y0 || s.y > view.y1) continue;
      ctx.fillRect(s.x - 3, s.y - 3, 6, 6);
    }
  }
}

function drawCar(ctx, G, car, view, night) {
  if (car.x < view.x0 || car.x > view.x1 || car.y < view.y0 || car.y > view.y1) return;
  const spec = car.spec;
  const L = spec.len;
  const W = spec.wid;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(-L / 2 + 3, -W / 2 + 4, L, W);
  // Body.
  ctx.fillStyle = car.color;
  roundRectPath(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Cabin / windshield.
  ctx.fillStyle = 'rgba(20,30,45,0.85)';
  roundRectPath(ctx, -L * 0.18, -W / 2 + 3, L * 0.36, W - 6, 4);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.35)';
  ctx.fillRect(-L * 0.18, -W / 2 + 3, 6, W - 6);
  // Headlights.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 3, 5);
  ctx.fillRect(L / 2 - 2, W / 2 - 7, 3, 5);
  // Tail lights.
  ctx.fillStyle = '#e03a3a';
  ctx.fillRect(-L / 2 - 1, -W / 2 + 2, 3, 5);
  ctx.fillRect(-L / 2 - 1, W / 2 - 7, 3, 5);
  if (car.model === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  if (car.model === 'cruiser') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-L * 0.3, -W / 2 + 2, L * 0.6, 5);
    ctx.fillRect(-L * 0.3, W / 2 - 7, L * 0.6, 5);
    const flash = Math.floor(G.time * 4) % 2 === 0;
    ctx.fillStyle = flash ? '#ff2222' : '#2266ff';
    ctx.beginPath();
    ctx.arc(-4, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = flash ? '#2266ff' : '#ff2222';
    ctx.beginPath();
    ctx.arc(4, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (car.hp < car.maxHp * 0.5) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-L / 2 + 4, -W / 2 + 3, L * 0.3, W - 6);
  }
  ctx.restore();
  // Damage smoke is particles; the label for a target car.
  if (car.driver === 'target' || car.driver === 'convoy') {
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(car.driver === 'target' ? 'TARGET' : 'KINGS', car.x, car.y - 30);
  }
}

function drawFigure(ctx, x, y, angle, body, head, opts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 11, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (opts && opts.gun) {
    ctx.fillStyle = '#222';
    ctx.fillRect(8, -2, 12, 4);
  }
  ctx.restore();
}

function drawPed(ctx, G, ped, view) {
  if (ped.x < view.x0 || ped.x > view.x1 || ped.y < view.y0 || ped.y > view.y1) return;
  if (ped.dead) {
    ctx.save();
    ctx.translate(ped.x, ped.y);
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const bob = Math.sin(ped.walkPhase) * 2;
  const speed = ped.state === 'flee' ? 1.4 : 1;
  drawFigure(ctx, ped.x, ped.y + bob * 0.3, ped.angle, ped.color, '#e8b98a', null);
  if (ped.state === 'flee') {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', ped.x, ped.y - 22);
  }
  if (ped.state === 'wait') {
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', ped.x, ped.y - 22);
  }
  void speed;
}

function drawEnemy(ctx, G, e, view) {
  if (e.hp <= 0) return;
  if (e.x < view.x0 || e.x > view.x1 || e.y < view.y0 || e.y > view.y1) return;
  drawFigure(ctx, e.x, e.y, e.angle, e.kind === 'boss' ? '#4a2a6a' : '#7a2a2a', '#d8a06a', { gun: true });
  // Health bar.
  ctx.fillStyle = '#222';
  ctx.fillRect(e.x - 14, e.y - 26, 28, 5);
  ctx.fillStyle = '#e03a3a';
  const max = e.kind === 'boss' ? 220 : e.kind === 'heavy' ? 90 : 50;
  ctx.fillRect(e.x - 14, e.y - 26, 28 * clamp(e.hp / max, 0, 1), 5);
  if (e.kind === 'boss') {
    ctx.fillStyle = '#ff44ff';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('THE KING', e.x, e.y - 32);
  }
}

function drawCop(ctx, G, cop, view) {
  if (cop.x < view.x0 || cop.x > view.x1 || cop.y < view.y0 || cop.y > view.y1) return;
  drawFigure(ctx, cop.x, cop.y, cop.angle, '#1a3a8a', '#e8b98a', { gun: false });
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 10px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PD', cop.x, cop.y - 18);
}

function drawPlayer(ctx, G, view) {
  const p = G.player;
  if (p.x < view.x0 - 40 || p.x > view.x1 + 40 || p.y < view.y0 - 40 || p.y > view.y1 + 40) return;
  const bob = p.moving ? Math.sin(p.walkPhase || 0) * 2 : 0;
  drawFigure(ctx, p.x, p.y + bob * 0.3, p.angle, '#e07a1f', '#e8b98a', { gun: p.weapon !== 'fists' });
  // Aim line when armed.
  if (p.weapon !== 'fists') {
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * 16, p.y + Math.sin(p.angle) * 16);
    ctx.lineTo(p.x + Math.cos(p.angle) * 60, p.y + Math.sin(p.angle) * 60);
    ctx.stroke();
  }
}

function drawBullets(ctx, G, view) {
  ctx.strokeStyle = '#ffe14d';
  ctx.lineWidth = 3;
  for (const b of G.bullets) {
    if (b.x < view.x0 || b.x > view.x1 || b.y < view.y0 || b.y > view.y1) continue;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.stroke();
  }
}

function drawParticles(ctx, G, view) {
  for (const pt of G.particles) {
    if (pt.x < view.x0 || pt.x > view.x1 || pt.y < view.y0 || pt.y > view.y1) continue;
    const a = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawWaypoint(ctx, G, view) {
  const w = G.waypoint;
  if (!w) return;
  const p = G.player;
  const d = Math.hypot(w.x - p.x, w.y - p.y);
  if (w.x > view.x0 && w.x < view.x1 && w.y > view.y0 && w.y < view.y1) {
    const pulse = 1 + Math.sin(G.time * 4) * 0.15;
    ctx.save();
    ctx.translate(w.x, w.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = 'rgba(255,210,77,0.25)';
    ctx.beginPath();
    ctx.arc(0, 0, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd24d';
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(12, 0);
    ctx.lineTo(0, 18);
    ctx.lineTo(-12, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(w.label + ' · ' + Math.round(d) + 'm', w.x, w.y - 52);
  } else {
    // Off-screen edge arrow pointing at the waypoint.
    const cx = clamp(w.x, view.x0 + 60, view.x1 - 60);
    const cy = clamp(w.y, view.y0 + 60, view.y1 - 60);
    const a = Math.atan2(w.y - p.y, w.x - p.x);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.fillStyle = '#ffd24d';
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-10, -12);
    ctx.lineTo(-10, 12);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(d) + 'm', cx, cy + 28);
  }
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
