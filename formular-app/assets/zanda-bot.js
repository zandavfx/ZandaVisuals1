// ZandaVisuals bot — animovaný maskot ve stylu Samolepka 06.
// Princip převzatý z projektu bloub (jeremy-prt/bloub, MIT): jedno tělo,
// výrazy se plynule přelévají bod po bodu, život dodává pohled, mrkání
// a dýchání, ne neustálé poskakování. Bez knihoven, čisté SVG.
//
//   import { createZandaBot } from './zanda-bot.js'
//   const bot = createZandaBot(document.querySelector('#bot'), { expression: 'R02' })
//   bot.setExpression('R22')     // trvalá změna výrazu
//   bot.flash('R06', 1800)       // krátká reakce a návrat
//   bot.react('uspech')          // připravená sekvence
//   bot.setWorking(true)         // kroužící kometa při načítání

import { VYRAZY, VYRAZY_PODLE_ID } from './vyrazy.js'

export { VYRAZY, VYRAZY_PODLE_ID }

export const BARVY = { tma: '#252125', ruzova: '#E8B5CE', bila: '#FFFFFF', krem: '#FAF8F4' }

const N = 64 // bodů na jeden tah obličeje
const MORPH = 0.46 // délka přelití výrazu v sekundách
const SLOTS = [
  // [jméno, kapacita tahů, zpoždění přelití]
  ['eyeL', 2, 0],
  ['eyeR', 2, 0.015],
  ['browL', 1, 0.03],
  ['browR', 1, 0.045],
  ['bridge', 1, 0.03],
  ['mouth', 5, 0.07],
  ['cheekL', 1, 0.1],
  ['cheekR', 1, 0.1]
]
const TAU = Math.PI * 2
const { sin: S, cos: C, exp: E, abs, min, max, PI } = Math
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v)
const rad = (d) => (d * PI) / 180
const easeOutBack = (k) => {
  const q = k - 1
  return 1 + 2.3 * q * q * q + 1.3 * q * q
}
const easeOutCubic = (k) => 1 - (1 - k) ** 3
const smooth = (k) => k * k * (3 - 2 * k)
const bump = (u, a, b) => (u <= a ? smooth(u / a) : u >= b ? 0 : 1 - smooth((u - a) / (b - a)))

// ───────────────────────────── geometrie ─────────────────────────────

function flatten(d) {
  const tk = d.match(/[MmLlHhVvQqTtCcSsAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g)
  const subs = []
  let i = 0, cmd = null, x = 0, y = 0, sx = 0, sy = 0, qx = null, qy = null, cx = null, cy = null
  let cur = null
  const isNum = () => i < tk.length && !/^[A-Za-z]$/.test(tk[i])
  const n = () => parseFloat(tk[i++])
  const push = (px, py) => cur.pts.push([px, py])
  const quad = (x1, y1, x2, y2) => {
    const x0 = x, y0 = y
    for (let k = 1; k <= 16; k++) {
      const t = k / 16, m = 1 - t
      push(m * m * x0 + 2 * m * t * x1 + t * t * x2, m * m * y0 + 2 * m * t * y1 + t * t * y2)
    }
  }
  const cubic = (x1, y1, x2, y2, x3, y3) => {
    const x0 = x, y0 = y
    for (let k = 1; k <= 20; k++) {
      const t = k / 20, m = 1 - t
      push(m ** 3 * x0 + 3 * m * m * t * x1 + 3 * m * t * t * x2 + t ** 3 * x3,
        m ** 3 * y0 + 3 * m * m * t * y1 + 3 * m * t * t * y2 + t ** 3 * y3)
    }
  }
  const arc = (rx, ry, phi, fa, fs, x2, y2) => {
    const x1 = x, y1 = y
    phi = rad(phi)
    const co = C(phi), si = S(phi)
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2
    const xp = co * dx + si * dy, yp = -si * dx + co * dy
    rx = abs(rx); ry = abs(ry)
    const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam) }
    const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
    const den = rx * rx * yp * yp + ry * ry * xp * xp
    let f = Math.sqrt(max(0, num / den))
    if (fa === fs) f = -f
    const cxp = (f * rx * yp) / ry, cyp = (-f * ry * xp) / rx
    const ccx = co * cxp - si * cyp + (x1 + x2) / 2, ccy = si * cxp + co * cyp + (y1 + y2) / 2
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
    if (!fs && dt > 0) dt -= TAU
    if (fs && dt < 0) dt += TAU
    for (let k = 1; k <= 16; k++) {
      const t = t1 + (dt * k) / 16
      push(ccx + rx * C(t) * co - ry * S(t) * si, ccy + rx * C(t) * si + ry * S(t) * co)
    }
  }
  while (i < tk.length) {
    if (!isNum()) cmd = tk[i++]
    const rel = cmd === cmd.toLowerCase()
    const X = () => n() + (rel ? x : 0)
    const Y = () => n() + (rel ? y : 0)
    const U = cmd.toUpperCase()
    if (U !== 'Q' && U !== 'T') qx = null
    if (U !== 'C' && U !== 'S') cx = null
    switch (U) {
      case 'M': {
        x = X(); y = Y(); sx = x; sy = y
        cur = { pts: [[x, y]], closed: false }
        subs.push(cur)
        cmd = rel ? 'l' : 'L'
        break
      }
      case 'L': { const nx = X(), ny = Y(); x = nx; y = ny; push(x, y); break }
      case 'H': { x = n() + (rel ? x : 0); push(x, y); break }
      case 'V': { y = n() + (rel ? y : 0); push(x, y); break }
      case 'Q': {
        const x1 = X(), y1 = Y(), x2 = X(), y2 = Y()
        quad(x1, y1, x2, y2); x = x2; y = y2; qx = x1; qy = y1
        break
      }
      case 'T': {
        const x1 = qx == null ? x : 2 * x - qx, y1 = qy == null ? y : 2 * y - qy
        const x2 = X(), y2 = Y()
        quad(x1, y1, x2, y2); x = x2; y = y2; qx = x1; qy = y1
        break
      }
      case 'C': {
        const x1 = X(), y1 = Y(), x2 = X(), y2 = Y(), x3 = X(), y3 = Y()
        cubic(x1, y1, x2, y2, x3, y3); x = x3; y = y3; cx = x2; cy = y2
        break
      }
      case 'S': {
        const x1 = cx == null ? x : 2 * x - cx, y1 = cy == null ? y : 2 * y - cy
        const x2 = X(), y2 = Y(), x3 = X(), y3 = Y()
        cubic(x1, y1, x2, y2, x3, y3); x = x3; y = y3; cx = x2; cy = y2
        break
      }
      case 'A': {
        const rx = n(), ry = n(), ph = n(), fa = n(), fs = n(), x2 = X(), y2 = Y()
        arc(rx, ry, ph, fa, fs, x2, y2); x = x2; y = y2
        break
      }
      case 'Z': {
        cur.closed = true
        x = sx; y = sy
        break
      }
    }
  }
  return subs
}

function circleSub([cx, cy, r]) {
  const pts = []
  for (let k = 0; k <= 48; k++) pts.push([cx + r * C((k / 48) * TAU), cy + r * S((k / 48) * TAU)])
  return { pts, closed: true }
}

function resample(p, n) {
  const L = [0]
  for (let k = 1; k < p.length; k++) L.push(L[k - 1] + Math.hypot(p[k][0] - p[k - 1][0], p[k][1] - p[k - 1][1]))
  const total = L[L.length - 1] || 1
  const out = new Float32Array(n * 2)
  let seg = 1
  for (let j = 0; j < n; j++) {
    const s = (total * j) / n
    while (seg < p.length - 1 && L[seg] < s) seg++
    const l0 = L[seg - 1], l1 = L[seg]
    const f = l1 > l0 ? (s - l0) / (l1 - l0) : 0
    out[2 * j] = p[seg - 1][0] + (p[seg][0] - p[seg - 1][0]) * f
    out[2 * j + 1] = p[seg - 1][1] + (p[seg][1] - p[seg - 1][1]) * f
  }
  return out
}

// Každý tah se převede na uzavřenou smyčku o N bodech. Otevřená čára se
// obkreslí tam a zpět — při přelití se pak „nafoukne“ do plného tvaru
// (úsměv → otevřená pusa) místo toho, aby se kroutila.
function strokeLoop(src) {
  const sub = typeof src === 'string' ? flatten(src)[0] : circleSub(src.c)
  let p = sub.pts.map((q) => q.slice())
  if (sub.closed) {
    const a0 = p[0], a1 = p[p.length - 1]
    if (Math.hypot(a0[0] - a1[0], a0[1] - a1[1]) < 1e-6) p.pop()
    let area = 0
    for (let k = 0; k < p.length; k++) {
      const q = p[(k + 1) % p.length]
      area += p[k][0] * q[1] - q[0] * p[k][1]
    }
    if (area < 0) p.reverse()
    let best = 0
    p.forEach((q, k) => { if (q[0] < p[best][0] - 1e-6 || (abs(q[0] - p[best][0]) < 1e-6 && q[1] < p[best][1])) best = k })
    p = p.slice(best).concat(p.slice(0, best))
    p.push(p[0])
  } else {
    const a = p[0], b = p[p.length - 1]
    if (a[0] > b[0] + 0.5 || (abs(a[0] - b[0]) <= 0.5 && a[1] > b[1])) p.reverse()
    p = p.concat(p.slice(0, -1).reverse())
  }
  return resample(p, N)
}

function centroid(pts) {
  let x = 0, y = 0
  for (let j = 0; j < N; j++) { x += pts[2 * j]; y += pts[2 * j + 1] }
  return [x / N, y / N]
}

// Najde natočení a směr cílového tahu, které se nejméně kroutí vůči zdroji.
function align(A, B) {
  const [ax, ay] = centroid(A), [bx, by] = centroid(B)
  let best = Infinity, bo = 0, br = false
  for (const rev of [false, true]) {
    for (let o = 0; o < N; o++) {
      let s = 0
      for (let i = 0; i < N && s < best; i += 2) {
        const j = rev ? (((o - i) % N) + N) % N : (o + i) % N
        const dx = A[2 * i] - ax - (B[2 * j] - bx), dy = A[2 * i + 1] - ay - (B[2 * j + 1] - by)
        s += dx * dx + dy * dy
      }
      if (s < best) { best = s; bo = o; br = rev }
    }
  }
  const out = new Float32Array(N * 2)
  for (let i = 0; i < N; i++) {
    const j = br ? (((bo - i) % N) + N) % N : (bo + i) % N
    out[2 * i] = B[2 * j]; out[2 * i + 1] = B[2 * j + 1]
  }
  return out
}

const filled = ([x, y]) => {
  const out = new Float32Array(N * 2)
  for (let j = 0; j < N; j++) { out[2 * j] = x; out[2 * j + 1] = y }
  return out
}

const compiled = new Map()
export function compileExpression(id) {
  if (compiled.has(id)) return compiled.get(id)
  const v = VYRAZY_PODLE_ID[id]
  if (!v) throw new Error(`Neznámý výraz ${id}`)
  const pose = {}
  for (const [slot, cap] of SLOTS) {
    const list = v[slot] == null ? [] : Array.isArray(v[slot]) ? v[slot] : [v[slot]]
    pose[slot] = Array.from({ length: cap }, (_, i) => (list[i] ? { pts: strokeLoop(list[i]), a: 1 } : null))
  }
  compiled.set(id, pose)
  return pose
}

function makeTransition(snapshot, target, t0) {
  const tr = { t0, slots: {} }
  for (const [slot, cap, delay] of SLOTS) {
    tr.slots[slot] = []
    for (let i = 0; i < cap; i++) {
      const s = snapshot?.[slot]?.[i], tg = target[slot][i]
      const live = s && s.a > 0.04
      let e = null
      if (tg && live) e = { from: s.pts, to: align(s.pts, tg.pts), a0: s.a, a1: 1 }
      else if (tg) e = { from: filled(centroid(tg.pts)), to: tg.pts, a0: 0, a1: 1 }
      else if (live) e = { from: s.pts, to: filled(centroid(s.pts)), a0: s.a, a1: 0 }
      if (e) e.delay = delay + i * 0.025
      tr.slots[slot].push(e)
    }
  }
  return tr
}

function poseAt(tr, t) {
  const pose = {}
  for (const [slot] of SLOTS) {
    pose[slot] = tr.slots[slot].map((e) => {
      if (!e) return null
      const k = clamp((t - tr.t0 - e.delay) / MORPH)
      if (k >= 1 && e.a1 === 0) return null
      const w = easeOutBack(k)
      const pts = new Float32Array(N * 2)
      for (let j = 0; j < N * 2; j++) pts[j] = e.from[j] + (e.to[j] - e.from[j]) * w
      const ka = e.a1 > e.a0 ? easeOutCubic(clamp(k * 1.6)) : smooth(clamp(k * 1.8))
      return { pts, a: e.a0 + (e.a1 - e.a0) * ka }
    })
  }
  return pose
}

// ───────────────────────────── život ─────────────────────────────

function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SPAN = 3600
const BLINKS = (() => {
  const r = rng(0x5eed), out = []
  let t = 1.2
  while (t < SPAN) {
    out.push(t)
    if (r() < 0.18) { t += 0.24; out.push(t) }
    t += 1.8 + r() * 3.6
  }
  return out
})()
const SACCADES = (() => {
  const r = rng(0xa11ce), out = [{ t: 0, yaw: 0, pitch: 0 }]
  let t = 0.6
  while (t < SPAN) {
    const center = r() < 0.35
    out.push({ t, yaw: center ? 0 : (r() * 2 - 1) * 13, pitch: center ? 0 : (r() * 2 - 1) * 8 })
    t += 0.7 + r() * 2.6
  }
  return out
})()

function lastBefore(list, t, key = (x) => x) {
  let lo = 0, hi = list.length - 1
  if (t < key(list[0])) return -1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (key(list[mid]) <= t) lo = mid
    else hi = mid - 1
  }
  return lo
}

function lid(t) {
  const tt = t % SPAN
  const i = lastBefore(BLINKS, tt)
  if (i < 0) return 1
  const u = tt - BLINKS[i]
  if (u < 0.07) return 1 - 0.9 * smooth(u / 0.07)
  if (u < 0.2) return 0.1 + 0.9 * smooth((u - 0.07) / 0.13)
  return 1
}

function saccade(t) {
  const tt = t % SPAN
  const i = lastBefore(SACCADES, tt, (s) => s.t)
  const a = SACCADES[max(0, i - 1)], b = SACCADES[max(0, i)]
  const k = 1 - E(-(tt - b.t) / 0.045)
  return { yaw: a.yaw + (b.yaw - a.yaw) * k, pitch: a.pitch + (b.pitch - a.pitch) * k }
}

// Pohyb celé postavičky pro daný výraz. u = čas od nástupu výrazu, t = globální čas.
function motion(name, u, t) {
  const m = { x: 0, y: 0, sx: 1, sy: 1, yaw: 0, pitch: 0, roll: 0, breath: 1, gaze: 1, blink: 1 }
  const g = (k) => 1 - E(-k * u)
  switch (name) {
    case 'focus': m.pitch = -5; m.gaze = 0.3; m.breath = 0.7; break
    case 'nod': m.pitch = -14 * S(u * 11) * E(-3.2 * u); break
    case 'nod2': m.pitch = -12 * S(u * 13) * E(-2 * u); break
    case 'think': m.yaw = 12 * g(5); m.pitch = 10 * g(5); m.roll = 4 * S(t * 1.1); m.gaze = 0.35; break
    case 'retry': m.roll = 5 * S(t * 2); break
    case 'idea': m.pitch = 12 * g(6); m.gaze = 0.4; break
    case 'bounce': {
      const p = (t * 1.8) % 1
      m.y = -4 * S(PI * p)
      m.sy = 1 - 0.07 * max(0, C(TAU * p)) ** 10
      m.sx = 2 - m.sy
      m.roll = 4 * S(t * 3.6)
      break
    }
    case 'bow': { const b = bump(u, 0.18, 1.1); m.pitch = -16 * b; m.y = 1.5 * b; m.roll = 2 * S(t * 1.3); break }
    case 'laugh':
      m.y = -1.3 * abs(S(t * 15)); m.roll = 5 * S(t * 3)
      m.sy = 1 - 0.035 * abs(C(t * 15)); m.sx = 2 - m.sy; m.gaze = 0.3
      break
    case 'wink': m.roll = -8 * g(5) + 2 * S(t * 1.5); m.yaw = 6 * g(5); break
    case 'heartbeat': {
      const p = t % 1
      const b = E(-((p - 0.1) ** 2) / 0.0018) + 0.6 * E(-((p - 0.28) ** 2) / 0.0018)
      m.sx = m.sy = 1 + 0.05 * b; m.pitch = 4; m.gaze = 0.5
      break
    }
    case 'wow': m.pitch = 8 * g(6); m.sy = 1 + 0.12 * E(-3 * u); m.sx = 1 - 0.08 * E(-3 * u); m.blink = 0.3; break
    case 'groove': m.y = -1.3 * S(t * 5) ** 2; m.roll = 5 * S(t * 2.5); m.yaw = 7 * S(t * 1.25); m.gaze = 0.2; break
    case 'wait': m.yaw = 16 * S(t * 1.2); m.y = -0.9 * max(0, S(t * 9)); m.gaze = 0; break
    case 'rush': m.x = 0.5 * S(t * 37); m.yaw = 17 * Math.tanh(S(t * 1.9) * 6); m.pitch = 3 * S(t * 3.1); m.gaze = 0.2; m.blink = 1.8; break
    case 'sleep': m.pitch = -9 * g(2); m.roll = 8 * S(t * 0.7); m.breath = 2.4; m.gaze = 0; m.x = 0.6 * S(t * 0.7); break
    case 'shrug': m.roll = 9 * S(t * 1.4); m.sy = 1 - 0.035 * max(0, S(t * 2.8)); m.sx = 2 - m.sy; m.gaze = 0.5; break
    case 'shake': m.yaw = 20 * S(u * 15) * E(-2.4 * u); break
    case 'sag': m.y = 2.5 * g(4); m.sy = 1 - 0.05 * g(4); m.sx = 1 + 0.04 * g(4); m.pitch = -10 * g(4); m.gaze = 0.3; m.breath = 1.6; break
    case 'tremble': m.x = 0.55 * S(t * 47); m.y = 0.3 * S(t * 39); m.sx = 1 + 0.02 * S(t * 9); m.pitch = -4; m.gaze = 0.4; break
    case 'dizzy': m.roll = 10 * S(t * 3); m.yaw = 14 * C(t * 3); m.pitch = 6 * S(t * 3); m.gaze = 0; break
    case 'party': {
      const p = (t * 1.3) % 1
      m.y = p < 0.78 ? -6 * S((PI * p) / 0.78) : 0
      m.sy = 1 - 0.08 * E(-(((p - 0.78) * 16) ** 2)); m.sx = 2 - m.sy
      m.roll = 6 * S(t * 4); m.gaze = 0.2
      break
    }
    case 'charge': m.roll = -6 * g(5); m.y = -1.5 * abs(S(t * 7)); m.sx = 1 + 0.02 * S(t * 14); m.pitch = 4; m.yaw = 6; m.gaze = 0.4; break
    case 'watch': m.gaze = 1.6; m.blink = 0.35; break
    case 'hush': m.pitch = -4; m.roll = 3 * S(t * 0.9); m.gaze = 0.5; break
    case 'shy': m.yaw = -16 * g(4); m.pitch = -8 * g(4); m.sx = m.sy = 1 - 0.03 * g(4); m.roll = 3 * S(t * 1.7); m.x = -1 * g(4); m.gaze = 0.15; break
    case 'curious': m.roll = 12 * g(5) + 2 * S(t * 1.3); m.pitch = 5; m.gaze = 1.3; break
    case 'proud': m.pitch = 12 * g(4); m.y = -1 * g(4); m.roll = 3 * S(t * 1.2); m.gaze = 0.2; break
    case 'playful': m.roll = 9 * S(t * 2.4); m.y = -1.5 * abs(S(t * 2.4)); m.gaze = 0.5; break
    case 'relief': { const b = bump(u, 0.12, 1.4); m.sy = 1 - 0.08 * b; m.sx = 1 + 0.05 * b; m.pitch = -5 * b; m.gaze = 0.4; break }
  }
  return m
}

// Soft 3D: obličej je namalovaný na kouli, natočení hlavy ho posouvá a zkracuje.
function projector(yaw, pitch, roll) {
  const cr = C(roll), sr = S(roll), cy = C(yaw), sy = S(yaw), cp = C(pitch), sp = S(pitch)
  return (x, y) => {
    const px = x * cr - y * sr, py = x * sr + y * cr
    const pz = Math.sqrt(max(900 - px * px - py * py, 40))
    const x1 = px * cy + pz * sy
    const z1 = -px * sy + pz * cy
    let y1 = py * cp - z1 * sp
    let x2 = x1
    const rr = Math.hypot(x2, y1)
    const lim = max(18, Math.hypot(x, y) + 0.5)
    if (rr > lim) { const nr = lim + (rr - lim) * 0.3; x2 *= nr / rr; y1 *= nr / rr }
    return [x2, y1]
  }
}

// ───────────────────────────── doplňky ─────────────────────────────

const around = ([ax, ay], inner) => `translate(${ax} ${ay}) ${inner} translate(${-ax} ${-ay})`

function decorFrame(type, at, i, uIn, t, out) {
  // vrací { tf, op, draw } pro i-tý prvek doplňku
  const pop = easeOutBack(clamp((uIn - 0.1 - i * 0.12) / 0.38))
  const draw = easeOutCubic(clamp((uIn - 0.12) / 0.45))
  let tf = '', op = 1, dr = 1, sc = 1
  switch (type) {
    case 'bubbles': {
      const bob = S(t * 2.2 + i * 1.3) * 1.3
      sc = pop * (1 + 0.08 * S(t * 3 + i))
      tf = `translate(0 ${bob.toFixed(2)})`
      break
    }
    case 'retry': {
      const ph = (t % 1.7) / 1.7
      const a = ph < 0.35 ? easeOutCubic(ph / 0.35) : 1 - smooth((ph - 0.35) / 0.65)
      tf = around(at, `rotate(${(-28 * a).toFixed(2)})`)
      dr = draw
      break
    }
    case 'idea': {
      const p = max(0, S(t * 5)) ** 2
      sc = 1 + 0.14 * p
      op = 0.55 + 0.45 * p
      dr = draw
      break
    }
    case 'sparkle':
      sc = pop * (1 + 0.28 * max(0, S(t * 4)) ** 3)
      tf = around(at, `rotate(${(22 * S(t * 2.4)).toFixed(2)})`)
      break
    case 'zzz': {
      const p = (t / 2.4 + i * 0.5) % 1
      tf = `translate(${(p * 5 - 1).toFixed(2)} ${(-p * 9 + 3).toFixed(2)})`
      sc = (0.5 + 0.6 * p) * min(1, uIn * 3)
      op = S(PI * p)
      break
    }
    case 'question':
      tf = around([at[0], at[1] + 2], `rotate(${(12 * S(t * 2.6)).toFixed(2)})`)
      dr = draw
      sc = 0.6 + 0.4 * pop
      break
    case 'sweat': case 'tear': {
      const per = type === 'sweat' ? 1.7 : 2.6
      const p = (t / per) % 1
      tf = `translate(${type === 'tear' ? (-p).toFixed(2) : 0} ${(p * (type === 'sweat' ? 6 : 7)).toFixed(2)})`
      op = p < 0.15 ? p / 0.15 : 1 - smooth((p - 0.15) / 0.85)
      sc = (1 - 0.25 * p) * pop
      break
    }
    case 'hat': {
      const k = easeOutBack(clamp((uIn - 0.05) / 0.5))
      tf = `translate(0 ${(-10 * (1 - k)).toFixed(2)}) ` + around(at, `rotate(${(7 * S(t * 5.2)).toFixed(2)})`)
      op = clamp(uIn * 4)
      break
    }
    case 'burst': {
      const p = (t * 1.3) % 1
      sc = 0.85 + 0.3 * easeOutCubic(p)
      op = (1 - p) * clamp(uIn * 3)
      break
    }
    case 'bolt':
      op = S(t * 23) > 0.72 ? 0.3 : 1
      tf = `translate(${(0.4 * S(t * 41)).toFixed(2)} ${(0.3 * C(t * 37)).toFixed(2)})`
      dr = easeOutCubic(clamp((uIn - 0.1) / 0.25))
      break
    case 'whoosh': {
      const p = (t / 1.6) % 1
      tf = `translate(${(p * 5 - 2).toFixed(2)} 0)`
      op = S(PI * p) * clamp(uIn * 3)
      dr = clamp(p * 2.5)
      break
    }
  }
  if (out != null) {
    const k = clamp(out / 0.22)
    sc *= 1 - 0.45 * k
    op *= 1 - k
  }
  if (sc !== 1) tf += ' ' + around(at, `scale(${max(0.001, sc).toFixed(3)})`)
  return { tf, op, dr }
}

// ───────────────────────────── statický náhled ─────────────────────────────

function asPathD(src) {
  if (typeof src === 'string') return `<path d="${src}"/>`
  const [cx, cy, r] = src.c
  return `<circle cx="${cx}" cy="${cy}" r="${r}"/>`
}

export function staticSvg(id, { label = true } = {}) {
  const v = VYRAZY_PODLE_ID[id]
  const parts = []
  for (const [slot] of SLOTS) {
    const list = v[slot] == null ? [] : Array.isArray(v[slot]) ? v[slot] : [v[slot]]
    list.forEach((s) => parts.push(asPathD(s)))
  }
  for (const dc of v.decor || []) dc.d.forEach((s) => parts.push(asPathD(s)))
  const body = '<circle cx="32" cy="32" r="24"/>'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"${label ? ` role="img" aria-label="${v.name}"` : ' aria-hidden="true"'}>` +
    `<g fill="${BARVY.tma}" stroke="${BARVY.tma}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" transform="translate(2 3)">${body}</g>` +
    `<g fill="${BARVY.ruzova}" stroke="${BARVY.bila}" stroke-width="7">${body}</g>` +
    `<g fill="none" stroke="${BARVY.tma}" stroke-width="1.8">${body}</g>` +
    `<g fill="none" stroke="${BARVY.tma}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${parts.join('')}</g></svg>`
}

// ───────────────────────────── živý bot ─────────────────────────────

const NS = 'http://www.w3.org/2000/svg'
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag)
  for (const k in attrs) e.setAttribute(k, attrs[k])
  if (parent) parent.appendChild(e)
  return e
}

const HAPPY = ['R02', 'R09', 'R10', 'R22', 'R29', 'R07', 'R11', 'R28']
const IDLE_TICS = ['R10', 'R27', 'R24', 'R03', 'R29', 'R13']

export function createZandaBot(host, options = {}) {
  const o = {
    expression: 'R02',
    followPointer: true,
    interactive: true,
    idle: true,
    sleepAfter: 45, // s bez interakce
    ticEvery: [8, 15], // s mezi samovolnými drobnostmi
    timeScale: 1,
    label: 'Maskot ZandaVisuals',
    ...options
  }
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  const amp = reduced ? 0.35 : 1

  const svg = el('svg', { viewBox: '-8 -12 80 82', role: 'img', 'aria-label': o.label, class: 'zanda-bot' })
  svg.style.overflow = 'visible'
  svg.style.display = 'block'
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.touchAction = 'manipulation'
  if (o.interactive) svg.style.cursor = 'pointer'
  const title = el('title', {}, svg)
  const root = el('g', {}, svg)
  const shadow = el('path', { fill: BARVY.tma, stroke: BARVY.tma, 'stroke-width': 6, 'stroke-linejoin': 'round' }, root)
  const body = el('path', { fill: BARVY.ruzova, stroke: BARVY.bila, 'stroke-width': 7, 'stroke-linejoin': 'round' }, root)
  const outline = el('path', { fill: 'none', stroke: BARVY.tma, 'stroke-width': 1.8, 'stroke-linejoin': 'round' }, root)
  const common = { fill: 'none', stroke: BARVY.tma, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }
  const decorLayer = el('g', common, root)
  const face = el('g', common, root)
  const orbit = el('g', { opacity: 0 }, svg)
  const trail = Array.from({ length: 10 }, () => el('path', { ...common, 'stroke-width': 2.6 }, orbit))
  const comet = el('circle', { r: 2.4, fill: BARVY.tma }, orbit)
  const strokes = {}
  for (const [slot, cap] of SLOTS) strokes[slot] = Array.from({ length: cap }, () => el('path', { 'stroke-width': 2.6 }, face))
  host.appendChild(svg)

  let clock = 0
  let last = null
  let current = null
  let base = o.expression
  let since = 0
  let tr = null
  const impulses = []
  let decors = []
  const queue = []
  let working = null // { on, t }
  let lastInteraction = 0
  let nextTic = o.ticEvery[0]
  let sleeping = false
  let holdId = null
  let appear = null // příchod / odchod: { kind: 'in' | 'out', t, cb, fired }
  let pendingDt = 0
  let hovering = false
  let pressed = null
  const pointer = { x: 0, y: 0, seen: -99 }
  const gaze = { yaw: 0, pitch: 0, w: 0 }
  let raf = 0
  let destroyed = false

  function spawnDecor(id) {
    for (const d of decors) if (d.out == null) d.out = clock
    const v = VYRAZY_PODLE_ID[id]
    for (const dc of v.decor || []) {
      const g = el('g', {}, decorLayer)
      const copies = dc.type === 'zzz' ? 2 : 1
      const items = []
      for (let c = 0; c < copies; c++) {
        for (const src of dc.d) {
          const gi = el('g', {}, g)
          const shape = typeof src === 'string'
            ? el('path', { d: src, 'stroke-width': 2.6, pathLength: 1, 'stroke-dasharray': '1 1' }, gi)
            : el('circle', { cx: src.c[0], cy: src.c[1], r: src.c[2], 'stroke-width': 2.6 }, gi)
          items.push({ gi, shape })
        }
      }
      decors.push({ ...dc, g, items, t0: clock, out: null })
    }
  }

  function setExpressionNow(id) {
    if (!VYRAZY_PODLE_ID[id]) return
    const snap = tr ? poseAt(tr, clock) : null
    tr = makeTransition(snap, compileExpression(id), clock)
    if (id !== current) {
      const energy = VYRAZY_PODLE_ID[id].energy || 0.15
      impulses.push({ t: clock, amp: (0.035 + 0.045 * energy) * amp, hop: energy * amp, phase: Math.random() * TAU })
      if (impulses.length > 4) impulses.shift()
      spawnDecor(id)
      since = clock
    }
    current = id
    title.textContent = `${o.label}: ${VYRAZY_PODLE_ID[id].name}`
  }

  function schedule(steps) {
    queue.length = 0
    let at = clock
    for (const [id, ms] of steps) {
      queue.push({ at, id })
      at += ms / 1000
    }
    queue.push({ at, id: null })
  }

  const api = {
    get expression() { return current },
    get time() { return clock },
    setExpression(id) { queue.length = 0; base = id; sleeping = false; setExpressionNow(id) },
    flash(id, ms = 1600) { schedule([[id, ms]]) },
    sequence(steps) { schedule(steps) },
    poke() { lastInteraction = clock; if (sleeping) wake() },
    react(kind) {
      api.poke()
      switch (kind) {
        case 'uspech': schedule([['R05', 900], ['R22', 2200], ['R28', 1300]]); break
        case 'chyba': schedule([['R18', 1000], ['R19', 1900]]); break
        case 'zprava': schedule([['R12', 700], ['R06', 1900]]); break
        case 'ahoj': schedule([['R10', 1100], ['R02', 1400]]); break
        case 'nacitani': api.setWorking(true); break
        case 'hotovo': api.setWorking(false); schedule([['R05', 1800]]); break
        case 'spanek': queue.length = 0; sleeping = true; setExpressionNow('R16'); break
        default: schedule([[HAPPY[Math.floor(Math.random() * HAPPY.length)], 1700]])
      }
    },
    hold(id) {
      holdId = id && VYRAZY_PODLE_ID[id] ? id : null
      if (!queue.length) setExpressionNow(restId())
    },
    setWorking(on) {
      if (on && !working?.on) { working = { on: true, t: clock }; queue.length = 0; setExpressionNow('R03') }
      if (!on && working?.on) { working = { on: false, t: clock }; if (current === 'R03' && !queue.length) setExpressionNow(restId()) }
    },
    // Příchod: bot vyskočí zespodu, rozhlédne se a mrkne.
    intro() {
      appear = { kind: 'in', t: clock }
      schedule([['R12', 500], ['R10', 950]])
    },
    // Odchod: poděkuje, nadechne se a zmizí dolů; pak zavolá done().
    outro(done) {
      queue.length = 0
      setExpressionNow('R08')
      appear = { kind: 'out', t: clock, cb: done, fired: false }
    },
    impulse(strength = 1) { impulses.push({ t: clock, amp: 0.07 * strength * amp, hop: 0.6 * strength * amp, phase: Math.random() * TAU }) },
    set(opts) { Object.assign(o, opts) },
    destroy() { destroyed = true; cancelAnimationFrame(raf); off(); svg.remove() }
  }

  function restId() {
    return holdId ?? (working?.on ? 'R03' : sleeping ? 'R16' : base)
  }

  function wake() {
    sleeping = false
    schedule([['R12', 800], ['R02', 1000]])
  }

  // ── interakce
  const onMove = (e) => {
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = clock
    lastInteraction = clock
    if (sleeping) wake()
  }
  const onEnter = () => { hovering = true; api.poke(); if (!queue.length && !working?.on) schedule([['R27', 1300]]) }
  const onLeave = () => { hovering = false }
  const onDown = () => { pressed = clock; api.poke() }
  const onUp = () => { pressed = null }
  const onClick = () => {
    pressed = null
    api.impulse(1.2)
    api.react('klik')
    o.onClick?.(api)
  }
  const onKey = (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    onClick()
  }
  const onVis = () => { last = null }
  addEventListener('pointermove', onMove, { passive: true })
  document.addEventListener('visibilitychange', onVis)
  if (o.interactive) {
    svg.addEventListener('pointerenter', onEnter)
    svg.addEventListener('pointerleave', onLeave)
    svg.addEventListener('pointerdown', onDown)
    svg.addEventListener('click', onClick)
    svg.addEventListener('keydown', onKey)
    svg.setAttribute('tabindex', '0')
    svg.setAttribute('role', 'button')
    addEventListener('pointerup', onUp)
  }
  function off() {
    removeEventListener('pointermove', onMove)
    document.removeEventListener('visibilitychange', onVis)
    svg.removeEventListener('pointerenter', onEnter)
    svg.removeEventListener('pointerleave', onLeave)
    svg.removeEventListener('pointerdown', onDown)
    svg.removeEventListener('click', onClick)
    svg.removeEventListener('keydown', onKey)
    removeEventListener('pointerup', onUp)
  }

  const fx = (n) => n.toFixed(2)

  function frame(now) {
    if (destroyed) return
    const dt = last == null ? 0 : min(0.05, (now - last) / 1000)
    last = now
    // Spící bot stačí kreslit ~20× za sekundu.
    pendingDt += dt
    if (!sleeping || pendingDt >= 0.05) {
      step(pendingDt * o.timeScale, pendingDt)
      pendingDt = 0
    }
    raf = requestAnimationFrame(frame)
  }

  // Posune čas bota o dt sekund a překreslí ho (ruční režim: autoplay: false).
  function step(dtBot, dtReal = dtBot) {
    clock += dtBot
    const t = clock
    const dt = dtReal

    // fronta krátkých reakcí
    while (queue.length && queue[0].at <= t) {
      const q = queue.shift()
      setExpressionNow(q.id ?? restId())
    }
    // samovolné drobnosti a usínání
    if (o.idle && !queue.length && !working?.on && !sleeping && !hovering && !holdId) {
      if (t - lastInteraction > o.sleepAfter) { sleeping = true; setExpressionNow('R16') }
      else if (t > nextTic) {
        nextTic = t + o.ticEvery[0] + Math.random() * (o.ticEvery[1] - o.ticEvery[0])
        if (current === base) schedule([[IDLE_TICS[Math.floor(Math.random() * IDLE_TICS.length)], 1800 + Math.random() * 900]])
      }
    }

    const v = VYRAZY_PODLE_ID[current]
    const u = t - since
    const m = motion(v.motion, u, t)

    // vstupní poskok + želé
    let hopY = 0, jx = 0, jy = 0
    const waves = []
    for (const im of impulses) {
      const k = t - im.t
      if (k > 3) continue
      if (k < 0.42) hopY -= im.hop * 5 * S((PI * k) / 0.42)
      const w = im.amp * E(-4.2 * k) * S(17 * k)
      jx += w; jy -= w
      waves.push({ w: im.amp * E(-3.2 * k) * S(13 * k + 0.6) * 0.5, ph: im.phase })
    }
    if (pressed != null) { const k = clamp((t - pressed) / 0.12); jy -= 0.07 * k; jx += 0.05 * k }

    // příchod / odchod
    let ap = 1, apY = 0, apSy = 1
    if (appear) {
      const k = t - appear.t
      if (appear.kind === 'in') {
        const q = clamp(k / 0.6)
        ap = reduced ? smooth(q) : easeOutBack(q)
        apY = (1 - easeOutCubic(q)) * 16 * amp
        apSy = 1 + 0.1 * amp * E(-5 * k) * S(15 * k)
        if (k > 1.4) appear = null
      } else {
        const pre = bump(k, 0.16, 0.32)
        const q = clamp((k - 0.3) / 0.32)
        const e = q * q * (2.4 * q - 1.4)
        apSy = 1 + 0.09 * amp * pre
        ap = clamp(1 - e, 0, 1.2)
        apY = (-3 * pre + 14 * clamp(e)) * amp
        if (q >= 1 && !appear.fired) {
          appear.fired = true
          ap = 0
          appear.cb?.()
        }
        if (q >= 1) ap = 0
      }
    }

    const breath = 1 + 0.012 * amp * m.breath * S((TAU * t) / 3.6)
    const sx = (1 + (m.sx - 1) * amp) * (1 + jx) * (1 + (breath - 1) * 0.6)
    const sy = (1 + (m.sy - 1) * amp) * (1 + jy) * breath
    const ty = m.y * amp + hopY + apY
    const sa = max(0.001, ap)
    root.setAttribute('transform', `translate(${fx(32 + m.x * amp)} ${fx(56 + ty)}) scale(${(sx * sa).toFixed(4)} ${(sy * sa * apSy).toFixed(4)}) translate(-32 -56)`)
    svg.style.visibility = ap <= 0.001 ? 'hidden' : ''

    // tělo — kruh s jemným želé chvěním
    let d = ''
    const R = 64
    const pts = []
    for (let k = 0; k < R; k++) {
      const a = (k / R) * TAU
      let r = 24
      for (const wv of waves) r += 24 * wv.w * (0.6 * C(2 * a + wv.ph) + 0.4 * C(3 * a + wv.ph * 1.7))
      pts.push([32 + r * C(a), 32 + r * S(a)])
    }
    for (let k = 0; k < R; k++) {
      const p = pts[k], q = pts[(k + 1) % R]
      const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2
      if (k === 0) { const z = pts[R - 1]; d += `M${fx((z[0] + p[0]) / 2)} ${fx((z[1] + p[1]) / 2)}` }
      d += `Q${fx(p[0])} ${fx(p[1])} ${fx(mx)} ${fx(my)}`
    }
    d += 'Z'
    body.setAttribute('d', d)
    outline.setAttribute('d', d)
    shadow.setAttribute('d', d)
    shadow.setAttribute('transform', 'translate(2 3)')

    // pohled: kurzor > sakády
    const sac = saccade(t)
    let wantW = 0, pYaw = 0, pPitch = 0
    if (o.followPointer && t - pointer.seen < 2.5 && m.gaze > 0.05) {
      const rect = svg.getBoundingClientRect()
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
      const span = max(240, rect.width * 2.2)
      pYaw = 17 * Math.tanh((pointer.x - cx) / span)
      pPitch = -12 * Math.tanh((pointer.y - cy) / span)
      wantW = min(1, m.gaze)
    }
    const f = 1 - E(-dt * 10)
    gaze.w += (wantW - gaze.w) * f
    gaze.yaw += (pYaw - gaze.yaw) * f
    gaze.pitch += (pPitch - gaze.pitch) * f
    const gw = gaze.w
    const yaw = m.yaw * amp + (1 - gw) * sac.yaw * m.gaze * amp + gw * gaze.yaw * min(1.2, m.gaze)
    const pitch = m.pitch * amp + (1 - gw) * sac.pitch * m.gaze * amp + gw * gaze.pitch * min(1.2, m.gaze)
    const roll = m.roll * amp
    const proj = projector(rad(yaw), rad(pitch), rad(roll))

    // obličej
    const pose = poseAt(tr, t)
    const blinkOk = v.blink !== false
    const lidK = blinkOk ? lid(t * m.blink) : 1
    for (const [slot, cap] of SLOTS) {
      for (let i = 0; i < cap; i++) {
        const node = strokes[slot][i]
        const s = pose[slot][i]
        if (!s || s.a < 0.01) { if (node.getAttribute('d')) node.setAttribute('d', ''); continue }
        const P = s.pts
        const [ccx, ccy] = slot.startsWith('eye') ? centroid(P) : [0, 0]
        let fxK = null
        if (slot.startsWith('eye')) {
          if (v.eyeFx === 'twinkle') fxK = { rot: rad(14 * S(t * 3 + (slot === 'eyeR' ? 1 : 0))), sc: 1 + 0.1 * S(t * 6) }
          else if (v.eyeFx === 'beat') { const p = t % 1; fxK = { rot: 0, sc: 1 + 0.14 * (E(-((p - 0.1) ** 2) / 0.0018) + 0.6 * E(-((p - 0.28) ** 2) / 0.0018)) } }
          else if (v.eyeFx === 'spin') fxK = { rot: t * 4 * (slot === 'eyeR' ? -1 : 1), sc: 1 }
        }
        let [ex, ey] = [ccx, ccy]
        if (v.mouthFx === 'tongue' && slot === 'mouth' && i === 1) { fxK = { rot: rad(10 * S(t * 7)), sc: 1 }; ex = 34; ey = 39 }
        if (v.cheekFx === 'blush' && slot.startsWith('cheek')) { fxK = { rot: 0, sc: 1 + 0.18 * S(t * 3) }; [ex, ey] = centroid(P) }
        let out = ''
        for (let j = 0; j < N; j++) {
          let x = P[2 * j], y = P[2 * j + 1]
          if (fxK) {
            const dx = (x - ex) * fxK.sc, dy = (y - ey) * fxK.sc
            const cr = C(fxK.rot), sr = S(fxK.rot)
            x = ex + dx * cr - dy * sr; y = ey + dx * sr + dy * cr
          }
          if (slot.startsWith('eye') && lidK < 1) y = ccy + (y - ccy) * lidK
          const [qx, qy] = proj(x - 32, y - 32)
          out += (j ? 'L' : 'M') + fx(qx + 32) + ' ' + fx(qy + 32)
        }
        node.setAttribute('d', out + 'Z')
        node.setAttribute('stroke-width', fx(2.6 * min(1, s.a * 1.15)))
        node.setAttribute('opacity', fx(min(1, s.a * 1.4)))
      }
    }

    // doplňky
    const [hx, hy] = proj(0, 0)
    const shift = `translate(${fx(hx * 0.35)} ${fx(hy * 0.35)}) rotate(${fx(roll * 0.5)} 32 32)`
    decors = decors.filter((dc) => {
      const outK = dc.out == null ? null : t - dc.out
      if (outK != null && outK > 0.25) { dc.g.remove(); return false }
      dc.g.setAttribute('transform', dc.face ? `translate(${fx(hx)} ${fx(hy)}) rotate(${fx(roll)} 32 32)` : shift)
      const n = dc.items.length / (dc.type === 'zzz' ? 2 : 1)
      dc.items.forEach((it, idx) => {
        const fr = decorFrame(dc.type, dc.at, dc.type === 'zzz' ? Math.floor(idx / n) : idx, t - dc.t0, t, outK)
        it.gi.setAttribute('transform', fr.tf)
        it.gi.setAttribute('opacity', fx(clamp(fr.op)))
        if (it.shape.tagName === 'path') it.shape.setAttribute('stroke-dashoffset', (1 - fr.dr).toFixed(3))
      })
      return true
    })

    // kometa při práci
    if (working) {
      const k = working.on ? clamp((t - working.t) / 0.35) : 1 - clamp((t - working.t) / 0.3)
      orbit.setAttribute('opacity', fx(k * clamp(ap)))
      if (k > 0) {
        const head = t * 4.4
        const rr = 32.5
        const cyy = 32 + ty
        comet.setAttribute('cx', fx(32 + rr * C(head)))
        comet.setAttribute('cy', fx(cyy + rr * S(head)))
        trail.forEach((p, i) => {
          const a0 = head - (i + 1) * 0.16, a1 = head - i * 0.16
          p.setAttribute('d', `M${fx(32 + rr * C(a0))} ${fx(cyy + rr * S(a0))}A${rr} ${rr} 0 0 1 ${fx(32 + rr * C(a1))} ${fx(cyy + rr * S(a1))}`)
          p.setAttribute('stroke-width', fx(2.6 * (1 - i / trail.length)))
          p.setAttribute('opacity', fx(1 - i / trail.length))
        })
      } else if (!working.on) working = null
    }
  }

  api.step = (dt) => step(dt, 1)
  setExpressionNow(o.expression)
  if (o.intro) api.intro()
  if (o.autoplay !== false) raf = requestAnimationFrame(frame)
  else step(0)
  return api
}

export default createZandaBot
