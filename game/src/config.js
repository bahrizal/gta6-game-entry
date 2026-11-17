// Solmar Heat — tuning numbers, palette, world layout and vehicle/weapon tables.
// Everything here is original; the city, names and numbers are invented for this game.
export const WORLD_W = 3840;
export const WORLD_H = 2880;
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const STEP = 1 / 60;
export const SAVE_KEY = 'solmarheat-save-v1';

// Road grid: vertical and horizontal road centre lines, road width in world units.
export const V_ROADS = [480, 1200, 1920, 2640, 3360];
export const H_ROADS = [480, 1200, 1920, 2400];
export const ROAD_W = 96;

// Water hugs the south and east edges; sand sits between the beach road and the water.
export const WATER_EAST = 3600;
export const WATER_SOUTH = 2700;
export const SAND_EAST = 3480;
export const SAND_SOUTH = 2560;

export const PALETTE = {
  ground: '#55604f',
  block: '#616d58',
  sidewalk: '#9a9c8e',
  road: '#33373b',
  roadEdge: '#c8c9bd',
  dash: '#e8c33c',
  sand: '#d9c08a',
  water: '#1d6d8c',
  waterDeep: '#155a75',
  pier: '#8a6b46',
  buildingOutline: '#20242a',
  grass: '#4d7a44',
};

// Five drivable models, each with its own feel.
export const CAR_MODELS = {
  sedan: { label: 'Sedan', maxSpeed: 430, accel: 270, reverse: 160, handling: 2.7, grip: 5.5, color: '#b8452f', roof: '#8e3423', len: 52, wid: 26 },
  taxi: { label: 'Taxi', maxSpeed: 410, accel: 260, reverse: 160, handling: 2.8, grip: 5.5, color: '#e8b820', roof: '#c99a12', len: 52, wid: 26 },
  coupe: { label: 'Coupe', maxSpeed: 540, accel: 330, reverse: 180, handling: 3.4, grip: 6.5, color: '#2f6fb8', roof: '#1f4d84', len: 50, wid: 24 },
  pickup: { label: 'Pickup', maxSpeed: 460, accel: 290, reverse: 170, handling: 2.5, grip: 5.0, color: '#5d7a3a', roof: '#465e2b', len: 56, wid: 27 },
  van: { label: 'Van', maxSpeed: 360, accel: 220, reverse: 140, handling: 2.1, grip: 4.5, color: '#7a7f85', roof: '#5b6065', len: 60, wid: 28 },
  cruiser: { label: 'Cruiser', maxSpeed: 500, accel: 320, reverse: 180, handling: 3.1, grip: 6.0, color: '#1d2f4a', roof: '#12203a', len: 54, wid: 26 },
};

// Weapons: fists are free, guns need ammo. Damage is per hit.
export const WEAPONS = {
  fists: { label: 'Fists', damage: 22, rate: 0.38, range: 64, speed: 0, mag: Infinity, auto: false, spread: 0 },
  pistol: { label: 'Pistol', damage: 26, rate: 0.30, range: 560, speed: 980, mag: 12, auto: false, spread: 0.018 },
  smg: { label: 'SMG', damage: 13, rate: 0.085, range: 480, speed: 1050, mag: 32, auto: true, spread: 0.055 },
};

export const WANTED_MAX_HEAT = 100;
export const HEAT_PER_STAR = 20;
// While a story mission is running the heat never climbs past 3 stars.
export const MISSION_HEAT_CAP = 45;

export const PLAYER_WALK = 230;
export const PLAYER_SPRINT = 350;
export const PLAYER_HP = 100;

export const MISSION_MARKER = { x: 1920, y: 480 };
export const HOSPITAL = { x: 1200, y: 1920 };
export const POLICE_STATION = { x: 1200, y: 480 };
