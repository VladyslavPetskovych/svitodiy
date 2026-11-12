# Prompt: see other players on the same island (live presence)

> Paste everything below the line into Claude Code from the repo root.

---

## Goal

Make the island walk multiplayer: when two or more players share the same island, each of them
sees the others' travellers walking around in real time (outdoors on the island and inside the
hut), with their name above them. Changes one player makes to the shared island (buildings, decor,
farm beds, interior, harvested nodes) should also appear for the others within a few seconds
without reopening the app.

This is **presence + live sync**, not shared simulation. Every player still moves their own hero
locally with zero latency. The server only relays positions. Dogs, gathering, farming and
building stay authoritative through the existing REST endpoints. Do not change that.

## What "same island" means here (read first)

- `server/src/game/household.js` → `homeOwner(userId)` returns `{ owner, shared }`. Every
  island-scoped Redis key (`homeKey`, `decoKey`, `farmKey`, `interiorKey`, `floorKey`, `dogsKey`,
  `nodesKey`) is keyed by **`owner`**, not by user id.
- A player on their own island has `owner === String(userId)` and is alone. Players in a shared
  household (phone list in `telegram-bot/src/specialAccess.js`, `SHARED_HOME_ID = "shared-1"`)
  all get `owner = "shared-1"`.
- **Presence room = `owner`.** Inside a room, a player is either in scene `"island"` or `"home"`
  (the hut). Only players in the same room *and* the same scene are drawn.
- `homeOwner()` reads the phone from Redis on every call. Cache the result per user in memory
  (about 60 s) for the presence endpoint, because it gets called much more often than anything else.

Keep the design generic (room = owner), so that a later "visit a friend's island" feature only
has to change how the room is resolved.

## Hard constraints from the current architecture

1. **Transport goes through the Netlify edge proxy.** The browser only talks to
   `https://svitodiy.netlify.app/api/*`. `miniapp/netlify/edge-functions/api.js` forwards plain
   HTTP to `API_ORIGIN` (`http://<ip>:3000`). WebSockets can't go through this proxy, and a direct
   `ws://` connection from the HTTPS Mini App would be blocked as mixed content. **Use HTTP
   polling** for this version. Put the client transport behind a small interface
   (`createPresence({ send, onPeers })`), so that it can be swapped for WebSocket/SSE later if the
   server gets its own TLS domain. Don't build that now.
2. **Auth:** every request carries `Authorization: tma <initData>`, which
   `server/src/telegramAuth.js` verifies. Reuse `request()` from `miniapp/src/game/api.js`.
3. **Rate limit:** `server/src/routes.js` applies a global `rateLimit({ windowMs: 10_000, max: 40 })`
   per user. Presence polling must **not** count against it. Mount the presence route with its own
   limiter (for example 30 per 10 s) **before** the global limiter, but after
   `requireTelegramUser`.
4. **Redis backup:** `telegram-bot/src/userBackup.js` backs up every key matching `svitodiy:*`.
   Presence is ephemeral and must not end up in backups. Use a different prefix (for example
   `svpresence:<owner>`) **or** keep it only in server memory. The server is a single process
   (`docker-compose.yml`), so an in-memory `Map` is acceptable and simplest. If you choose Redis,
   use a hash with `PEXPIRE`.
5. **Edge invocation cost:** every poll is a Netlify edge function invocation. Keep the cadence
   adaptive (see below) and stop polling completely when it isn't needed.
6. **The hero's direction is screen-relative.** In `walk/engine.js` (around the hero update in
   the main loop), `hero.dir` is computed from velocity projected onto `rig.right`/`rig.down`, and
   each player can rotate their own camera. **Never send `dir`.** Send the world-space velocity
   or facing vector (`face`/`body.vx, body.vy`). Each client derives the screen direction for
   remote heroes with its own camera, using the same projection.
7. **No popups** (project rule): join/leave and any feedback must be in-world floating text
   (`engine.floatText`) or effects, never modals or toast boxes.
8. Code comments and UI strings are in **Ukrainian**, matching the rest of the codebase.

## Server work

Create `server/src/game/presence.js` and wire it in `server/src/routes.js`.

`POST /api/presence`, body:
```json
{ "scene": "island" | "home", "x": 123.4, "y": 456.7, "vx": 0, "vy": 0, "fx": 0, "fy": 1, "seq": 42 }
```
- Validate everything: `scene` from an allowlist; numbers finite; clamp `x/y` to the scene map
  bounds (`MAP` and the home map sizes from `miniapp/src/game/walk/layout.js` / `home.js`, so
  duplicate the two size constants on the server with a comment pointing at the source); clamp
  speed to a sane max; ignore `seq` values that are older than the last one stored.
- Store `{ x, y, vx, vy, fx, fy, scene, seq, name, at: Date.now() }` for `userId` in room `owner`.
  `name` = first name from the verified `req.tgUser` (see `displayName()` in `state.js`, but
  use just the first name and trim it to about 16 characters).
- Response:
  ```json
  { "peers": [{ "id": "…", "name": "Оля", "scene": "island", "x": 0, "y": 0, "vx": 0, "vy": 0, "fx": 0, "fy": 1, "age": 120 }],
    "rev": 17, "serverTime": 1731400000000 }
  ```
  Return all other users in the room whose `at` is newer than about 8 s. Don't include yourself.
  Don't include Telegram ids beyond what's needed to key the sprite (an opaque per-room index or
  a hash is fine).
- Don't attach `state` to this response. Use `handler(fn, { withState: false })`.
- `DELETE /api/presence` removes the user immediately (when they leave the walk screen or hide the app).
- Sweep stale entries periodically (`setInterval(...).unref()`, like `rateLimit.js` does).

**Island revision (live sync of world changes):**
- Keep a per-owner counter, `rev`. Increment it after every successful mutation that changes the
  shared island: the `/home/*`, `/farm/*` (beds/plots, not seed buying/selling), `/island/nodes/*`,
  `/dogs/*` and interior/floor/deco routes. The cleanest place is a small wrapper or a flag on
  those routes in `routes.js` that bumps `rev` for `homeOwner(uid).owner` after `fn` resolves.
  Don't sprinkle it through every game module.
- The presence response returns `rev`. The client refetches `GET /state` (silently) when `rev`
  increases and it didn't cause that change itself. Throttle it to at most once every 2 s.
- Make sure the player who made the change doesn't refetch right after their own action. They
  already got `state` in the response. The simplest way: the mutation response also includes the new
  `rev`, so the client knows it's current.

## Client work

### Presence loop: `miniapp/src/game/presence.js` (new, no React)
- `createPresence({ initData, getSelf, onPeers, onRev })` → `{ start(), stop(), setScene() }`.
- Only runs while `IslandWalk` is mounted **and** `document.visibilityState === 'visible'`.
  On hide or unmount, call `stop()` and send `DELETE /api/presence` with `fetch(..., { keepalive: true })`
  (`sendBeacon` can't set the auth header).
- Adaptive cadence:
  - other peers present → every ~500 ms
  - alone → every ~4 s (enough to notice someone arriving)
  - after a network error → back off up to 10 s, and stay silent (no toasts)
- Each tick sends the hero's current state from the engine and passes the response to `onPeers` / `onRev`.

### Engine: `miniapp/src/game/walk/engine.js`
Add a small public API next to the existing ones (`setWorld`, `syncDogs`, `floatText`, …):
- `selfState()` → `{ scene: scene.id, x: body.x, y: body.y, vx: body.vx, vy: body.vy, fx: face.x, fy: face.y }`.
- `setPeers(list)`: keyed by peer id, create, update or remove remote heroes.

A remote hero needs:
- A mesh built from the same `hero_<dir>_<frame>` atlas frames, the same `spriteGeo` and material
  path as `heroMesh`, and a blob shadow like `heroBlob`. Use the same `renderOrder` / painter
  ordering as the local hero, so they sort correctly against trees and buildings.
- **A visual distinction** from the local hero, such as a slight colour tint on a cloned
  material. There is only one hero sprite sheet today. Don't generate new art for this task.
- **A name label** above the head. Use `textTexture()` from `walk/fx.js`, which is already used for
  in-world text. Keep it small and crisp. It must stay readable when the camera zooms.
- **Smooth motion:** snapshot interpolation. Buffer the incoming samples with their `serverTime`,
  and render about 200 ms in the past, lerping between the two surrounding samples. If a sample is
  late, extrapolate briefly with the last velocity (cap it at about 250 ms), then hold. If the
  position jumps more than ~64 px (a scene change or a teleport), snap instead of lerping.
- **Animation:** derive `moving` from the interpolated speed (the same `> 4` threshold the local hero
  uses). Derive the screen direction by projecting the world velocity (or the facing vector when
  idle) onto `rig.right` / `rig.down`, exactly like the local hero code. Walk frames use
  `HERO_SEQ` and `step` advanced by speed.
- **Visibility:** only peers whose `scene === scene.id` are drawn. In `setScene()`, hide or show
  them accordingly.
- **No collision:** remote heroes are ghosts for physics. Don't add them to the walk grid,
  pathing, or the dogs' `others()`. Tapping them does nothing for now.
- **Join/leave:** fade the sprite in and out over about 300 ms. On join, show a floating text at
  the peer's position, such as `«Оля на острові»`. Don't show it again for the same peer within a
  minute, so that flickering connections don't spam it.
- **Cleanup:** dispose of the cloned materials, geometries and label textures when a peer
  leaves and when the engine is destroyed. Follow the existing disposal code at the end of `engine.js`.
- Expose the peer count and positions in the existing debug snapshot (the object returned around
  `player: {...}, hero: {...}, dogs: ...`).

### Screen: `miniapp/src/game/screens/IslandWalk.jsx`
- After the engine is `ready`, create the presence loop with `getSelf = () => engine.current?.selfState()`
  and `onPeers = (p) => engine.current?.setPeers(p)`. Stop it on unmount.
- `onRev`: when `rev` is greater than the last known value, call `act('GET', '/state', undefined, { silent: true })`.
  This is the same silent refresh pattern used in `store.jsx` for `visibilitychange`.
  The existing `setWorld`, `setFarm` and `syncDogs` effects will then update the scene.
- Track `rev` from mutation responses so a player's own actions don't trigger a refetch.
- Optional, small: a tiny HUD chip `👥 2` when peers are present. No popups.

## Things to be careful about

- `homeOwner()` → `doPin()` copies islands for the shared host the first time. Make sure the
  presence endpoint uses the cached owner resolution and can never trigger or race that copy. If
  needed, resolve the owner through `/state` once and cache it.
- The server must never trust client coordinates for game logic. Presence is cosmetic only.
- Two players can act on the same farm plot or node at the same time. That's already protected
  server-side (Redis atomics, `GameError` conflicts). After a conflict, a silent `/state` refresh is
  enough. Don't add a new error UI.
- Keep `engine.js` changes contained. Put remote-hero logic in a new module,
  `walk/peers.js`, exporting `createPeers({ scene3, spriteGeo, spriteMat, blobMat, textTexture, ... })`,
  and keep only the wiring in `engine.js`, which is already about 2300 lines.
- Don't touch dogs, farming, building or physics behaviour.

## Testing / verification

1. Add a dev script `server/scripts/fake-peer.mjs`. It signs a valid `initData` for a fake user
   with `TELEGRAM_BOT_TOKEN` (the inverse of `verifySignedParams` in `telegramAuth.js`) and
   `POST`s `/api/presence` in a loop, walking a circle around the island centre.
   - For the fake user to land in a real room, add a **dev-only** override. When
     `NODE_ENV !== "production"`, the env var `PRESENCE_DEV_ROOM=<owner>` puts the fake id in that
     room. Production behaviour must be unchanged.
2. Run the server and the Vite dev server locally, open the walk, and run the fake peer in the
   same room. Confirm that it:
   - walks smoothly at the right speed
   - shows correct direction frames from several camera angles
   - has a name label
   - is hidden when you enter the hut and visible again when you go out
   - fades out within about 8 s after the script is killed
3. Have the fake script also call one island mutation, such as moving a decor item, and confirm the
   open client picks up the change through `rev` without a manual reload.
4. In DevTools, confirm that polling stops when the tab is hidden and when you leave the walk screen,
   and that the cadence drops to about 4 s when you're alone.
5. Run `npm run build` in `miniapp/` and the repo's lint (`.oxlintrc.json`) with no new warnings.

## Out of scope (don't do now)

- WebSockets/SSE, its own TLS domain for the server
- Visiting other players' islands, friend lists, invites
- Chat, emotes, trading, interacting with other heroes
- New hero art or skins
- Server-side movement validation beyond clamping

When done, summarise which files changed, the measured poll cadence, and any edge-invocation
cost estimate per active player-hour.
