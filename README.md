# Tabletop Tanks

A toy-diorama tank battler in three.js, modeled on Wii Play's *Tanks!*. Fight through 100 missions against nine kinds of enemy tank, bank shots off the walls, lay mines, and blow up cork blocks. A marching band plays along, adding one instrument for each enemy colour on the board.

## Couch co-op

Click **Co-op** on the title screen. The screen you're on becomes the TV and shows a QR code. Scan it with one or two phones, and each phone becomes a controller:

- **Left stick:** drive
- **Right stick:** drag to aim, let go to fire
- **Mine:** lay a mine

With one phone, player 1 plays on the keyboard and mouse. The phones only need internet access, not the same Wi-Fi.

## Controls (keyboard and mouse)

| Action | Input |
| --- | --- |
| Move | W A S D / arrow keys |
| Aim | Mouse |
| Fire | Left click |
| Lay a mine | Right click / Space |
| Pause | P / Esc |

## Running it

```bash
npm install
npm start
```

Then open http://localhost:3000. `server.js` serves the game and relays the co-op rooms over WebSocket at `/ws`.

### Deploying on Render

Create a **Web Service** from this repo with:

- **Build command:** `npm install`
- **Start command:** `npm start`

Render sets `PORT` for you.

## Project layout

- `index.html`: the built game, a single file.
- `server.js`: the static server and WebSocket room relay.
- `src/`: the game sources.
  - `core.js`: renderer, models, audio.
  - `game.js`: shells, mines, AI.
  - `ui.js`: flow and input.
  - `net.js` and `coop.js`: co-op rooms.
  - `pad.js`: the phone controller.
  - `data.js`: the 100 missions.

  After editing anything in `src/`, run `npm run build` to rebuild `index.html`.
