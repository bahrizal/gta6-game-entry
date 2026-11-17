// HUD: health, cash, wanted stars, weapon, clock, objective banner,
// speedometer and the minimap.
import { WORLD, PALETTE } from './config.js';
import { fmtCash, fmtClock, clamp } from './random.js';
import { objectiveText } from './missions.js';
import { wantedStars } from './entities.js';

function star(ctx, x, y, r, filled, flashing) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = filled ? (flashing ? '#ff4444' : '#ffd24d') : 'rgba(0,0,0,0.45)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

export function drawHUD(ctx, G) {
  const p = G.player;
  const stars = wantedStars(G.heat);
  const flashing = stars > 0 && Math.floor(G.time * 2) % 2 === 0;

  // Top-left: health + cash.
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 12, 12, 250, 64, 10);
  ctx.fill();
  // Health bar.
  ctx.fillStyle = '#222';
  ctx.fillRect(24, 24, 150, 14);
  ctx.fillStyle = p.hp > 50 ? '#3ec94a' : p.hp > 25 ? '#e8a13a' : '#e03a3a';
  ctx.fillRect(24, 24, 150 * clamp(p.hp / p.maxHp, 0, 1), 14);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.strokeRect(24, 24, 150, 14);
  ctx.fillStyle = '#fff';
  ctx.fillText('HP ' + Math.ceil(p.hp), 182, 31);
  ctx.fillStyle = '#7dff8a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(fmtCash(p.cash), 24, 60);
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Packages ' + G.packagesCollected + '/10', 150, 60);

  // Wanted stars, top-centre-left.
  for (let i = 0; i < 5; i++) {
    star(ctx, 300 + i * 30, 34, 12, i < stars, flashing);
  }

  // Top-right: clock + district.
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 1010, 12, 258, 44, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText(fmtClock(G.clock), 1256, 28);
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillStyle = '#ffd24d';
  const district = p.x < 1200 ? 'Harbor' : p.x < 2640 ? 'Downtown' : 'Palms';
  ctx.fillText('Solmar — ' + district, 1256, 48);

  // Objective banner.
  const obj = objectiveText(G);
  if (obj) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px system-ui, sans-serif';
    const w = ctx.measureText(obj).width + 36;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    roundRect(ctx, 640 - w / 2, 70, w, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd24d';
    ctx.fillText(obj, 640, 88);
  }

  // Bottom-left: weapon + ammo, or speedometer while driving.
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(ctx, 12, 648, 220, 60, 10);
  ctx.fill();
  const wname = p.weapon === 'fists' ? 'Fists' : p.weapon === 'pistol' ? 'Pistol' : 'SMG';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.fillText(wname, 24, 668);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#cfe8ff';
  if (p.weapon === 'fists') ctx.fillText('Space to punch · E to enter car', 24, 692);
  else ctx.fillText('Ammo ' + (p.ammo[p.weapon] ?? 0) + ' · R reload · 1/2/3 switch', 24, 692);
  if (p.inCar) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, 244, 648, 130, 60, 10);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px system-ui, sans-serif';
    ctx.fillText(Math.round(Math.abs(p.speed) * 0.36) + ' km/h', 256, 672);
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillStyle = '#ff9a9a';
    ctx.fillText('Car HP ' + Math.max(0, Math.ceil(p.inCar.hp)), 256, 694);
  }

  // Toast message.
  if (G.messageTimer > 0 && G.message) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px system-ui, sans-serif';
    const w = ctx.measureText(G.message).width + 30;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, 640 - w / 2, 620, w, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(G.message, 640, 637);
  }

  // Mission intro card.
  if (G.missionCard && G.missionCard.timer > 0) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    roundRect(ctx, 340, 200, 600, 190, 14);
    ctx.fill();
    ctx.strokeStyle = '#ffd24d';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffd24d';
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.fillText(G.missionCard.act.toUpperCase(), 640, 232);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillText(G.missionCard.title, 640, 272);
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillStyle = '#d8d8d8';
    wrapText(ctx, G.missionCard.text, 640, 306, 540, 22);
    ctx.restore();
  }

  // Damage vignette.
  if (p.hurtFlash > 0) {
    ctx.fillStyle = 'rgba(220,30,30,' + (p.hurtFlash * 0.5) + ')';
    ctx.fillRect(0, 0, 1280, 720);
  }
  // Busted warning when a cop is about to grab the player.
  if (p.bustedTimer > 0.4 && !p.inCar) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('BREAK FREE — A COP HAS YOU!', 640, 150);
  }

  drawMinimap(ctx, G);
  ctx.restore();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = w;
      yy += lineH;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, yy);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawMinimap(ctx, G) {
  const MW = 220;
  const MH = 160;
  const X = 1280 - MW - 12;
  const Y = 720 - MH - 12;
  const sx = MW / WORLD.W;
  const sy = MH / WORLD.H;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  roundRect(ctx, X - 4, Y - 4, MW + 8, MH + 8, 8);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(X, Y, MW, MH);
  ctx.clip();
  // Water + beach.
  ctx.fillStyle = '#155a94';
  ctx.fillRect(X, Y, MW, MH);
  ctx.fillStyle = '#4d8a4a';
  ctx.fillRect(X, Y, WORLD.WATER_X * sx, WORLD.BEACH_Y * sy);
  ctx.fillStyle = '#e0c078';
  ctx.fillRect(X, Y + WORLD.BEACH_Y * sy, WORLD.WATER_X * sx, (WORLD.WATER_Y - WORLD.BEACH_Y) * sy);
  // Roads.
  ctx.fillStyle = '#33363d';
  for (const rx of WORLD.ROADS_X) ctx.fillRect(X + (rx - 66) * sx, Y, 132 * sx, MH);
  for (const ry of WORLD.ROADS_Y) ctx.fillRect(X, Y + (ry - 66) * sy, MW, 132 * sy);
  // Buildings.
  ctx.fillStyle = '#555a63';
  for (const b of G.city.buildings) {
    ctx.fillRect(X + (b.x - b.w / 2) * sx, Y + (b.y - b.h / 2) * sy, b.w * sx, b.h * sy);
  }
  // Pickups (packages) as white dots.
  ctx.fillStyle = '#fff';
  for (const pk of G.pickups) {
    if (pk.kind === 'package' && !pk.story) ctx.fillRect(X + pk.x * sx - 1, Y + pk.y * sy - 1, 3, 3);
  }
  // Waypoint.
  if (G.waypoint) {
    const pulse = 3 + Math.sin(G.time * 5) * 1.5;
    ctx.fillStyle = '#ffd24d';
    ctx.beginPath();
    ctx.arc(X + G.waypoint.x * sx, Y + G.waypoint.y * sy, pulse, 0, Math.PI * 2);
    ctx.fill();
  }
  // Cars, peds, enemies, cops.
  ctx.fillStyle = '#bbbbbb';
  for (const c of G.cars) ctx.fillRect(X + c.x * sx - 1.5, Y + c.y * sy - 1.5, 3, 3);
  ctx.fillStyle = '#e8e8e8';
  for (const pd of G.peds) {
    if (!pd.dead) ctx.fillRect(X + pd.x * sx - 1, Y + pd.y * sy - 1, 2, 2);
  }
  ctx.fillStyle = '#ff4444';
  for (const e of G.enemies) {
    if (e.hp > 0) ctx.fillRect(X + e.x * sx - 1.5, Y + e.y * sy - 1.5, 3, 3);
  }
  const flash = Math.floor(G.time * 3) % 2 === 0;
  ctx.fillStyle = flash ? '#4488ff' : '#ff4444';
  for (const c of G.cops) ctx.fillRect(X + c.x * sx - 2, Y + c.y * sy - 2, 4, 4);
  // Player arrow.
  const p = G.player;
  ctx.save();
  ctx.translate(X + p.x * sx, Y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  // Border + label.
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(X - 4, Y - 4, MW + 8, MH + 8);
}
