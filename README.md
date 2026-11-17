[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bahrizal/gta6-game-entry/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bahrizal/gta6-game-entry/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Solmar Heat

An original open-world crime game for the make.fun "Make GTA 6" competition.
Top-down 2D on canvas, vanilla JavaScript, no libraries, no network — the whole
game is static files under `game/`.

## The game

Rae "Rook" Calloway, ex-wheelman, is back in **Solmar** — a sun-soaked coastal
city in the fictional state of Alderra — and in debt to the fixer Marlowe.
Three districts on one road grid: the **Harbor** docks, **Downtown** towers and
the **Palms** beachfront, with water along the south and east edges and a pier
reaching into it.

- **Explore on foot and by car** — 5 car models (sedan, taxi, coupe, pickup,
  van), arcade driving with drift and damage, traffic that follows the lanes
  and pedestrians who walk the sidewalks and flee gunfire.
- **Steal cars** — walk up, press E; the driver bails and runs, and the heat
  goes up.
- **Wanted 0–5 stars** — cops chase on foot and in cruisers, roadblocks of
  attention at 3 stars; get busted on foot or wasted at 0 health and you wake
  up at the police station or hospital, lighter in the pocket.
- **8 story missions in three acts** — car theft tutorial, a downtown pickup,
  a docks shootout, a timed getaway at 3 stars, tailing an informant,
  a boardwalk brawl, a bank holdout and a finale chase against the Harbor
  Kings' boss. Briefing cards, waypoints, fail/retry, cash rewards.
- **Side work** — taxi fares while driving, 10 hidden packages worth $250 each.
- **Combat** — fists, pistol, SMG; enemy crew AI that advances, strafes and
  flees at low health; ammo and health pickups.
- **HUD + minimap** — health, cash, flashing wanted stars, weapon and ammo,
  day/night clock, objective banner, speedometer, minimap with mission, cop,
  car and ped blips.
- **Day/night cycle** — dusk tints, lit windows, headlights and a WebAudio
  synth soundtrack (bassline + hats) with gunshots, sirens and engine hum.
- **Start + save** — title screen (New Game / Continue / How to Play), pause
  menu, progress saved to localStorage, M mutes.

## Controls

WASD / arrows move · Shift sprint · mouse aim · click shoot · Space punch ·
E enter / steal / exit car · R reload · 1/2/3 weapons · P pause · M mute.

## Run it

```
node serve.ts        # then open http://localhost:8080
```

Or serve `game/` with any static file server and open `index.html`.

## Build the entry

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` copies `game/` and `screenshots/` to the output directory and
writes `dossier.json` with the vendored make.fun library.

## License

MIT — see `LICENSE`. An original game, not affiliated with any commercial
game series.
