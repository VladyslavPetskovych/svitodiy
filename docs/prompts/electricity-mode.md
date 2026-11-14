# Prompt: electricity mode (underground cables and power networks)

> Paste everything below the line into Claude Code from the repo root.

---

## Goal

Add an **electricity mode** to the island sandbox (build mode in `IslandWalk`). In this mode the
player can lay **cables** and connect electricity devices (windmills now, more later). Only
electricity devices and cables are highlighted; everything else is dimmed and cannot be picked.

Cables are **underground**. In normal play (walk mode and the regular build mode) cables are never
drawn. They become visible only in electricity mode, as a ghosted trench/glow along the ground, so
the player can see where the wires run. Cables are data first and art second: the server stores
them, and the client draws them only when the mode is on.

This is a sandbox feature. It does not change how walking, farming, gathering or dogs work.

## Read first (current state)

- **Build mode:** `miniapp/src/game/screens/IslandWalk.jsx`. Sandbox state is `build`, `cat`,
  `pick`, `ghost`, `sel`. Categories are in `CATS` (already has `{ value: 'power', label: '⚡ Електрика' }`)
  and `CATS_HOME`. Entering build mode calls `engine.current?.setMode('build')`. The HUD buttons
  are `HudButton`s around line 931.
- **Engine:** `miniapp/src/game/walk/engine.js`. `setMode(m)` is around line 2296. Build-mode
  input is in the `mode === 'build'` branches (about lines 1762, 1844, 1872, 2040). The grid is drawn
  by `drawGrid()` and `gridMesh.visible = mode === 'build'` (about line 2188). Ghost placement and
  selection rendering are around line 2190–2230.
- **Grid helpers:** `miniapp/src/game/walk/grid.js` and `layout.js` (`CELL`, scene map sizes).
- **Power today:** `server/src/game/power.js` `powerOf(deco)` sums `watts` of every generator on
  the island. Only windmills (`decor.js` `DECOR`, `watts: 40`) produce power. The result goes to
  `state.power` (`server/src/game/state.js`) and is shown in `IslandWalk.jsx` (about lines 196–197, 935, 946).
- **Items:** `bare_wire` already exists (`server/src/game/craft.js`, `miniapp/src/game/data.js`,
  `miniapp/scripts/power-art.mjs`). It is crafted from `copper_ingot` (and `coin_wire` from old coins).
  Use it as the cable material.
- **Server storage:** island state is per `owner` (`server/src/game/keys.js`: `decoKey`, `homeKey`,
  …; `household.js` `homeOwner`). Store cables under a new key of the same kind, keyed by owner, not
  by user id. Look at `decor.js` for the pattern of validation, costs, and `conflict()` errors.
- **Routes:** API routes are in `server/src/routes.js`. Decor actions go through the existing
  `act` path in the client. Follow whichever pattern `decor.js` and `craft.js` use for placement.

## Hard constraints

1. **No popups** (project rule). Feedback is in-world floating text (`engine.floatText`) or
   effects, or a short line in the existing HUD hint. No modals and no toast boxes for cable
   actions. Errors such as "no cable in backpack" are floating text at the cursor.
2. **Server authoritative.** The client only proposes cable tiles and device links. The server
   validates tile bounds (same size as the scene map), that cables are not on water or on tiles
   that are not buildable, the cost in `bare_wire`, and that the cable count stays under a sane
   cap (for example 400 per island). The server computes the networks. The client never decides
   what is powered.
3. **Visibility is a rendering rule.** Cable data is always sent to the client with the island
   state (it is small), but cable meshes and sprites are only created and shown when
   `mode === 'power'`. Normal walk and build modes must render zero cables, including no hint
   of them under the ground.
4. **Highlighting.** In electricity mode, electricity devices (windmills, cables, and future
   consumers) are drawn at full brightness and are the only things that accept taps. All other
   decor, buildings and nodes are dimmed (lower alpha or tint) and not selectable. Leaving the mode
   restores the normal look.
5. **Language.** Code comments and UI strings are in **Ukrainian**, matching the codebase.
6. **Keep the existing power behaviour working** until the new rule below is in place. Do not
   break `state.power` for the HUD.
7. **Local testing.** There is no Redis or Docker on this machine. Follow the
   local E2E approach in the project memory (fake RESP Redis plus headless Edge over CDP). Never
   point tests at the production `.env` `REDIS_URL`.

## Player features

### 1. Entering and leaving

- In build mode (`IslandWalk`), the **⚡ Електрика** category (`cat === 'power'`) switches the
  sandbox to electricity mode. The mode is set on the engine as `setMode('power')`. `setMode`
  already has a `'build'` branch and it must get a parallel `'power'` branch. Leaving the category
  (any other category or "✓ Готово") leaves electricity mode.
- Electricity mode is only available on the home island (`!indoors`), not in the hut or on the
  winter island, and not on the farm scene.

### 2. Laying cables

- Selected item in the backpack: `bare_wire`. Cost: 1 `bare_wire` per cable tile.
- **Drag to lay a line.** Press and drag across grid cells to place a run of cables. Each cell
  is one segment. Cables connect to all neighbouring cables in four directions (no diagonals).
- **Tap a cable to remove it** (refund 1 `bare_wire`). Dragging over cables while holding remove
  erases a run.
- Cables may pass under buildings and decor (underground). They cannot be placed on water or
  where the grid is not walkable/buildable (reuse the same checks as decor placement). Decide and
  document one rule for overlap with a cable tile that is already there (no double placement).

### 3. Connecting devices

- A device is powered if it has at least one of its **port tiles** touching a cable. A port
  is the tile in front of the device's footprint. Define the port per device kind in one table
  (for example `POWER_PORTS` on the server and mirrored on the client). Windmill: one port.
- Placing a windmill next to a cable connects it automatically. No separate wiring step.
- Devices that do not touch any cable are not powered and show a small "no wire" marker in
  electricity mode.

### 4. Networks (cable management)

- A **network** is a connected set of cable tiles plus the devices attached to it.
- The server computes networks with a flood fill over cable tiles, on every change, and returns:
  `networks: [{ id, cables, devices: [...], gen, use }]` and `power` for the island total.
- Summary strip at the top in electricity mode: "Мережі: N · кабелів: M · ⚡ gen Вт". Tap a
  network to highlight its cables and devices (other networks dim). Tapping an empty area clears
  the highlight.
- **Cut a line:** removing a cable splits networks. The summary updates in place.
- **Count:** the cable count and the backpack `bare_wire` count are both visible in the mode
  summary, so the player knows how much wire is left.

### 5. Power rule (change to existing behaviour)

- Today every windmill counts, even if it is not wired. **New rule:** a generator contributes
  to the island's `state.power.gen` only if it is part of a network. Unwired windmills give 0 Вт.
  Keep `state.power.sources` as the count of powered generators.
- This changes the current HUD number for players who already have windmills. Mention this in the
  pull request. It is a deliberate change.

### 6. Persistence and sync

- Cables and the networks they form are saved in the island state (Redis key per owner, via
  the existing decor/home pattern). Include them in the island payload so that the client gets them
  on load.
- Changes are sent through the existing action endpoint. The server returns the updated
  cable list and networks, and the client redraws. Do not add a new polling loop for this.
- Shared households (`owner = "shared-1"`) see the same cables, as everything else on the island.

## Visuals

- **Cable tile in electricity mode:** a dark copper line with a thin bright core, slightly
  transparent (about 0.6 alpha), drawn on the ground layer below the decor sprites. It reads as a
  line seen through the soil. Reuse the palette from `power-art.mjs` (`COPPER` tones) where you
  can. Add a small pulse of light along the cable that runs from the windmill outward (cheap: a
  moving dash offset or a UV scroll, not per-frame allocations).
- **Network highlight:** brighter glow on the selected network, dim for the rest.
- **Port marker:** a small copper dot on the port tile of an unconnected device (red-ish tint).
- Avoid new large sprite sheets. Procedural shapes or the existing copper tones are enough.
- Performance: cables are a few hundred segments at most. Batch them into one mesh or one
  `Graphics`-style pass that is rebuilt only when the cable list changes. Do not rebuild every frame.

## Suggested implementation order

1. Server: cable store (`keys.js`), `POWER_PORTS` table, validation, flood-fill `networks`
   in `server/src/game/power.js`, new power rule for `state.power`. Unit-test the flood fill and the
   port check with a plain Node script (no Redis needed).
2. Server: action endpoint for place/remove cable, mirroring the decor action code path.
3. Client: data plumbing (island payload → `IslandWalk` state → engine), no rendering yet.
4. Engine: `'power'` mode in `setMode`, hidden cables in other modes, cable meshes in power mode,
   highlighting and dimming of non-electric objects.
5. UI: `⚡ Електрика` sandbox category, drag-to-lay input, network summary strip, tap to select a network.
6. Floating-text feedback for every failed action. No popups.
7. Verify: run the app locally with the fake Redis, enter electricity mode, lay a line, place a
   windmill, confirm the HUD power changes from 0 to 40 Вт, remove a cable, confirm the network
   splits. Confirm that normal build mode and walk mode show no cables.

## Acceptance criteria

- Electricity mode appears under build mode as ⚡ Електрика. It is not available indoors, on the
  winter island, or on the farm.
- In electricity mode only cables and electricity devices are highlighted and tappable.
- Cables are not visible in walk mode or regular build mode, in any scene.
- A windmill next to a cable is powered and adds 40 Вт to the island. An unwired windmill adds 0 Вт.
- Cutting a cable splits the network and updates the power number.
- Cables survive a reload and show the same on another device for the same island.
- The server rejects out-of-bounds, water and over-cap cable placements, and charges `bare_wire`
  correctly.
- No modals or toast boxes are added; all feedback is floating text or the mode summary.
- `npm run build` in `miniapp/` passes, and the server starts without errors.

## Out of scope (for later)

- Consumers (lamps, workshop machines). Keep `use` at 0 but make the network structure ready for them.
- Power storage, breakers, and overload.
- Visiting another player's island to see their wires.
