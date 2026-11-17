# Solmar Heat

An original open-world crime game for the make.fun gta6-01 competition.
Top-down 2D on Canvas, vanilla JS, no libraries, no network — everything
is drawn and synthesised in the browser.

## The game

Rae "Rook" Calloway is back in Solmar, a sun-soaked coastal city in the
fictional state of Alderra, in debt to the fixer Marlowe. Three districts
(Harbor, Downtown, Palms) on one connected road grid, a beach and a pier,
day/night cycle, traffic and pedestrians, cars to steal and drive, a
0–5 star wanted system with police on foot and in cruisers, combat
(fists, pistol, SMG), 8 story missions in three acts, taxi fares, 10
hidden packages, and a save system.

## How to play

Serve `game/` with any static server (`node serve.ts`, then
http://localhost:8080) and open `game/index.html`.

- **WASD / arrows** move, **Shift** sprint, **Space** punch
- **Mouse** aim, **click** shoot (hold for SMG)
- **E** enter / steal a car, **E** again to get out
- **1 / 2 / 3** switch weapon, **R** reload
- **Enter** start the next mission, **P / Esc** pause, **M** mute

## Files

- `main.ts` — entrypoint: copies `game/` + `screenshots/` to `/output`
  and writes `dossier.json` via `vendor/makefun-game.ts`
- `game/src/` — one module per system: `config`, `random`, `input`,
  `audio`, `city`, `entities`, `combat`, `missions`, `hud`, `render`,
  `shots`, `main`
- `screenshots/` — 4 real renders of the game's own code

Everything is original: the city, characters, story, art and music were
made for this game. Nothing is copied from any commercial title.
