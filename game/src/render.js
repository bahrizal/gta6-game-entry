// World renderer: camera, ground, roads, buildings, props, entities,
// particles, day/night lighting and headlights. Top-down canvas vector art.
import { H_ROADS, PALETTE, SAND_EAST, SAND_SOUTH, V_ROADS, VIEW_H, VIEW_W, WATER_EAST, WATER_SOUTH, WORLD_H, WORLD_W } from './config.js';
import { districtAt } from './city.js';

// 0 = pitch black night, 1 = full day. Dawn 6–8, dusk 18–20.
export function daylight(clock) {
  const h = ((clock % 24) + 24) % 24;
  if (h >= 8 && h < 18) return 1;
  if (h >= 20 || h < 6) return 0;
  if (h >= 6 && h < 8) return (h - 6) / 2;
  return 1 - (h - 18) / 2;
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

function drawCarShape(ctx, car, night) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = car.len;
  const W = car.wid;
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRectPath(ctx, -L / 2 + 3, -W / 2 + 3, L, W, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  roundRectPath(ctx, -L / 2, -W / 2, L, W, 7);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Roof + windows.
  ctx.fillStyle = car.roof;
  roundRectPath(ctx, -L / 2 + 12, -W / 2 + 4, L - 26, W - 8, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.75)';
  ctx.fillRect(-L / 2 + 15, -W / 2 + 5, 8, W - 10);
  ctx.fillRect(L / 2 - 24, -W / 2 + 5, 8, W - 10);
  // Police livery.
  if (car.model === 'cruiser') {
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(-6, -W / 2 + 2, 12, W - 4);
    ctx.fillStyle = '#d9382b';
    ctx.fillRect(-L / 2 + 4, -3, 10, 6);
  }
  if (car.model === 'taxi') {
    ctx.fillStyle = '#111';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
    ctx.textAlign = 'left';
  }
  // Wheels.
  ctx.fillStyle = '#141414';
  for (const [wx, wy] of [[-L / 2 + 8, -W / 2 - 2], [-L / 2 + 8, W / 2 - 2], [L / 2 - 12, -W / 2 - 2], [L / 2 - 12, W / 2 - 2]]) {
    ctx.fillRect(wx, wy, 10, 5);
  }
  // Headlights + brake lights at night.
  if (night) {
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(L / 2 - 2, -W / 2 + 3, 3, 5);
    ctx.fillRect(L / 2 - 2, W / 2 - 8, 3, 5);
  }
  if (car.brake) {
    ctx.fillStyle = '#ff2a1a';
    ctx.fillRect(-L / 2 - 1, -W / 2 + 3, 3, 5);
    ctx.fillRect(-L / 2 - 1, W / 2 - 8, 3, 5);
  }
  // Damage smoke marker is drawn as particles; a wreck is darkened.
  if (car.driver === 'wreck') {
    ctx.fillStyle = 'rgba(20,20,20,0.45)';
    roundRectPath(ctx, -L / 2, -W / 2, L, W, 7);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, color, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(2, 3, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  // Body: shoulders + head + gun arm when armed.
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e8c39a';
  ctx.beginPath();
  ctx.arc(4, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (opts.armed) {
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
  }
  if (opts.cop) {
    ctx.fillStyle = '#1d2f4a';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e8e8e8';
    ctx.font = 'bold 8px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 0, 3);
    ctx.textAlign = 'left';
  }
  if (opts.goon) {
    ctx.strokeStyle = '#d9382b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 13, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

export function drawWorld(ctx, state) {
  const cam = state.camera;
  const p = state.player;
  const night = daylight(state.clock) < 0.45;
  const dl = daylight(state.clock);
  const ox = (Math.random() - 0.5) * state.shake;
  const oy = (Math.random() - 0.5) * state.shake;
  const vx = cam.x - VIEW_W / 2 + ox;
  const vy = cam.y - VIEW_H / 2 + oy;

  ctx.save();
  ctx.translate(-vx, -vy);

  // ---- Ground ----
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(vx - 40, vy - 40, VIEW_W + 80, VIEW_H + 80);
  // City blocks: slightly lighter slabs between roads.
  ctx.fillStyle = PALETTE.block;
  for (let i = 0; i < V_ROADS.length - 1; i++) {
    for (let j = 0; j < H_ROADS.length - 1; j++) {
      const x0 = V_ROADS[i] + 48;
      const y0 = H_ROADS[j] + 48;
      const x1 = V_ROADS[i + 1] - 48;
      const y1 = H_ROADS[j + 1] - 48;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
  }
  // Grass patches in the Palms blocks.
  // Sand + water.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(SAND_EAST, 0, WORLD_W - SAND_EAST, WORLD_H);
  ctx.fillRect(0, SAND_SOUTH, WORLD_W, WORLD_H - SAND_SOUTH);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(WATER_EAST, 0, WORLD_W - WATER_EAST, WORLD_H);
  ctx.fillRect(0, WATER_SOUTH, WORLD_W, WORLD_H - WATER_SOUTH);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(WATER_EAST + 120, 0, WORLD_W - WATER_EAST - 120, WORLD_H);
  // Animated wave lines.
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 10; i++) {
    const wy = WATER_SOUTH + 24 + i * 26 + Math.sin(state.time * 0.8 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(200 + (i % 3) * 40, wy);
    ctx.lineTo(900 + (i % 3) * 120, wy);
    ctx.stroke();
    const wx = WATER_EAST + 24 + i * 26 + Math.cos(state.time * 0.8 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(wx, 200 + (i % 3) * 40);
    ctx.lineTo(wx, 900 + (i % 3) * 120);
    ctx.stroke();
  }

  // ---- Roads ----
  for (const rx of V_ROADS) {
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(rx - 56, 240, 112, SAND_SOUTH - 240);
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(rx - 48, 240, 96, SAND_SOUTH - 240);
  }
  for (const ry of H_ROADS) {
    ctx.fillStyle = PALETTE.sidewalk;
    ctx.fillRect(240, ry - 56, SAND_EAST - 240, 112);
    ctx.fillStyle = PALETTE.road;
    ctx.fillRect(240, ry - 48, SAND_EAST - 240, 96);
  }
  // Lane dashes.
  ctx.fillStyle = PALETTE.dash;
  for (const rx of V_ROADS) {
    for (let y = 280; y < SAND_SOUTH - 20; y += 56) ctx.fillRect(rx - 2, y, 4, 28);
  }
  for (const ry of H_ROADS) {
    for (let x = 280; x < SAND_EAST - 20; x += 56) ctx.fillRect(x, ry - 2, 28, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,230,0.85)';
  for (const rx of V_ROADS) {
    for (const ry of H_ROADS) {
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx - 44 + i * 13, ry - 52, 7, 12);
        ctx.fillRect(rx - 44 + i * 13, ry + 40, 7, 12);
        ctx.fillRect(rx - 52, ry - 44 + i * 13, 12, 7);
        ctx.fillRect(rx + 40, ry - 44 + i * 13, 12, 7);
      }
    }
  }
  // Traffic lights.
  for (const l of state.city.lights) {
    const greenV = ((state.time + l.phase) % 16) < 8;
    ctx.fillStyle = '#222';
    ctx.fillRect(l.x + 52, l.y - 58, 10, 22);
    ctx.fillStyle = greenV ? '#37c24a' : '#d9382b';
    ctx.beginPath();
    ctx.arc(l.x + 57, l.y - 52, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = greenV ? '#d9382b' : '#37c24a';
    ctx.beginPath();
    ctx.arc(l.x + 57, l.y - 42, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- Pier ----
  ctx.fillStyle = PALETTE.pier;
  ctx.fillRect(2980, SAND_SOUTH, 100, 2800 - SAND_SOUTH);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  for (let y = SAND_SOUTH + 14; y < 2800; y += 22) {
    ctx.beginPath();
    ctx.moveTo(2980, y);
    ctx.lineTo(3080, y);
    ctx.stroke();
  }

  // ---- Buildings ----
  for (const b of state.city.buildings) {
    if (b.x + b.w < vx - 60 || b.x > vx + VIEW_W + 60 || b.y + b.h < vy - 60 || b.y > vy + VIEW_H + 60) continue;
    // Drop shadow by height.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(b.x + b.height * 0.25, b.y + b.height * 0.25, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = PALETTE.buildingOutline;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    // Roof trim + skylight.
    ctx.fillStyle = b.trim;
    ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x + 12, b.y + 12, b.w - 24, b.h - 24);
    if (b.type === 'tower') {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(b.x + b.w / 2 - 8, b.y + b.h / 2 - 8, 16, 16);
    }
    // Lit windows at night.
    if (night) {
      ctx.fillStyle = '#ffd97a';
      const cols = Math.max(1, Math.floor(b.w / 26));
      const rows = Math.max(1, Math.floor(b.h / 26));
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          const lit = ((b.seed + i * 7 + j * 13) % 5) < 2;
          if (lit) ctx.fillRect(b.x + 10 + i * 26, b.y + 10 + j * 26, 12, 14);
        }
      }
    }
  }

  // ---- Props ----
  for (const pr of state.city.props) {
    if (pr.kind === 'hydrant') {
      ctx.fillStyle = '#c22a1a';
      ctx.fillRect(pr.x - 4, pr.y - 6, 8, 12);
      ctx.fillStyle = '#e8e8e8';
      ctx.fillRect(pr.x - 4, pr.y - 8, 8, 3);
    } else if (pr.kind === 'dumpster') {
      ctx.fillStyle = '#2a5a34';
      ctx.fillRect(pr.x - 14, pr.y - 9, 28, 18);
      ctx.strokeStyle = '#122';
      ctx.strokeRect(pr.x - 14, pr.y - 9, 28, 18);
    } else if (pr.kind === 'billboard') {
      ctx.fillStyle = '#222';
      ctx.fillRect(pr.x - 2, pr.y - 2, 64, 34);
      ctx.fillStyle = '#e8d44a';
      ctx.fillRect(pr.x, pr.y, 60, 30);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pr.text, pr.x + 30, pr.y + 19);
      ctx.textAlign = 'left';
    } else if (pr.kind === 'crane') {
      ctx.strokeStyle = '#e8a020';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(pr.x, pr.y + 40);
      ctx.lineTo(pr.x, pr.y - 90);
      ctx.lineTo(pr.x + 90, pr.y - 90);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pr.x + 90, pr.y - 90);
      ctx.lineTo(pr.x + 60, pr.y - 40);
      ctx.stroke();
    }
  }
  // Palms.
  for (const palm of state.city.palms) {
    if (palm.x < vx - 60 || palm.x > vx + VIEW_W + 60 || palm.y < vy - 60 || palm.y > vy + VIEW_H + 60) continue;
    const s = palm.s;
    ctx.strokeStyle = '#7a5230';
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 4 * s, palm.y - 26 * s);
    ctx.stroke();
    ctx.strokeStyle = '#2f8a3a';
    ctx.lineWidth = 3 * s;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.5;
      ctx.beginPath();
      ctx.moveTo(palm.x + 4 * s, palm.y - 26 * s);
      ctx.quadraticCurveTo(
        palm.x + 4 * s + Math.cos(a) * 16 * s, palm.y - 26 * s + Math.sin(a) * 10 * s,
        palm.x + 4 * s + Math.cos(a) * 26 * s, palm.y - 26 * s + Math.sin(a) * 18 * s,
      );
      ctx.stroke();
    }
  }

  // ---- Skid marks ----
  ctx.strokeStyle = 'rgba(10,10,10,0.4)';
  ctx.lineWidth = 4;
  for (const s of state.skids) {
    ctx.globalAlpha = Math.min(1, s.life / 2.5);
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + Math.cos(s.a) * 26, s.y + Math.sin(s.a) * 26);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- Hidden packages + pickups ----
  for (const pkg of state.city.packages) {
    if (pkg.taken) continue;
    const bob = Math.sin(state.time * 3 + pkg.x) * 3;
    ctx.fillStyle = '#ffd23c';
    ctx.fillRect(pkg.x - 9, pkg.y - 9 + bob, 18, 18);
    ctx.strokeStyle = '#8a6d00';
    ctx.lineWidth = 2;
    ctx.strokeRect(pkg.x - 9, pkg.y - 9 + bob, 18, 18);
    ctx.fillStyle = '#111';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('?', pkg.x, pkg.y + 4 + bob);
    ctx.textAlign = 'left';
  }
  for (const pk of state.pickups) {
    const bob = Math.sin(state.time * 4 + pk.x) * 2;
    ctx.fillStyle = pk.kind === 'health' ? '#37c24a' : pk.kind === 'smg' ? '#ff8c1a' : '#3d7ad9';
    ctx.beginPath();
    ctx.arc(pk.x, pk.y + bob, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.kind === 'health' ? '+' : pk.kind === 'smg' ? 'S' : 'A', pk.x, pk.y + 4 + bob);
    ctx.textAlign = 'left';
  }

  // ---- Waypoint marker ----
  const wp = state.waypoint;
  if (wp) {
    const pulse = 1 + Math.sin(state.time * 5) * 0.12;
    ctx.save();
    ctx.translate(wp.x, wp.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = wp.chase || wp.tail ? '#ff5a3c' : '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(0, -26);
    ctx.lineTo(16, -6);
    ctx.lineTo(0, 6);
    ctx.lineTo(-16, -6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(wp.chase ? '!' : '◆', 0, 2);
    ctx.textAlign = 'left';
    ctx.restore();
    // Ground ring.
    ctx.strokeStyle = 'rgba(255,210,60,0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(wp.x, wp.y + 8, 34 * pulse, 14 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Mission start marker.
  if (state.marker) {
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('M', state.marker.x, state.marker.y - 18 + Math.sin(state.time * 4) * 4);
    ctx.textAlign = 'left';
    ctx.strokeStyle = 'rgba(255,210,60,0.7)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(state.marker.x, state.marker.y + 6, 30, 13, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- Peds ----
  for (const ped of state.peds) {
    if (ped.x < vx - 40 || ped.x > vx + VIEW_W + 40 || ped.y < vy - 40 || ped.y > vy + VIEW_H + 40) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.color);
    if (ped.taxiFare) {
      ctx.fillStyle = '#37c24a';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', ped.x, ped.y - 22 + Math.sin(state.time * 5) * 3);
      ctx.textAlign = 'left';
    }
  }

  // ---- Cars ----
  for (const car of state.cars) {
    if (car.x < vx - 80 || car.x > vx + VIEW_W + 80 || car.y < vy - 80 || car.y > vy + VIEW_H + 80) continue;
    drawCarShape(ctx, car, night);
  }

  // ---- Enemies + cops ----
  for (const e of state.enemies) {
    drawPerson(ctx, e.x, e.y, e.angle, e.boss ? '#8a1a1a' : '#c23b2a', { armed: true, goon: true });
    if (e.boss) {
      ctx.fillStyle = '#111';
      ctx.fillRect(e.x - 22, e.y - 30, 44, 6);
      ctx.fillStyle = '#d9382b';
      ctx.fillRect(e.x - 22, e.y - 30, 44 * (e.hp / 320), 6);
    }
  }
  for (const cop of state.cops) {
    drawPerson(ctx, cop.x, cop.y, cop.angle, '#1d2f4a', { armed: true, cop: true });
  }

  // ---- Player ----
  if (!p.inCar) {
    const bob = p.moving ? Math.sin(state.time * 12) * 1.5 : 0;
    drawPerson(ctx, p.x, p.y + bob, p.angle, '#2f6fb8', { armed: p.weapon !== 'fists' });
    // Player ring so Rook is easy to spot in a crowd.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 17, 0, Math.PI * 2);
    ctx.stroke();
  }

  // ---- Bullets + muzzle + particles ----
  ctx.strokeStyle = '#ffe9a8';
  ctx.lineWidth = 3;
  for (const b of state.bullets) {
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  if (state.muzzle && state.muzzle.t > 0) {
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.arc(state.muzzle.x, state.muzzle.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(state.muzzle.x, state.muzzle.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const pt of state.particles) {
    const a = Math.max(0, pt.life / pt.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * (pt.kind === 'smoke' ? (1.6 - a * 0.6) : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // ---- Day / night tint ----
  if (dl < 1) {
    const dark = (1 - dl) * 0.5;
    ctx.fillStyle = `rgba(8, 10, 42, ${dark.toFixed(3)})`;
    ctx.fillRect(vx - 40, vy - 40, VIEW_W + 80, VIEW_H + 80);
  }
  // Warm dusk tint.
  if (dl > 0 && dl < 0.6 && state.clock >= 17 && state.clock < 20) {
    ctx.fillStyle = 'rgba(255,120,40,0.08)';
    ctx.fillRect(vx - 40, vy - 40, VIEW_W + 80, VIEW_H + 80);
  }

  // ---- Headlight cones (additive, after the tint) ----
  if (night) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const lights = [];
    if (p.inCar) lights.push(p.inCar);
    for (const c of state.cars) {
      if (c.driver === 'police' || c.driver === 'traffic') lights.push(c);
    }
    for (const car of lights) {
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const grad = ctx.createRadialGradient(
        car.x + fx * 30, car.y + fy * 30, 10,
        car.x + fx * 30, car.y + fy * 30, 190,
      );
      grad.addColorStop(0, 'rgba(255,230,150,0.20)');
      grad.addColorStop(1, 'rgba(255,230,150,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(car.x + fx * 20, car.y + fy * 20);
      ctx.arc(car.x + fx * 30, car.y + fy * 30, 190, car.angle - 0.42, car.angle + 0.42);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.restore();

  // District label, bottom-centre of the world view (subtle).
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(districtAt(p.x, p.y).toUpperCase() + '  ·  SOLMAR', VIEW_W / 2, VIEW_H - 14);
  ctx.textAlign = 'left';
  ctx.restore();
}
