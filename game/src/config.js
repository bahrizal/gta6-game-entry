// Solmar Heat — tuning, palette, world constants and key bindings.
// Everything here is original: the city of Solmar, its districts and its people
// belong to this game alone.
export const WORLD = {
  W: 3840,
  H: 2880,
  ROAD_W: 132,
  ROADS_X: [480, 1200, 1920, 2640, 3360],
  ROADS_Y: [480, 1200, 1920, 2400],
  // Water hugs the south and east edges; the beach strip sits just north of it.
  WATER_Y: 2640,
  WATER_X: 3600,
  BEACH_Y: 2520,
};

export const DISTRICTS = {
  HARBOR: { name: 'Harbor', x0: 0, x1: 1200, tint: '#5a6b7a' },
  DOWNTOWN: { name: 'Downtown', x0: 1200, x1: 2640, tint: '#7a6a55' },
  PALMS: { name: 'Palms', x0: 2640, x1: 3840, tint: '#c98f4e' },
};

export const PALETTE = {
  grass: '#4d8a4a',
  grassDark: '#437c40',
  sidewalk: '#b9b3a4',
  road: '#33363d',
  roadEdge: '#22242a',
  lane: '#e8d44d',
  sand: '#e0c078',
  water: '#1f6fb2',
  waterDeep: '#155a94',
  plaza: '#9a938a',
  dock: '#6b5d4f',
};

export const CAR_MODELS = {
  sedan: { name: 'Sedan', top: 330, accel: 210, brake: 420, grip: 2.6, hp: 100, len: 44, wid: 22, colors: ['#c23b2e', '#2e6fc2', '#d8d8d8', '#3a3f46'] },
  taxi: { name: 'Taxi', top: 320, accel: 200, brake: 420, grip: 2.6, hp: 100, len: 44, wid: 22, colors: ['#f2b705'] },
  coupe: { name: 'Coupe', top: 400, accel: 260, brake: 460, grip: 3.1, hp: 80, len: 42, wid: 20, colors: ['#8e2f8f', '#e05a1f', '#1fbf8f'] },
  pickup: { name: 'Pickup', top: 300, accel: 180, brake: 380, grip: 2.3, hp: 130, len: 48, wid: 23, colors: ['#5a7a3a', '#7a4a2a'] },
  van: { name: 'Van', top: 270, accel: 150, brake: 360, grip: 2.0, hp: 150, len: 52, wid: 24, colors: ['#d8d2c4', '#4a6a8a'] },
  cruiser: { name: 'Cruiser', top: 380, accel: 250, brake: 480, grip: 3.0, hp: 120, len: 46, wid: 22, colors: ['#1a1d24'] },
};

export const WEAPONS = {
  fists: { name: 'Fists', damage: 12, rate: 0.35, range: 46, speed: 0, auto: false, melee: true, ammo: Infinity },
  pistol: { name: 'Pistol', damage: 22, rate: 0.28, range: 420, speed: 900, auto: false, spread: 0.03, ammo: 'pistol' },
  smg: { name: 'SMG', damage: 14, rate: 0.09, range: 360, speed: 1000, auto: true, spread: 0.09, ammo: 'smg' },
};

export const TUNING = {
  playerWalk: 205,
  playerSprint: 330,
  playerHp: 100,
  pedSpeed: 55,
  pedFleeSpeed: 190,
  trafficSpeed: 150,
  copFootSpeed: 235,
  copCruiserSpeed: 360,
  wantedDecay: 1.6,
  heatPerCarTheft: 14,
  heatPerPedHit: 18,
  heatPerShot: 0.8,
  heatPerCopKill: 30,
  heatPerKill: 12,
  bustedTime: 1.6,
  dayLength: 480, // seconds of play per full day/night cycle
  startClock: 8 * 3600 + 20 * 60, // 08:20 in the morning
  duskClock: 18 * 3600 + 30 * 60,
  nightClock: 20 * 3600,
  dawnClock: 6 * 3600,
};

export const KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  punch: ['Space'],
  enterCar: ['KeyE'],
  reload: ['KeyR'],
  pause: ['KeyP', 'Escape'],
  mute: ['KeyM'],
  taxi: ['KeyT'],
  weapon1: ['Digit1'],
  weapon2: ['Digit2'],
  weapon3: ['Digit3'],
};

export const MISSION_REWARDS = [300, 500, 800, 1000, 1200, 1500, 2500, 5000];
