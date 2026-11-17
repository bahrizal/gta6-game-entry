// HUD: health, cash, wanted stars, weapon, clock, objective banner,
// speedometer, minimap, briefing cards and prompts. Panels are 0.92 opaque
// so map labels never show through the chrome.
import { VIEW_H, VIEW_W, WORLD_H, WORLD_W } from './config.js';
import { districtAt } from './city.js';
import { waypoint } from './missions.js';

const PANEL = 'rgba(12, 16, 22, 0.92)';

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = PANEL;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function fmtClock(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours % 1) * 60);
  const hh = String(h).padStart(2, '0');
  const mm = String(m).padStart(2, '0');
  const day = Math.floor(hours / 24) + 1;
  return `Day ${day} ${hh}:${mm}`;
}

export function drawHUD(ctx, state) {
  const p = state.player;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // Top-left: health + cash.
  panel(ctx, 12, 12, 250, 64);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('ROOK CALLOWAY', 24, 32);
  ctx.fillStyle = '#222';
  ctx.fillRect(24, 40, 180, 12);
  const hpFrac = Math.max(0, p.hp / 100);
  ctx.fillStyle = hpFrac > 0.5 ? '#37c24a' : hpFrac > 0.25 ? '#e8a020' : '#d9382b';
  ctx.fillRect(24, 40, 180 * hpFrac, 12);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillText(`$${p.cash.toLocaleString('en-US')}`, 212, 52);

  // Top-centre: wanted stars (flashing at 3+).
  const stars = state.wanted.stars;
  panel(ctx, VIEW_W / 2 - 90, 12, 180, 40);
  ctx.font = '22px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let i = 0; i < 5; i++) {
    const on = i < stars;
    const flash = stars >= 3 && Math.floor(state.time * 4) % 2 === 0;
    ctx.fillStyle = on ? (flash ? '#ff5a3c' : '#ffd23c') : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', VIEW_W / 2 - 64 + i * 32, 40);
  }
  ctx.textAlign = 'left';

  // Top-centre below stars: clock + district.
  panel(ctx, VIEW_W / 2 - 110, 58, 220, 30);
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const district = districtAt(p.x, p.y);
  const night = state.clock < 6 || state.clock >= 20;
  ctx.fillText(`${fmtClock(state.clock)}  ${night ? '☾' : '☀'}  ${district.toUpperCase()}`, VIEW_W / 2, 78);
  ctx.textAlign = 'left';

  // Objective banner under the clock.
  const obj = state.objective;
  if (obj) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    const w = Math.min(560, ctx.measureText(obj).width + 32);
    panel(ctx, VIEW_W / 2 - w / 2, 94, w, 32);
    ctx.fillStyle = '#ffd23c';
    ctx.textAlign = 'center';
    ctx.fillText(obj, VIEW_W / 2, 115);
    ctx.textAlign = 'left';
  }

  // Bottom-left: weapon + ammo.
  panel(ctx, 12, VIEW_H - 64, 210, 52);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  const wname = p.weapon === 'fists' ? 'Fists' : p.weapon === 'pistol' ? 'Pistol' : 'SMG';
  ctx.fillText(wname, 24, VIEW_H - 38);
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = '#c8c8c8';
  if (p.weapon === 'fists') ctx.fillText('Space to punch', 24, VIEW_H - 20);
  else ctx.fillText(`${p.mag[p.weapon]} / ${p.ammo[p.weapon]}  —  R reload`, 24, VIEW_H - 20);

  // Bottom-right: speedometer while driving.
  if (p.inCar) {
    panel(ctx, VIEW_W - 172, VIEW_H - 64, 160, 52);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'right';
    const mph = Math.round(Math.abs(p.inCar.speed) * 0.09);
    ctx.fillText(`${mph}`, VIEW_W - 56, VIEW_H - 30);
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = '#c8c8c8';
    ctx.fillText('MPH', VIEW_W - 24, VIEW_H - 30);
    ctx.textAlign = 'left';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillStyle = p.inCar.health < 45 ? '#ff5a3c' : '#c8c8c8';
    ctx.fillText(p.inCar.label, VIEW_W - 160, VIEW_H - 20);
  }

  // Minimap (top-right), north-up, whole city.
  drawMinimap(ctx, state);

  // Context prompt, bottom-centre.
  if (state.prompt) {
    ctx.font = 'bold 14px system-ui, sans-serif';
    const w = ctx.measureText(state.prompt).width + 28;
    panel(ctx, VIEW_W / 2 - w / 2, VIEW_H - 108, w, 30);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(state.prompt, VIEW_W / 2, VIEW_H - 88);
    ctx.textAlign = 'left';
  }

  // Flash message (pickups, mission results).
  if (state.hudFlash && state.hudFlash.t > 0) {
    ctx.font = 'bold 16px system-ui, sans-serif';
    const w = ctx.measureText(state.hudFlash.text).width + 28;
    ctx.globalAlpha = Math.min(1, state.hudFlash.t);
    panel(ctx, VIEW_W / 2 - w / 2, 140, w, 32);
    ctx.fillStyle = '#7dff8a';
    ctx.textAlign = 'center';
    ctx.fillText(state.hudFlash.text, VIEW_W / 2, 161);
    ctx.textAlign = 'left';
    ctx.globalAlpha = 1;
  }

  // Mission briefing card (world frozen while it shows).
  if (state.mission.briefingT > 0 && state.mission.active) {
    const m = state.mission;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
    panel(ctx, VIEW_W / 2 - 300, VIEW_H / 2 - 110, 600, 220);
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`MISSION ${m.idx + 1} OF 8`, VIEW_W / 2, VIEW_H / 2 - 74);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui, sans-serif';
    const mission = state.missions[m.idx];
    ctx.fillText(mission.title, VIEW_W / 2, VIEW_H / 2 - 36);
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillStyle = '#d8d8d8';
    wrapText(ctx, mission.brief, VIEW_W / 2, VIEW_H / 2 - 8, 540, 22);
    ctx.fillStyle = '#ffd23c';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(`Reward  $${mission.reward.toLocaleString('en-US')}`, VIEW_W / 2, VIEW_H / 2 + 78);
    ctx.textAlign = 'left';
  }

  // Damage vignette.
  if (p.hurtT > 0) {
    ctx.fillStyle = `rgba(200, 20, 20, ${Math.min(0.35, p.hurtT * 0.5)})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  ctx.restore();
}

function wrapText(ctx, text, cx, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, cx, yy);
      line = word;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, yy);
}

export function drawMinimap(ctx, state) {
  const MW = 220;
  const MH = 164;
  const X = VIEW_W - MW - 12;
  const Y = 12;
  const sx = MW / WORLD_W;
  const sy = MH / WORLD_H;
  panel(ctx, X, Y, MW, MH);
  ctx.save();
  ctx.beginPath();
  ctx.rect(X + 2, Y + 2, MW - 4, MH - 4);
  ctx.clip();
  // Water + sand.
  ctx.fillStyle = '#155a75';
  ctx.fillRect(X, Y, MW, MH);
  ctx.fillStyle = '#8a7a52';
  ctx.fillRect(X + 3480 * sx, Y, (WORLD_W - 3480) * sx, MH);
  ctx.fillRect(X, Y + 2560 * sy, MW, (WORLD_H - 2560) * sy);
  // Land.
  ctx.fillStyle = '#3d4a38';
  ctx.fillRect(X, Y, 3480 * sx, 2560 * sy);
  // Roads.
  ctx.strokeStyle = '#9a9c8e';
  ctx.lineWidth = 3;
  for (const rx of [480, 1200, 1920, 2640, 3360]) {
    ctx.beginPath();
    ctx.moveTo(X + rx * sx, Y + 240 * sy);
    ctx.lineTo(X + rx * sx, Y + 2560 * sy);
    ctx.stroke();
  }
  for (const ry of [480, 1200, 1920, 2400]) {
    ctx.beginPath();
    ctx.moveTo(X + 240 * sx, Y + ry * sy);
    ctx.lineTo(X + 3480 * sx, Y + ry * sy);
    ctx.stroke();
  }
  const dot = (x, y, color, r) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(X + x * sx, Y + y * sy, r, 0, Math.PI * 2);
    ctx.fill();
  };
  // Hidden packages.
  for (const pkg of state.city.packages) {
    if (!pkg.taken) dot(pkg.x, pkg.y, '#ffd23c', 2);
  }
  // Cars and peds.
  for (const c of state.cars) {
    if (c.driver === 'police') continue;
    dot(c.x, c.y, 'rgba(220,220,220,0.7)', 2);
  }
  for (const ped of state.peds) dot(ped.x, ped.y, 'rgba(255,255,255,0.45)', 1.5);
  // Taxi fare.
  if (state.taxi.active && state.taxi.phase === 'pickup' && state.taxi.ped) {
    dot(state.taxi.ped.x, state.taxi.ped.y, '#37c24a', 3.5);
  }
  // Cops flash blue/red.
  const flashBlue = Math.floor(state.time * 3) % 2 === 0;
  for (const c of state.cars) {
    if (c.driver === 'police') dot(c.x, c.y, flashBlue ? '#3d7ad9' : '#d9382b', 3);
  }
  for (const cop of state.cops) dot(cop.x, cop.y, flashBlue ? '#3d7ad9' : '#d9382b', 3);
  // Enemies.
  for (const e of state.enemies) dot(e.x, e.y, '#ff4040', 3);
  // Waypoint / mission marker: gold diamond.
  const wp = waypoint(state);
  if (wp) {
    const wx = X + wp.x * sx;
    const wy = Y + wp.y * sy;
    const pulse = 6 + Math.sin(state.time * 5) * 2;
    ctx.fillStyle = '#ffd23c';
    ctx.beginPath();
    ctx.moveTo(wx, wy - pulse);
    ctx.lineTo(wx + pulse, wy);
    ctx.lineTo(wx, wy + pulse);
    ctx.lineTo(wx - pulse, wy);
    ctx.closePath();
    ctx.fill();
  }
  // Player: white triangle.
  const p = state.player;
  ctx.fillStyle = '#fff';
  ctx.save();
  ctx.translate(X + p.x * sx, Y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4, -4);
  ctx.lineTo(-4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.strokeRect(X, Y, MW, MH);
}
