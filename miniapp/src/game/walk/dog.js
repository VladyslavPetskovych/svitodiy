import * as THREE from 'three'
import meta from './dog.json'
import { accelerate, createBody, followPath, move, teleport } from './physics.js'

/**
 * Пес Рудько — домашній улюбленець, що живе на острові й заходить із тобою в хату.
 *
 * Три шари, як у game-ai: рішення (скінченний автомат станів нижче) → шлях (той самий BFS,
 * що й у мандрівника) → рух (та сама кінематична фізика, лише свої швидкості).
 *
 * Стани:
 *   idle    — стоїть, дивиться на тебе; за таймером: прогулянка, сісти або (якщо ти давно
 *             стоїш) спати;
 *   wander  — нюхає довкола неподалік від тебе;
 *   follow  — ти відійшов далеко — біжить слідом і зупиняється поруч, збоку;
 *   sit     — сидить, метляє хвостом, часом висолоплює язика;
 *   sleep   — спить калачиком (зетки над головою); прокидається, коли підходиш;
 *   wait    — ти покликав (тап по псові): завмирає й чекає;
 *   happy   — погладили або розбудили: підстрибує, сердечка.
 */

export { DOG_NAME, PET_RANGE } from './companion.js'

const TUNE = { accel: 420, decel: 600, reverseBoost: 1.6 }
const TROT = 74 // трохи швидше за мандрівника (64) — щоб наздоганяв
const WALK = 30
const FAR = 46 // далі — біжить слідом
const NEAR = 20 // ближче — досить, стає поруч
const SLEEPY = 22 // стільки секунд ти не рухаєшся — пес лягає спати
const CELL = meta.cell

const rand = (a, b) => a + Math.random() * (b - a)
const UP = new THREE.Vector3() // без алокацій у кадрі

/** Піксельна текстура-емоція (сердечко / зетка) — для спрайта над псом. */
function emoteTexture(rows, pal) {
  const c = document.createElement('canvas')
  c.width = rows[0].length
  c.height = rows.length
  const ctx = c.getContext('2d')
  rows.forEach((r, y) =>
    [...r].forEach((ch, x) => {
      if (pal[ch]) {
        ctx.fillStyle = pal[ch]
        ctx.fillRect(x, y, 1, 1)
      }
    })
  )
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestFilter
  tex.generateMipmaps = false
  return tex
}
const HEART = ['.KK.KK.', 'KRRKRRK', 'KRrRRRK', 'KRRRRRK', '.KRRRK.', '..KRK..', '...K...']
const ZED = ['KKKKK', 'KWWWK', 'KKWKK', 'KWKKK', 'KWWWK', 'KKKKK']
const EMOTE_PAL = { K: '#2b1d16', R: '#e0483a', r: '#ffb0a0', W: '#f6f0e2' }

/**
 * @param {{ texture: THREE.Texture, alpha: Uint8ClampedArray, scene: THREE.Scene,
 *   canStand: (x: number, y: number) => boolean, findPath: (from: object, to: object) => object[],
 *   player: () => { x: number, y: number, vx: number, vy: number } }} o
 */
export function createDog({ texture, alpha, scene, canStand, findPath, player }) {
  const body = createBody(0, 0)
  let state = 'idle'
  let timer = 1
  let path = []
  let speed = WALK
  let repathAt = 0
  let stillT = 0
  const stuck = { x: 0, y: 0, t: 0 }
  let simT = 0
  // Анімація.
  let dir = 'down'
  let anim = 'idle_down'
  let animT = 0
  const vis = { x: 0, y: 0 }

  // Кадри аркуша → площини з якорем унизу по центру.
  const geos = new Map()
  const SW = meta.size.w
  const SH = meta.size.h
  function frameGeo(row, col) {
    const key = row * 16 + col
    let g = geos.get(key)
    if (g) return g
    g = new THREE.PlaneGeometry(CELL.w, CELL.h)
    g.translate(0, CELL.h / 2, 0)
    const u0 = (col * CELL.w) / SW
    const u1 = ((col + 1) * CELL.w) / SW
    const v1 = 1 - (row * CELL.h) / SH
    const v0 = 1 - ((row + 1) * CELL.h) / SH
    g.setAttribute('uv', new THREE.Float32BufferAttribute([u0, v1, u1, v1, u0, v0, u1, v0], 2))
    geos.set(key, g)
    return g
  }
  const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, alphaTest: 0.5, depthWrite: false })
  const mesh = new THREE.Mesh(frameGeo(0, 0), mat)
  scene.add(mesh)

  // Емоції: невеликий пул спрайтів, що злітають і тануть.
  const heartTex = emoteTexture(HEART, EMOTE_PAL)
  const zedTex = emoteTexture(ZED, EMOTE_PAL)
  const emotes = Array.from({ length: 6 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }))
    s.visible = false
    s.renderOrder = 7
    scene.add(s)
    return { s, age: 0, life: 0, dx: 0 }
  })
  let emoteAcc = 0
  function emote(tex, size, life = 1.1) {
    const e = emotes.find((q) => !q.s.visible) ?? emotes[0]
    e.s.material.map = tex
    e.s.material.needsUpdate = true
    e.s.scale.set(size, size, 1)
    e.s.visible = true
    e.age = 0
    e.life = life
    e.dx = rand(-3, 3)
  }

  function enter(s, t = 0) {
    state = s
    timer = t
    path = []
  }

  function goTo(target, spd) {
    path = findPath(body, target)
    speed = spd
    stuck.x = body.x
    stuck.y = body.y
    stuck.t = simT
  }

  /** Точка поруч із тобою — з того боку, де пес уже є (не перебігає через тебе). */
  function besidePlayer(p) {
    let dx = body.x - p.x
    let dy = body.y - p.y
    const d = Math.hypot(dx, dy) || 1
    dx /= d
    dy /= d
    return { x: p.x + dx * 14, y: p.y + dy * 10 }
  }

  /** Якщо на місці пса з'явилась перешкода (поставили декор) — переносимо його поруч із тобою. */
  function unstick() {
    if (canStand(body.x, body.y)) return
    const p = player()
    for (let r = 8; r <= 40; r += 4)
      for (let a = 0; a < 8; a++) {
        const x = p.x + Math.cos((a / 8) * Math.PI * 2) * r
        const y = p.y + Math.sin((a / 8) * Math.PI * 2) * r * 0.7
        if (canStand(x, y)) {
          teleport(body, x, y)
          return
        }
      }
  }

  /** Фіксований крок: рішення + рух. */
  function fixedStep(dt) {
    simT += dt
    body.prevX = body.x
    body.prevY = body.y
    unstick()
    const p = player()
    const d = Math.hypot(p.x - body.x, p.y - body.y)
    const playerMoving = Math.hypot(p.vx, p.vy) > 4
    stillT = playerMoving ? 0 : stillT + dt
    timer -= dt

    switch (state) {
      case 'sleep':
        // Ти підійшов — прокидається радісно; інакше спить, поки ти не підеш далеко.
        if (d < 26 && playerMoving) enter('happy', 1.1)
        else if (d > FAR * 1.6 && timer <= 0) enter('follow')
        break
      case 'happy':
        if (timer <= 0) enter('sit', rand(2.5, 4.5))
        break
      case 'wait':
        if (timer <= 0) enter('idle', 0.8)
        break
      case 'follow':
        if (d < NEAR + 2) enter(stillT > 1 ? 'sit' : 'idle', rand(0.8, 2))
        else if (simT >= repathAt) {
          repathAt = simT + 0.35
          goTo(besidePlayer(p), d > 100 ? TROT * 1.3 : TROT)
        }
        break
      case 'wander':
        if (d > FAR) enter('follow')
        else if (!path.length) enter('idle', rand(1, 2.5))
        break
      case 'sit':
        if (d > FAR) enter('follow')
        else if (timer <= 0) {
          if (stillT > SLEEPY) enter('sleep', rand(10, 20))
          else enter('idle', rand(0.8, 1.6))
        }
        break
      default: // idle
        if (d > FAR) enter('follow')
        else if (timer <= 0) {
          const r = Math.random()
          if (stillT > SLEEPY) enter('sleep', rand(10, 20))
          else if (r < 0.45) {
            // Прогулянка: випадкова точка неподалік, але не далі ~40 px від тебе.
            const a = Math.random() * Math.PI * 2
            const t = { x: p.x + Math.cos(a) * rand(16, 40), y: p.y + Math.sin(a) * rand(12, 30) }
            enter('wander')
            goTo(t, WALK)
          } else if (r < 0.8) enter('sit', rand(3, 7))
          else enter('idle', rand(1, 2.5))
        }
    }

    // Рух уздовж шляху (у станах, що рухаються), гальмування — в решті.
    let wx = 0
    let wy = 0
    if ((state === 'follow' || state === 'wander') && path.length) {
      const r = followPath(body, path, speed)
      wx = r.wx
      wy = r.wy
    }
    accelerate(body, wx, wy, dt, TUNE)
    move(body, dt, canStand)

    // Застряг — облишаємо цей шлях (автомат вибере інший).
    if (path.length && simT - stuck.t > 0.8) {
      if (Math.hypot(body.x - stuck.x, body.y - stuck.y) < 2) path = []
      stuck.x = body.x
      stuck.y = body.y
      stuck.t = simT
    }
  }

  /**
   * Кадр рендера: інтерполяція між кроками фізики, вибір анімації й напрямку відносно екрана.
   * @param {{ right: {x:number,y:number}, down: {x:number,y:number} }} basis напрямки екрана на землі
   */
  function frame(dt, alpha, camera, basis) {
    vis.x = body.prevX + (body.x - body.prevX) * alpha
    vis.y = body.prevY + (body.y - body.prevY) * alpha
    const spd = Math.hypot(body.vx, body.vy)
    const moving = spd > 4
    // Куди дивиться: у бік руху, а стоячи — на тебе (якщо ти поруч).
    let fx = body.vx
    let fy = body.vy
    if (!moving) {
      const p = player()
      fx = p.x - body.x
      fy = p.y - body.y
      if (Math.hypot(fx, fy) > 60) fx = fy = 0
    }
    if (fx || fy) {
      const sx = fx * basis.right.x + fy * basis.right.y
      const sy = fx * basis.down.x + fy * basis.down.y
      dir = Math.abs(sx) > Math.abs(sy) ? (sx > 0 ? 'right' : 'left') : sy > 0 ? 'down' : 'up'
    }
    const next = state === 'sleep' || state === 'sit' || state === 'happy' ? state : `${moving ? 'walk' : 'idle'}_${dir}`
    if (next !== anim) {
      anim = next
      animT = 0
    }
    const a = meta.anims[anim]
    // Хода — у темпі швидкості, решта — з fps аркуша.
    animT += dt * (moving ? Math.max(0.5, spd / TROT) : 1)
    const col = Math.floor(animT * a.fps) % a.frames
    mesh.geometry = frameGeo(a.row, col)
    mesh.position.set(vis.x, 0, vis.y)
    mesh.quaternion.copy(camera.quaternion)

    // Зетки уві сні й сердечка від радості.
    emoteAcc += dt
    if (state === 'sleep' && emoteAcc > 1.3) {
      emoteAcc = 0
      emote(zedTex, 5, 1.6)
    } else if (state === 'happy' && emoteAcc > 0.28) {
      emoteAcc = 0
      emote(heartTex, 6, 1)
    }
    const up = UP.set(0, 1, 0).applyQuaternion(camera.quaternion)
    for (const e of emotes) {
      if (!e.s.visible) continue
      e.age += dt
      if (e.age >= e.life) {
        e.s.visible = false
        continue
      }
      const k = e.age / e.life
      e.s.position.set(vis.x + e.dx * k, 0, vis.y).addScaledVector(up, 17 + k * 10)
      e.s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3
    }
  }

  return {
    body,
    mesh,
    fixedStep,
    frame,
    get state() {
      return state
    },
    /** Поставити пса поруч із точкою (вхід у сцену). */
    place(x, y) {
      teleport(body, x, y)
      vis.x = x
      vis.y = y
      enter('idle', 0.6)
      unstick()
    },
    /** Тебе покликали тапом: завмирає й чекає, поки підійдеш. */
    notice() {
      if (state !== 'sleep' && state !== 'happy') enter('wait', 3)
    },
    /** Погладили: радісний підскок і сердечка. */
    pet() {
      enter('happy', 1.4)
      emoteAcc = 1
      body.vx = body.vy = 0
    },
    /** Чи влучив промінь у непрозорий піксель пса. */
    hit(raycaster) {
      const h = raycaster.intersectObject(mesh, false)[0]
      if (!h?.uv) return false
      const px = Math.min(SW - 1, Math.floor(h.uv.x * SW))
      const py = Math.min(SH - 1, Math.floor((1 - h.uv.y) * SH))
      return alpha[(py * SW + px) * 4 + 3] > 40
    },
    dispose() {
      scene.remove(mesh)
      for (const g of geos.values()) g.dispose()
      mat.dispose()
      for (const e of emotes) {
        scene.remove(e.s)
        e.s.material.dispose()
      }
      heartTex.dispose()
      zedTex.dispose()
    },
  }
}
