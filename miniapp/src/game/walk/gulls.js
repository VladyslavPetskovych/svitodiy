import * as THREE from 'three'
import { crispPixels } from './fx.js'

/**
 * Чайки над рідним островом — живі, але лякливі.
 *
 * Прилітають з-за краю мапи й сідають на пляж (або просто пролітають мимо), походжають, клюють пісок.
 * Підійдеш (чи підбіжить пес) — злітають і відлітають геть; сусідні чайки зриваються слідом.
 *
 * Злодійка: часом чайка сідає біля дару моря на піску (мушля, водорості, корч) і клює його.
 * Не прогнав за STEAL_S секунд — хапає й відлітає з ним, а сервер прибирає ресурс (onSteal).
 *
 * Стани: arrive — летить до місця посадки й знижується; pass — пролітає над островом;
 * idle — стоїть, клює, переступає; steal — клює чужий ресурс; flee — зривається й відлітає.
 * Арт малюємо в коді (як емоції пса) — окремого аркуша не треба.
 */

const MAX = 4
const FEAR = 36 // ближче — злітає одразу
const FEAR_RUN = 64 // біжиш у її бік — злітає раніше
const STEAL_S = 9
const STEAL_GAP = 75 // с між крадіжками
const CRUISE = 46 // висота польоту, px
const FLY = 58
const FLEE = 90

const rand = (a, b) => a + Math.random() * (b - a)

// 16×12 кадрів: стоїть, клює, крила вгору, рівно, вниз. Дивиться праворуч (ліворуч — дзеркало).
const FW = 16
const FH = 12
const FRAMES = {
  stand: [
    '................',
    '..........KKK...',
    '.........KWWWK..',
    '.........KWEWYY.',
    '.KK......KWWWK..',
    'KDGKKKKKKWWWK...',
    '.KDGGGGGWWWWK...',
    '..KDGGGGWWWWK...',
    '...KKWWWWWWK....',
    '.....KKKKKK.....',
    '.......O..O.....',
    '......OO.OO.....',
  ],
  peck: [
    '................',
    '................',
    '................',
    '.KK.............',
    'KDGKKKKKK.......',
    '.KDGGGGGWKKK....',
    '..KDGGGGWWWWK...',
    '...KKWWWWWWEWK..',
    '.....KKKKKKWWKY.',
    '...........KKYY.',
    '.......O..O.....',
    '......OO.OO.....',
  ],
  up: [
    '................',
    'KK............KK',
    'KDK..........KDK',
    '.KGK........KGK.',
    '..KGK......KGK..',
    '...KGKKKKKKGK...',
    '....KWWWWWWEWYY.',
    '.....KKKKKKKK...',
    '................',
    '................',
    '................',
    '................',
  ],
  mid: [
    '................',
    '................',
    '................',
    '................',
    '................',
    'KKKKKKKKKKKKK...',
    'KDGGGWWWWWEWYY..',
    'KKKKKKKKKKKK....',
    '................',
    '................',
    '................',
    '................',
  ],
  down: [
    '................',
    '................',
    '................',
    '................',
    '....KKKKKKKK....',
    '...KWWWWWWWEWYY.',
    '..KGKKKKKKKGK...',
    '.KGK......KGK...',
    'KDK........KDK..',
    'KK..........KK..',
    '................',
    '................',
  ],
}
const NAMES = Object.keys(FRAMES)
const PAL = { K: '#2f3540', W: '#f4f6f8', G: '#a9b4c2', D: '#3d4350', E: '#111317', Y: '#f2b632', O: '#e3873b' }
const FLAP = ['up', 'mid', 'down', 'mid']

function gullTexture() {
  const c = document.createElement('canvas')
  c.width = FW * NAMES.length
  c.height = FH
  const ctx = c.getContext('2d')
  NAMES.forEach((name, i) =>
    FRAMES[name].forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (!PAL[ch]) return
        ctx.fillStyle = PAL[ch]
        ctx.fillRect(i * FW + x, y, 1, 1)
      })
    )
  )
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}

/**
 * @param {{ scene3: THREE.Scene, camera: THREE.Camera, camUp: THREE.Vector3, camRight: THREE.Vector3,
 *   blobTex: THREE.Texture, unitPlane: THREE.BufferGeometry, particles: object,
 *   floatText: (text: string, o: object) => void, map: () => { w: number, h: number },
 *   canStand: (x: number, y: number) => boolean, spots: () => { x: number, y: number }[],
 *   beachNodes: () => { id: string, x: number, y: number, s: string }[],
 *   look: (sprite: string) => { geo: THREE.BufferGeometry, mat: THREE.Material } | null,
 *   scarers: () => { x: number, y: number, vx: number, vy: number }[],
 *   onSteal: (nodeId: string) => Promise<boolean> }} o
 */
export function createGulls(o) {
  const { scene3, camera, camUp, camRight, particles } = o
  const tex = gullTexture()
  const mat = crispPixels(new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false, side: THREE.DoubleSide }))
  const geos = Object.fromEntries(
    NAMES.map((name, i) => {
      const g = new THREE.PlaneGeometry(FW, FH)
      g.translate(0, FH / 2, 0)
      const u0 = (i * FW) / (FW * NAMES.length)
      const u1 = ((i + 1) * FW) / (FW * NAMES.length)
      g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, 1, u1, 1, u0, 0, u1, 0], 2))
      return [name, g]
    })
  )

  /** @type {object[]} */
  let gulls = []
  /** Ресурси, які чайка вже несе (рушій їх не малює). */
  const hidden = new Set()
  let spawnT = rand(4, 10)
  let stealAt = -STEAL_GAP + 25 // перша злодійка — не раніше ніж за ~25 с
  let clock = 0

  function make(x, y, alt) {
    const mesh = new THREE.Mesh(geos.mid, mat)
    const blob = new THREE.Mesh(o.unitPlane, new THREE.MeshBasicMaterial({ map: o.blobTex, transparent: true, depthWrite: false }))
    blob.renderOrder = -7
    scene3.add(mesh, blob)
    const g = { mesh, blob, x, y, alt, vx: 0, vy: 0, state: 'arrive', tx: x, ty: y, timer: 0, face: 1, flap: Math.random() * 4, pose: 'stand', poseT: 0, node: null, carry: null, scareIn: -1 }
    gulls.push(g)
    return g
  }

  function remove(g) {
    scene3.remove(g.mesh, g.blob)
    g.blob.material.dispose()
    if (g.carry) scene3.remove(g.carry)
    gulls = gulls.filter((q) => q !== g)
  }

  /** Точка за краєм мапи в напрямку (dx, dy) від центру. */
  function edge(dx, dy) {
    const m = o.map()
    const len = Math.hypot(dx, dy) || 1
    const R = Math.hypot(m.w, m.h) / 2 + 50
    return { x: m.w / 2 + (dx / len) * R, y: m.h / 2 + (dy / len) * R }
  }
  const outside = (g) => {
    const m = o.map()
    return g.x < -70 || g.y < -70 || g.x > m.w + 70 || g.y > m.h + 70
  }

  /** Хто лякає і як: відстань і чи біжить у бік чайки. */
  function threat(g) {
    let worst = null
    for (const s of o.scarers()) {
      const d = Math.hypot(s.x - g.x, s.y - g.y)
      const toward = d > 0 && ((g.x - s.x) * s.vx + (g.y - s.y) * s.vy) / d > 25
      if (d < FEAR || (toward && d < FEAR_RUN)) if (!worst || d < worst.d) worst = { ...s, d }
    }
    return worst
  }

  function flee(g, from) {
    if (g.state === 'flee') return
    const wasDown = g.alt < 4
    g.state = 'flee'
    // Геть від того, хто налякав, трохи навскіс.
    const a = Math.atan2(g.y - (from?.y ?? g.y + 1), g.x - (from?.x ?? g.x)) + rand(-0.6, 0.6)
    const out = edge(Math.cos(a), Math.sin(a))
    g.tx = out.x
    g.ty = out.y
    if (wasDown) particles.puff(g.x, g.y, 4)
    if (g.node && !g.carry) g.node = null
    // Зграя: сусіди зриваються слідом, кожна трохи із запізненням.
    for (const q of gulls)
      if (q !== g && q.state !== 'flee' && q.alt < 4 && q.scareIn < 0 && Math.hypot(q.x - g.x, q.y - g.y) < 56) q.scareIn = rand(0.1, 0.4)
  }

  /** force — 'thief' | 'pass' | 'land': для ручних перевірок; інакше — навмання. */
  function spawn(nodes, force = null) {
    const m = o.map()
    const a = Math.random() * Math.PI * 2
    const from = edge(Math.cos(a), Math.sin(a))
    const player = o.scarers()[0]
    const far = (p, r) => !player || Math.hypot(p.x - player.x, p.y - player.y) > r
    // Злодійка: дар моря на піску, до якого ти не поруч, і давно ніхто не крав.
    const loot = nodes.filter((n) => !hidden.has(n.id) && far(n, 90) && !gulls.some((q) => q.node === n.id))
    const wantThief = force ? force === 'thief' : clock - stealAt > STEAL_GAP && !gulls.some((q) => q.node) && Math.random() < 0.45
    if (loot.length && wantThief) {
      const n = loot[Math.floor(Math.random() * loot.length)]
      const side = Math.random() < 0.5 ? -1 : 1
      const g = make(from.x, from.y, CRUISE)
      g.node = n.id
      g.tx = n.x + side * 8
      g.ty = n.y + 1
      return
    }
    if (force ? force === 'pass' : Math.random() < 0.3) {
      // Пролітає мимо, не сідаючи.
      const g = make(from.x, from.y, CRUISE + rand(-8, 14))
      g.state = 'pass'
      const to = edge(m.w / 2 - from.x + rand(-80, 80), m.h / 2 - from.y + rand(-80, 80))
      g.tx = to.x
      g.ty = to.y
      return
    }
    const spots = o.spots().filter((p) => far(p, 90) && o.canStand(p.x, p.y))
    if (!spots.length) return
    const p = spots[Math.floor(Math.random() * spots.length)]
    // Часом прилітають парою.
    const n = Math.random() < 0.35 && gulls.length < MAX - 1 ? 2 : 1
    for (let k = 0; k < n; k++) {
      const g = make(from.x + k * 14, from.y + k * 6, CRUISE + k * 4)
      g.tx = p.x + k * rand(9, 14)
      g.ty = p.y + k * rand(-4, 4)
      if (k && !o.canStand(g.tx, g.ty)) {
        g.tx = p.x
        g.ty = p.y
      }
    }
  }

  /** Летіти до (tx, ty) зі швидкістю speed; true — долетіли. */
  function flyTo(g, speed, dt) {
    const dx = g.tx - g.x
    const dy = g.ty - g.y
    const d = Math.hypot(dx, dy)
    const k = 1 - Math.exp(-3 * dt)
    g.vx += ((dx / (d || 1)) * speed - g.vx) * k
    g.vy += ((dy / (d || 1)) * speed - g.vy) * k
    g.x += g.vx * dt
    g.y += g.vy * dt
    return d < 2
  }

  function steal(g) {
    const n = o.beachNodes().find((q) => q.id === g.node)
    if (!n) {
      g.node = null
      g.state = 'idle'
      return
    }
    hidden.add(n.id)
    stealAt = clock
    const look = o.look(n.s)
    if (look) {
      g.carry = new THREE.Mesh(look.geo, look.mat)
      g.carry.scale.setScalar(0.6)
      g.carry.renderOrder = 5
      scene3.add(g.carry)
    }
    particles.puff(n.x, n.y, 5)
    const id = n.id
    flee(g, { x: g.x - g.face * 10, y: g.y + 6 })
    o.onSteal(id).then(
      (ok) => !ok && hidden.delete(id),
      () => hidden.delete(id)
    )
  }

  function step(g, dt) {
    if (g.scareIn >= 0) {
      g.scareIn -= dt
      if (g.scareIn < 0) flee(g, null)
    }
    const low = g.alt < 10 && g.state !== 'flee' && g.state !== 'pass'
    if (low) {
      const s = threat(g)
      if (s) flee(g, s)
    }
    switch (g.state) {
      case 'arrive': {
        // Злодійчина ціль зникла (підняв сам) — сідає просто поруч.
        if (g.node && !o.beachNodes().some((n) => n.id === g.node)) g.node = null
        const d = Math.hypot(g.tx - g.x, g.ty - g.y)
        const landed = flyTo(g, Math.min(FLY, 12 + d * 1.2), dt)
        g.alt += (Math.min(CRUISE, d * 0.45) - g.alt) * (1 - Math.exp(-4 * dt))
        if (landed || (d < 3 && g.alt < 1.5)) {
          g.alt = 0
          g.vx = g.vy = 0
          g.x = g.tx
          g.y = g.ty
          g.state = g.node ? 'steal' : 'idle'
          g.timer = g.node ? STEAL_S : rand(1, 3)
          if (g.node) {
            g.face = o.beachNodes().find((n) => n.id === g.node)?.x > g.x ? 1 : -1
            o.floatText('🐦 Чайка цупить!', { at: `node:${g.node}`, kind: 'calm' })
          }
        }
        break
      }
      case 'pass':
        flyTo(g, FLY, dt)
        if (outside(g) && Math.hypot(g.tx - g.x, g.ty - g.y) < 60) remove(g)
        break
      case 'flee':
        flyTo(g, FLEE, dt)
        g.alt += (CRUISE + 20 - g.alt) * (1 - Math.exp(-2.5 * dt))
        if (outside(g)) remove(g)
        break
      case 'steal':
        if (!o.beachNodes().some((n) => n.id === g.node)) {
          g.node = null
          g.state = 'idle'
          g.timer = rand(0.5, 1.5)
          break
        }
        g.pose = (g.timer * 3) % 1 < 0.45 ? 'peck' : 'stand'
        g.timer -= dt
        if (g.timer <= 0) steal(g)
        break
      case 'idle': {
        g.timer -= dt
        if (g.walk) {
          const dx = g.walk.x - g.x
          const dy = g.walk.y - g.y
          const d = Math.hypot(dx, dy)
          if (d < 1 || !o.canStand(g.x + (dx / d) * 2, g.y + (dy / d) * 2)) g.walk = null
          else {
            g.x += (dx / d) * 14 * dt
            g.y += (dy / d) * 14 * dt
            g.face = dx > 0 ? 1 : -1
          }
        }
        if (g.poseT > 0) {
          g.poseT -= dt
          if (g.poseT <= 0) g.pose = 'stand'
        }
        if (g.timer <= 0) {
          g.timer = rand(0.8, 3)
          const r = Math.random()
          if (r < 0.4) {
            g.pose = 'peck'
            g.poseT = rand(0.25, 0.6)
          } else if (r < 0.75) {
            const a = Math.random() * Math.PI * 2
            const to = { x: g.x + Math.cos(a) * rand(6, 18), y: g.y + Math.sin(a) * rand(4, 10) }
            if (o.canStand(to.x, to.y)) g.walk = to
          } else if (r < 0.88) g.face = -g.face
          else if (r < 0.92 && gulls.length > 1) {
            // Набридло — летить кудись іще.
            flee(g, { x: g.x - g.face * 20, y: g.y })
          }
        }
        break
      }
    }
  }

  function render(g, dt) {
    const air = g.alt > 0.5
    // Напрям — відносно екрана: арт дивиться праворуч.
    if (air) {
      const sx = g.vx * camRight.x + g.vy * camRight.z
      if (Math.abs(sx) > 3) g.face = sx > 0 ? 1 : -1
      const climbing = g.state === 'flee' || g.state === 'pass' || g.alt > CRUISE - 6
      g.flap += dt * (climbing ? 11 : 4)
      // Знижуючись — більше планує, лише зрідка змахує.
      g.pose = climbing || Math.sin(g.flap * 0.7) > 0.3 ? FLAP[Math.floor(g.flap) % 4] : 'mid'
    } else if (g.state !== 'idle' && g.state !== 'steal') g.pose = 'stand'
    g.mesh.geometry = geos[g.pose] ?? geos.stand
    g.mesh.position.set(g.x, 0, g.y).addScaledVector(camUp, g.alt)
    g.mesh.quaternion.copy(camera.quaternion)
    g.mesh.scale.set(g.face, 1, 1)
    g.mesh.renderOrder = air ? 6 : 0
    // Тінь на землі: що вище — то менша й блідіша.
    const k = Math.max(0.35, 1 - g.alt / 90)
    g.blob.position.set(g.x, 0.18, g.y)
    g.blob.scale.set(9 * k, 1, 4 * k)
    g.blob.material.opacity = 0.75 * k
    if (g.carry) {
      g.carry.position.set(g.x + g.face * 3, 0, g.y).addScaledVector(camUp, Math.max(0, g.alt - 5))
      g.carry.quaternion.copy(camera.quaternion)
    }
  }

  return {
    hidden,
    /** active — гравець надворі на рідному острові. */
    update(dt, active) {
      clock += dt
      if (!active) {
        if (gulls.length) this.clear()
        return
      }
      const nodes = o.beachNodes()
      spawnT -= dt
      if (spawnT <= 0) {
        spawnT = rand(10, 28)
        if (gulls.length < MAX) spawn(nodes)
      }
      for (const g of [...gulls]) step(g, dt)
      for (const g of gulls) render(g, dt)
    },
    clear() {
      for (const g of [...gulls]) remove(g)
      hidden.clear()
      spawnT = rand(4, 10)
    },
    /** Викликати чайку зараз (ручні перевірки в консолі). */
    spawn: (force) => spawn(o.beachNodes(), force),
    info: () => gulls.map((g) => ({ x: g.x, y: g.y, alt: g.alt, state: g.state, node: g.node })),
    dispose() {
      this.clear()
      for (const g of Object.values(geos)) g.dispose()
      mat.dispose()
      tex.dispose()
    },
  }
}
