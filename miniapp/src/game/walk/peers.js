import * as THREE from 'three'
import { crispPixels, crispTexture, textTexture } from './fx.js'
import { HERO_FRAME, composeHero, heroFrameIndex, outfitKey, outfitOf } from './outfit.js'

/**
 * Інші мандрівники спільного острова (дані — з miniapp/src/game/presence.js).
 *
 * Кожен — такий самий спрайт, як твій мандрівник (ті самі кадри й одяг зі своєї шафи), з ім'ям над
 * головою. Точки приходять пачками раз на ~0,5 с, тож малюємо їх «трохи в минулому» і плавно
 * ведемо між сусідніми точками (інтерполяція): затримку кожен підбирає сам — рівно таку,
 * щоб попереду завжди була наступна точка. Фізики й зіткнень у них немає: це лише картинка.
 *
 * Напрям погляду рахуємо тут, а не беремо з сервера: камеру кожен крутить по-своєму,
 * тож «вліво» на твоєму екрані — не те саме, що на екрані друга.
 */

/** Далі за цю відстань між сусідніми точками не ведемо, а переносимо (зайшов у хату, телепорт). */
const JUMP = 80
const FADE_S = 0.3
/** Межі затримки, мс: менше — смикається, більше — друг «відстає» від себе справжнього. */
const DELAY_MIN = 200
const DELAY_MAX = 3000
/** Запас над найгіршим застаріванням точок, мс. */
const DELAY_MARGIN = 80
/** Як швидко забуваємо пікове застарівання, мс за секунду (менше 1000 — інакше не тримає «пилку» між пачками). */
const PEAK_DECAY = 800
/**
 * Показуємо (знову) лише «живий потік»: дві пачки поспіль із новими точками не далі за STREAM_MS
 * одна від одної, і найсвіжіша — не старша за LIVE_MS. Інакше (друг щойно прийшов і ще питає
 * сервер раз на 5 с) він би постояв, а потім стрибнув.
 */
const LIVE_MS = 1500
const STREAM_MS = 1300
/** Повторне «👋 Ім'я» — не частіше. */
const GREET_EVERY_MS = 60_000
const NAME_COLOR = '#cfe8ff'

/**
 * Де був гравець у момент t (час сервера) за його точками [час, x, y, сцена].
 * Між двома точками — пропорційно; далі останньої — стоїть на ній.
 * @param {[number, number, number, string][]} s відсортовані за часом
 */
export function sampleAt(s, t) {
  if (!s.length) return null
  if (t <= s[0][0]) return { x: s[0][1], y: s[0][2], sc: s[0][3] }
  for (let i = s.length - 1; i >= 0; i--) {
    const a = s[i]
    if (a[0] > t) continue
    const b = s[i + 1]
    if (!b || a[3] !== b[3] || Math.hypot(b[1] - a[1], b[2] - a[2]) > JUMP) return { x: a[1], y: a[2], sc: a[3] }
    const k = (t - a[0]) / (b[0] - a[0])
    return { x: a[1] + (b[1] - a[1]) * k, y: a[2] + (b[2] - a[2]) * k, sc: a[3] }
  }
  return null
}

/** Злити нові точки з наявними: лише новіші за останню, не старіші за keepMs від найновішої. */
export function mergeSamples(have, incoming, keepMs = 4000) {
  let out = have
  const last = have.at(-1)?.[0] ?? -Infinity
  const fresh = incoming.filter((p) => Array.isArray(p) && p[0] > last).sort((a, b) => a[0] - b[0])
  if (fresh.length) out = [...have, ...fresh]
  const newest = out.at(-1)?.[0]
  if (newest != null && out[0][0] < newest - keepMs) out = out.filter((p) => p[0] >= newest - keepMs)
  return out
}

/** Екранний напрям ('up' | 'down' | 'left' | 'right') для руху (vx, vy) у світі — як у твого мандрівника. */
function screenDir(rig, vx, vy) {
  const sx = vx * rig.right.x + vy * rig.right.y
  const sy = vx * rig.down.x + vy * rig.down.y
  if (Math.abs(sx) > Math.abs(sy)) return sx > 0 ? 'right' : 'left'
  return sy > 0 ? 'down' : 'up'
}

/**
 * @param {{ scene3: THREE.Scene, heroGeos: THREE.BufferGeometry[], sheet: CanvasImageSource,
 *   blobTex: THREE.Texture, unitPlane: THREE.BufferGeometry, seq: number[], maxSpeed: number,
 *   anchored: (e: { ax: number, ay: number, dx: number, h: number }, out: THREE.Vector3) => THREE.Vector3,
 *   floatText: (text: string, o: object) => void }} o
 */
export function createPeers({ scene3, heroGeos, sheet, blobTex, unitPlane, seq, maxSpeed, anchored, floatText }) {
  /** @type {Map<string, object>} */
  const peers = new Map()
  let serverNow = () => Date.now()

  function create(id) {
    const canvas = document.createElement('canvas')
    const tex = crispTexture(new THREE.CanvasTexture(canvas))
    tex.colorSpace = THREE.SRGBColorSpace
    // alphaTest майже нульовий: інакше під час появи/зникнення (opacity < 0.5) спрайт зник би одразу.
    const mat = crispPixels(new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.01, depthWrite: false, opacity: 0 }))
    const mesh = new THREE.Mesh(heroGeos[0], mat)
    mesh.visible = false
    const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, opacity: 0 })
    const blob = new THREE.Mesh(unitPlane, blobMat)
    blob.scale.set(13, 1, 8)
    blob.renderOrder = -7
    blob.visible = false
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, opacity: 0 }))
    label.center.set(0.5, 0)
    label.renderOrder = 6
    label.visible = false
    scene3.add(mesh, blob, label)
    return {
      id,
      name: null,
      wearKey: null,
      samples: [],
      fx: 0,
      fy: 1,
      canvas,
      tex,
      mat,
      mesh,
      blobMat,
      blob,
      label,
      alive: true,
      alpha: 0,
      shown: false,
      placed: false,
      x: 0,
      y: 0,
      sc: null,
      rt: -Infinity,
      delay: 600,
      ageMax: 0,
      batchAt: -Infinity, // коли (час сервера) прийшла остання пачка з новими точками
      prevBatchAt: -Infinity,
      spd: 0,
      step: 0,
      dir: 'down',
      greetedAt: -Infinity,
    }
  }

  function setName(p, name) {
    if (p.name === name) return
    p.name = name
    p.label.material.map?.dispose()
    const { tex, w, h } = textTexture(name, NAME_COLOR, { size: 5, maxW: 80 })
    p.label.material.map = tex
    p.label.material.needsUpdate = true
    p.label.scale.set(w, h, 1)
  }

  function setWear(p, wear) {
    const o = outfitOf(wear)
    const key = outfitKey(o)
    if (key === p.wearKey) return
    p.wearKey = key
    composeHero(sheet, o, p.canvas)
    p.tex.needsUpdate = true
  }

  function drop(p) {
    scene3.remove(p.mesh, p.blob, p.label)
    p.mat.dispose()
    p.tex.dispose()
    p.blobMat.dispose()
    p.label.material.map?.dispose()
    p.label.material.dispose()
    peers.delete(p.id)
  }

  return {
    /** Свіжа відповідь сервера: хто є, їхні точки, одяг, імена. Кого немає — тане. */
    set(list, now) {
      if (now) serverNow = now
      const seen = new Set()
      for (const q of list ?? []) {
        if (!q || typeof q.id !== 'string' || !Array.isArray(q.s)) continue
        seen.add(q.id)
        let p = peers.get(q.id)
        if (!p) {
          p = create(q.id)
          peers.set(q.id, p)
        }
        p.alive = true
        setName(p, String(q.name ?? '').slice(0, 16) || 'Мандрівник')
        setWear(p, q.wear)
        if (Number.isFinite(q.fx) && Number.isFinite(q.fy)) {
          p.fx = q.fx
          p.fy = q.fy
        }
        const before = p.samples.at(-1)?.[0]
        p.samples = mergeSamples(p.samples, q.s)
        if (p.samples.at(-1)?.[0] !== before) {
          p.prevBatchAt = p.batchAt
          p.batchAt = serverNow()
        }
      }
      for (const p of peers.values()) if (!seen.has(p.id)) p.alive = false
    },

    /** Кадр: після того, як камера вже на місці (rig.right/down, anchored — актуальні). */
    update(dt, { sceneId, camera, rig }) {
      const now = serverNow()
      for (const p of [...peers.values()]) {
        const newest = p.samples.at(-1)
        if (!newest) {
          if (!p.alive) drop(p)
          continue
        }
        // Затримка показу: наскільки старою встигає стати найсвіжіша точка між пачками (пік «пилки»), з запасом —
        // тоді попереду майже завжди є наступна точка. Поки друга не видно (інша сцена, щойно з'являється),
        // старий пік не тримаємо: рідкі пачки (5 с / 2 с) не тягнуться за ним; беремо поточний інтервал пачок.
        // Якщо найсвіжіша точка вже в іншій сцені (пішов у хату) — плавність попереду не потрібна: затримку
        // не нарощуємо, хай дійде до дверей і зникне вчасно, а не стоїть біля них, поки рідкі пачки доходять.
        const age = now - newest[0]
        const hidden = !p.placed || p.alpha < 0.05
        const away = newest[3] !== sceneId
        const stream = Number.isFinite(p.prevBatchAt) ? p.batchAt - p.prevBatchAt : 0
        if (hidden) p.ageMax = Math.max(age, stream + 150)
        else p.ageMax = away ? p.ageMax - dt * PEAK_DECAY : Math.max(age, p.ageMax - dt * PEAK_DECAY)
        const want = Math.min(DELAY_MAX, Math.max(DELAY_MIN, p.ageMax + DELAY_MARGIN))
        const gap = want - p.delay
        // Більшати — одразу (друг просто на мить зупиниться, це природно); менше — плавно, не швидше
        // ніж +30% до ходу часу (інакше видно, як він «прискорюється»), а дуже далеко — одразу.
        if (hidden || gap > 0 || gap < -1500) p.delay = want
        else p.delay += Math.max(-dt * 300, gap * Math.min(1, dt * 3))
        // Час відтворення лише вперед (інакше друг на мить ішов би задки) і не далі найсвіжішої точки.
        p.rt = Math.min(Math.max(p.rt, now - p.delay), newest[0])
        const at = sampleAt(p.samples, p.rt)
        if (!at) continue
        // Пішов в іншу сцену (у хату чи надвір), а ми ще його бачимо — тане там, де був (біля дверей),
        // а не на місці входу в іншій сцені.
        const here = at.sc === sceneId
        const leaving = !here && p.placed && p.sc === sceneId && p.alpha > 0
        if (leaving) Object.assign(at, { x: p.x, y: p.y, sc: p.sc })

        const jump = !p.placed || at.sc !== p.sc || Math.hypot(at.x - p.x, at.y - p.y) > JUMP
        let vx = 0
        let vy = 0
        if (jump) {
          p.x = at.x
          p.y = at.y
          p.spd = 0
        } else if (dt > 0) {
          vx = (at.x - p.x) / dt
          vy = (at.y - p.y) / dt
          p.x = at.x
          p.y = at.y
          p.spd += (Math.hypot(vx, vy) - p.spd) * (1 - Math.exp(-dt * 12))
        }
        if (!leaving) p.sc = at.sc
        p.placed = true

        const moving = p.spd > 4
        if (moving && (vx || vy)) p.dir = screenDir(rig, vx, vy)
        else if (!moving) p.dir = screenDir(rig, p.fx, p.fy)
        p.step = moving ? p.step + dt * (p.spd / maxSpeed) : 0
        const fi = moving ? seq[Math.floor(p.step * 9) % seq.length] : 0

        // Ще не видно, а потік не живий (друг щойно прийшов і ще рідко питає сервер) — зачекаємо.
        const live = age < LIVE_MS && p.batchAt - p.prevBatchAt < STREAM_MS
        const target = p.alive && here && (p.alpha > 0 || live) ? 1 : 0
        p.alpha = target > p.alpha ? Math.min(1, p.alpha + dt / FADE_S) : Math.max(0, p.alpha - dt / FADE_S)
        // Це ти перейшов в іншу сцену (а він лишився там) — зникає одразу: його координати з тієї сцени
        // тут припали б на випадкове місце в кімнаті чи на острові.
        if (!here && !leaving) p.alpha = 0
        if (!p.alive && p.alpha <= 0) {
          drop(p)
          continue
        }
        // Щойно з'явився поруч (прийшов або ти зайшов туди, де він) — привітатися, але не щоразу.
        if (target && !p.shown) {
          const wall = Date.now()
          if (wall - p.greetedAt > GREET_EVERY_MS) {
            p.greetedAt = wall
            floatText(`👋 ${p.name}`, { at: { x: p.x, y: p.y, h: HERO_FRAME.h + 10 }, kind: 'calm' })
          }
        }
        p.shown = target === 1

        const vis = p.alpha > 0.01
        p.mesh.visible = p.blob.visible = p.label.visible = vis
        if (!vis) continue
        p.mat.opacity = p.alpha
        p.blobMat.opacity = p.alpha
        p.label.material.opacity = p.alpha
        p.mesh.geometry = heroGeos[heroFrameIndex(p.dir, fi)] ?? heroGeos[0]
        p.mesh.position.set(p.x, 0, p.y)
        p.mesh.quaternion.copy(camera.quaternion)
        p.blob.position.set(p.x, 0.2, p.y)
        anchored({ ax: p.x, ay: p.y, dx: 0, h: HERO_FRAME.h + 2 }, p.label.position)
      }
    },

    /** Для налагодження. */
    info() {
      return [...peers.values()].map((p) => ({ id: p.id, name: p.name, x: p.x, y: p.y, scene: p.sc, alive: p.alive, alpha: p.alpha, delay: Math.round(p.delay), samples: p.samples.length }))
    },

    dispose() {
      for (const p of [...peers.values()]) drop(p)
    },
  }
}
