# Tabletop Tanks

A toy-diorama tank battler in three.js, modeled on Wii Play's *Tanks!*. Fight through 100 missions against nine kinds of enemy tank, bank shots off the walls, lay mines, and blow up cork blocks. A marching band plays along, adding one instrument for each enemy colour on the board.

## Couch co-op

Click **Co-op**, **Versus** or **Duel** on the title screen. The screen you're on becomes the TV and shows a QR code. Scan it with one or two phones, and each phone becomes a controller:

- **Left stick:** drive
- **Right stick:** drag to aim, let go to fire
- **Mine:** lay a mine

With one phone, player 1 plays on the keyboard and mouse. The phones only need internet access, not the same Wi-Fi.

## Versus

Versus follows the Wii's 2-player rules. Both players fight through missions 1–20 side by side. Every enemy tank you destroy is a point for you, and the higher score after mission 20 wins. Shells and mines hurt your rival too. There are no lives: a destroyed player sits out until the next mission, and the game ends if both tanks go down in the same mission.

## Duel

A 1-on-1 fight with no enemy tanks. Both players have the same shells and mines as the campaign: five shells out at once, one bounce each, and two mines. Destroy your rival to take the round. First to five rounds wins, and each round moves to a new arena taken from the campaign maps. If both tanks go down together, the round is a draw.

## Controls (keyboard and mouse)

| Action | Input |
| --- | --- |
| Move | W A S D / arrow keys |
| Aim | Mouse |
| Fire | Left click |
| Lay a mine | Right click / Space |
| Pause | P / Esc |

## Controls (Switch Pro Controller or any gamepad)

Connect a Nintendo Switch Pro Controller (USB or Bluetooth) and press a button so the browser sees it. Xbox and PlayStation controllers work too, with confirm and back on their usual buttons.

| Action | Pro Controller |
| --- | --- |
| Move | Left stick / D-pad |
| Aim | Right stick |
| Fire | ZR / R / A |
| Lay a mine | ZL / L / B |
| Pause / resume | + |
| Menus | Stick or D-pad to move, A to pick, B to go back |

With no seat taken, a controller plays player 1 alongside the keyboard and mouse. In the **Co-op**, **Versus** and **Duel** lobbies, press A on a controller to take a seat, the same way a phone does by scanning the code. Two controllers fill both seats and start the game, no phones needed. Controllers rumble when you fire and when your tank is destroyed (Chrome and Edge).

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
  - `gamepad.js`: Pro Controller and other gamepads.
  - `data.js`: the 100 missions.

  After editing anything in `src/`, run `npm run build` to rebuild `index.html`.
