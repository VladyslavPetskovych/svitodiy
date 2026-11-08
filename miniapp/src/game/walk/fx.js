import * as THREE from 'three'

/**
 * Ефекти острова: піксельні частинки (дим, вогонь, пил), «поп» для щойно поставленого,
 * текстури сяйва й бульбашок і шейдер води. Усе без алокацій у гарячому циклі:
 * частинки живуть у пулі фіксованого розміру й малюються одним викликом.
 */

/* ───────── Частинки ───────── */

export const P = { smoke: 0, fire: 1, dust: 2, puff: 3, leaf: 4 }

const FIRE = [
  [1, 0.95, 0.66],
  [1, 0.71, 0.23],
  [1, 0.42, 0.16],
  [0.47, 0.43, 0.39],
]

/**
 * Пул квадратних «пікселів» (THREE.Points зі своїм шейдером): розмір у px світу,
 * колір і прозорість на кожну частинку. Живі частинки тримаються щільно на початку
 * буфера (видалення — обміном з останньою), тож малюємо лише [0, count).
 */
export function createParticles(max = 600) {
  const pos = new Float32Array(max * 3)
  const col = new Float32Array(max * 4)
  const size = new Float32Array(max)
  const vel = new Float32Array(max * 3)
  const age = new Float32Array(max)
  const life = new Float32Array(max)
  const kind = new Uint8Array(max)
  const s0 = new Float32Array(max)
  const s1 = new Float32Array(max)
  const tint = new Float32Array(max * 3)
  let count = 0

  const geo = new THREE.BufferGeometry()
  const aPos = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage)
  const aCol = new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage)
  const aSize = new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('position', aPos)
  geo.setAttribute('color', aCol)
  geo.setAttribute('size', aSize)
  geo.setDrawRange(0, 0)

  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float size;
      attribute vec4 color;
      uniform float uScale;
      varying vec4 vColor;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(1.0, size * uScale / -mv.z);
        gl_Position = projectionMatrix * mv;
        vColor = color;
      }`,
    // Кольори вже в sRGB — пишемо як є (без перетворення простору кольорів).
    fragmentShader: /* glsl */ `
      varying vec4 vColor;
      void main() {
        if (vColor.a < 0.02) discard;
        gl_FragColor = vColor;
      }`,
    transparent: true,
    depthWrite: false,
  })
  const points = new THREE.Points(geo, mat)
  points.frustumCulled = false
  points.renderOrder = 5

  function emit(k, x, y, z, vx, vy, vz, lifeS, sizeFrom, sizeTo, rgb) {
    if (count >= max) return
    const i = count++
    pos.set([x, y, z], i * 3)
    vel.set([vx, vy, vz], i * 3)
    age[i] = 0
    life[i] = lifeS
    kind[i] = k
    s0[i] = sizeFrom
    s1[i] = sizeTo
    if (rgb) tint.set(rgb, i * 3)
  }

  function kill(i) {
    const j = --count
    if (i === j) return
    pos.copyWithin(i * 3, j * 3, j * 3 + 3)
    vel.copyWithin(i * 3, j * 3, j * 3 + 3)
    tint.copyWithin(i * 3, j * 3, j * 3 + 3)
    age[i] = age[j]
    life[i] = life[j]
    kind[i] = kind[j]
    s0[i] = s0[j]
    s1[i] = s1[j]
  }

  function update(dt) {
    for (let i = 0; i < count; ) {
      age[i] += dt
      const t = age[i] / life[i]
      if (t >= 1) {
        kill(i)
        continue
      }
      const k = kind[i]
      const o = i * 3
      if (k === P.dust || k === P.leaf) {
        vel[o + 1] -= (k === P.leaf ? 18 : 40) * dt // гравітація
        const drag = Math.exp(-(k === P.leaf ? 2 : 5) * dt)
        vel[o] *= drag
        vel[o + 2] *= drag
      }
      pos[o] += vel[o] * dt
      pos[o + 1] = Math.max(0.2, pos[o + 1] + vel[o + 1] * dt)
      pos[o + 2] += vel[o + 2] * dt
      size[i] = s0[i] + (s1[i] - s0[i]) * t
      const c = i * 4
      if (k === P.fire) {
        const f = FIRE[Math.min(3, Math.floor(t * 4))]
        col[c] = f[0]
        col[c + 1] = f[1]
        col[c + 2] = f[2]
        col[c + 3] = t > 0.75 ? 0.5 : 1
      } else {
        col[c] = tint[o]
        col[c + 1] = tint[o + 1]
        col[c + 2] = tint[o + 2]
        col[c + 3] = (k === P.smoke ? 0.75 : 0.85) * (1 - t)
      }
      i++
    }
    geo.setDrawRange(0, count)
    aPos.needsUpdate = true
    aCol.needsUpdate = true
    aSize.needsUpdate = true
  }

  const SMOKE = [0.93, 0.93, 0.91]
  const PUFF = [0.96, 0.95, 0.9]
  const rand = (a) => (Math.random() * 2 - 1) * a

  return {
    points,
    /** Скільки px екрана — один px світу на відстані 1 (оновлювати при зміні розміру). */
    setScale(v) {
      mat.uniforms.uScale.value = v
    },
    update,
    smoke(x, y, z) {
      emit(P.smoke, x + rand(1), y, z + rand(1), 3 + rand(1.5), 11 + rand(2), rand(1.5), 3, 2, 6, SMOKE)
    },
    fire(x, y, z) {
      emit(P.fire, x + rand(2), y, z + rand(1), rand(2), 13 + rand(3), rand(1), 0.55 + rand(0.1), 2, 1)
    },
    /** Пил з-під ніг / від приземлення предмета: кільце назовні. */
    dust(x, z, n = 8, spread = 1, rgb = [0.89, 0.8, 0.62]) {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + rand(0.3)
        const sp = (18 + rand(8)) * spread
        emit(P.dust, x + Math.cos(a) * 3 * spread, 0.6, z + Math.sin(a) * 2 * spread, Math.cos(a) * sp, 10 + rand(4), Math.sin(a) * sp * 0.7, 0.45 + rand(0.1), 2.6, 1, rgb)
      }
    },
    /** Хмаринка «пуф» — предмет прибрали. */
    puff(x, z, n = 14) {
      for (let k = 0; k < n; k++) {
        const a = Math.random() * Math.PI * 2
        emit(P.puff, x + rand(4), 2 + Math.random() * 10, z + rand(3), Math.cos(a) * 10, 8 + Math.random() * 10, Math.sin(a) * 6, 0.6 + rand(0.15), 4, 7, PUFF)
      }
    },
    /** Листя/травинки — посадили рослину. */
    leaves(x, z, n = 6) {
      for (let k = 0; k < n; k++) {
        const g = 0.45 + Math.random() * 0.25
        emit(P.leaf, x + rand(5), 4 + Math.random() * 8, z + rand(2), rand(14), 14 + Math.random() * 10, rand(6), 0.8, 2, 1.5, [0.35, g + 0.2, 0.25])
      }
    },
    clear() {
      count = 0
      geo.setDrawRange(0, 0)
    },
    dispose() {
      geo.dispose()
      mat.dispose()
    },
  }
}

/* ───────── «Поп»: стиснення й розтяжка з перехльостом ───────── */

export const POP_TIME = 0.5

/**
 * Масштаб [sx, sy] через t секунд після події: спершу сплющене (сквош), потім пружно
 * розтягується, перехльостує й заспокоюється рівно в 1: ефект короткий і завжди повертається до спокою.
 */
export function popScale(t, power = 1) {
  if (t >= POP_TIME) return [1, 1]
  const k = t / POP_TIME
  const d = Math.cos(k * Math.PI * 3) * (1 - k) * (1 - k) * power
  return [1 + 0.22 * d, 1 - 0.32 * d]
}

/** Падіння з невеликої висоти з легким відскоком (ease-out bounce), 0…1 → висота. */
export function dropHeight(t, from = 10, dur = 0.18) {
  if (t >= dur) return 0
  const k = t / dur
  return from * (1 - k) * (1 - k)
}

/* ───────── Текстури ───────── */

function canvasTexture(w, h, draw, { srgb = true, nearest = false } = {}) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace
  if (nearest) {
    tex.magFilter = THREE.NearestFilter
    tex.minFilter = THREE.NearestFilter
    tex.generateMipmaps = false
  }
  return tex
}

/** Кругле сяйво: центр → прозорий край. */
export function glowTexture() {
  return canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 64)
  })
}

/** Тінь-пляма під ногами. */
export function blobTexture() {
  return canvasTexture(32, 16, (ctx) => {
    ctx.fillStyle = 'rgba(11,32,16,0.35)'
    ctx.fillRect(6, 4, 20, 8)
    ctx.fillRect(4, 6, 24, 4)
  }, { nearest: true })
}

/** Промінь маяка: яскравий біля лампи, згасає до кінця. */
export function beamTexture() {
  return canvasTexture(64, 4, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 64, 0)
    g.addColorStop(0, 'rgba(255,240,170,0.55)')
    g.addColorStop(1, 'rgba(255,240,170,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 64, 4)
  })
}

/** Бульбашка врожаю з емодзі — як у старому рушії, але текстурою для 3D-спрайта. */
export function bubbleTexture(emoji) {
  return canvasTexture(96, 104, (ctx) => {
    ctx.fillStyle = 'rgba(0,0,0,0.35)'
    ctx.beginPath()
    ctx.arc(48, 54, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#fff4dc'
    ctx.strokeStyle = '#3b2a1c'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.arc(48, 46, 40, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.font = '46px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, 48, 50)
  })
}

/* ───────── Вода ───────── */

/**
 * Шейдер води: тайл 64 px з water.png (4 кадри стовпчиком), повільний дрейф
 * і хвилясте викривлення UV. Час — uniform у секундах, тож швидкість не залежить від FPS.
 *
 * ground.png темнить глибоку воду напівпрозорим синім, а за краєм мапи його немає —
 * у 3D, коли камера відʼїжджає, видно б було прямокутний «шов». Тому за межами мапи
 * продовжуємо той самий відтінок: від альфи крайового пікселя ground.png плавно до сталої.
 */
export function waterMaterial(tex, ground, size) {
  return new THREE.ShaderMaterial({
    uniforms: {
      map: { value: tex },
      ground: { value: ground },
      size: { value: new THREE.Vector2(size.w, size.h) },
      time: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D map;
      uniform sampler2D ground;
      uniform vec2 size;
      uniform float time;
      varying vec2 vWorld;
      void main() {
        vec2 p = vWorld / 64.0;
        p.x -= time * 3.0 / 64.0;
        p += 0.03 * vec2(sin(p.y * 6.2832 + time * 1.3), cos(p.x * 6.2832 + time * 1.1));
        float frame = mod(floor(time / 0.35), 4.0);
        // Кадр i займає рядки i·64…(i+1)·64 зверху; flipY — тож v рахуємо від низу.
        vec2 uv = vec2(fract(p.x), 1.0 - (frame + fract(p.y)) / 4.0);
        gl_FragColor = vec4(texture2D(map, uv).rgb, 1.0);
        #include <colorspace_fragment>
        // Продовження відтінку глибини за край мапи (усередині мапи його малює сама земля).
        float out_ = length(vWorld - clamp(vWorld, vec2(0.0), size));
        vec2 edge = clamp(vWorld, vec2(0.5), size - 0.5); // центр крайового текселя
        float edgeA = texture2D(ground, vec2(edge.x / size.x, 1.0 - edge.y / size.y)).a;
        float a = mix(edgeA, 0.4, smoothstep(0.0, 140.0, out_)) * step(0.001, out_);
        gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(15.0, 53.0, 112.0) / 255.0, a);
      }`,
    depthWrite: false,
  })
}
