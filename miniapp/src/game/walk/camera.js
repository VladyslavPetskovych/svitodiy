import * as THREE from 'three'

/**
 * Камера острова: перспектива згори під кутом, слідує за мандрівником.
 *
 * — Згладжування експоненційне (1 − e^(−k·dt)): однакове відчуття на будь-якому FPS.
 * — Look-ahead: трохи випереджає рух, щоб було видно, куди йдеш.
 * — Межі: фокус не виходить за мапу (з відступом), тож не дивимось у порожнечу.
 * — Поворот кроками по 45° і зум — плавні; тряска (game-feel) додається поверх, а не в ціль.
 * Координати фокуса — пікселі арту (x, y) = світові (X, Z).
 */

const FOV = 35
const PITCH = THREE.MathUtils.degToRad(52)
/** Скільки px арту видно по ширині за стандартного зуму — як у старому 2D-рушії. */
const VIEW = 200
const ZOOM_MIN = 0.55
const ZOOM_MAX = 1.7
const FOLLOW = 7
const LEAD_TIME = 0.22
const LEAD_MAX = 16

export function createCameraRig(aspect) {
  const camera = new THREE.PerspectiveCamera(FOV, aspect, 10, 4000)
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(FOV / 2))
  const rig = {
    camera,
    focus: { x: 0, y: 0 },
    lead: { x: 0, y: 0 },
    yaw: 0,
    yawTarget: 0,
    zoom: 1,
    zoomTarget: 1,
    bounds: { w: 512, h: 448, margin: 40 },
    trauma: 0,
    shakeT: 0,
    /** Горизонтальні напрямки екрана на землі: праворуч і «вниз екраном». */
    right: { x: 1, y: 0 },
    down: { x: 0, y: 1 },
  }
  const look = new THREE.Vector3()

  /** Відстань, за якої видно VIEW px по ширині. */
  const baseDist = () => VIEW / camera.aspect / (2 * tanHalf)

  function clampFocus(p) {
    const { w, h, margin } = rig.bounds
    const mx = Math.min(margin, w / 2)
    const my = Math.min(margin, h / 2)
    p.x = THREE.MathUtils.clamp(p.x, mx, w - mx)
    p.y = THREE.MathUtils.clamp(p.y, my, h - my)
    return p
  }

  return Object.assign(rig, {
    setAspect(a) {
      camera.aspect = a
      camera.updateProjectionMatrix()
    },
    /** Межі мапи; margin — наскільки фокус тримається від краю (більший — менше руху камери). */
    setBounds(w, h, margin = 40) {
      rig.bounds = { w, h, margin }
    },
    /** Слідувати за тілом (у фіксованому кроці не треба — викликається після руху, раз на кадр). */
    follow(x, y, vx, vy, dt) {
      const lk = 1 - Math.exp(-4 * dt)
      const lx = THREE.MathUtils.clamp(vx * LEAD_TIME, -LEAD_MAX, LEAD_MAX)
      const ly = THREE.MathUtils.clamp(vy * LEAD_TIME, -LEAD_MAX, LEAD_MAX)
      rig.lead.x += (lx - rig.lead.x) * lk
      rig.lead.y += (ly - rig.lead.y) * lk
      const want = clampFocus({ x: x + rig.lead.x, y: y + rig.lead.y })
      const k = 1 - Math.exp(-FOLLOW * dt)
      rig.focus.x += (want.x - rig.focus.x) * k
      rig.focus.y += (want.y - rig.focus.y) * k
    },
    /** Зсунути фокус (будівництво: палець тягне землю). */
    pan(dx, dy) {
      clampFocus(Object.assign(rig.focus, { x: rig.focus.x + dx, y: rig.focus.y + dy }))
    },
    /** Жорсткий переїзд (нова сцена): без «перельоту» через усю мапу. */
    snap(x, y) {
      rig.lead.x = rig.lead.y = 0
      clampFocus(Object.assign(rig.focus, { x, y }))
    },
    rotate(steps) {
      rig.yawTarget += (steps * Math.PI) / 4
    },
    /** Поворот на довільний кут (жест двома пальцями). */
    twist(rad) {
      rig.yawTarget += rad
      rig.yaw += rad
    },
    zoomBy(f) {
      rig.zoomTarget = THREE.MathUtils.clamp(rig.zoomTarget * f, ZOOM_MIN, ZOOM_MAX)
    },
    /** Тряска: травма додається, а не перезаписується; згасає сама. */
    addTrauma(a) {
      rig.trauma = Math.min(1, rig.trauma + a)
    },
    update(dt) {
      const k = 1 - Math.exp(-10 * dt)
      rig.yaw += (rig.yawTarget - rig.yaw) * k
      rig.zoom += (rig.zoomTarget - rig.zoom) * k
      const s = Math.sin(rig.yaw)
      const c = Math.cos(rig.yaw)
      rig.right = { x: c, y: -s }
      rig.down = { x: s, y: c }

      const dist = baseDist() * rig.zoom
      look.set(rig.focus.x, 8, rig.focus.y)
      camera.position.set(look.x + s * Math.cos(PITCH) * dist, look.y + Math.sin(PITCH) * dist, look.z + c * Math.cos(PITCH) * dist)

      // Тряска — зсув камери вбік/вгору, від квадрата травми (малі поштовхи ледь відчутні).
      if (rig.trauma > 0) {
        rig.trauma = Math.max(0, rig.trauma - 1.6 * dt)
        rig.shakeT += dt * 32
        const amp = 3.5 * rig.trauma * rig.trauma
        const ox = Math.sin(rig.shakeT * 1.7) * amp
        const oy = Math.sin(rig.shakeT * 2.3 + 1) * amp
        camera.position.x += rig.right.x * ox
        camera.position.z += rig.right.y * ox
        camera.position.y += oy
        look.x += rig.right.x * ox
        look.z += rig.right.y * ox
        look.y += oy
      }
      camera.lookAt(look)
    },
  })
}
