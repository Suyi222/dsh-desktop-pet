/**
 * The desktop-pet widget: one official-whale mark over the shell overlay,
 * driven by the petStatus Remote snapshot. The whale motion is a rAF
 * physics loop (per-phase ease targets, a springy jump, and a rare charged
 * dive with a 360° spin timed to the water entry); the whale stands in a
 * circular sea whose level mirrors the API balance and whose surface
 * ripples with a scrolling wave plus a slow tide.
 */

import { useEffect, useRef, useState, type CSSProperties, type JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PetPhase, PetSnapshotValue } from '../client.ts'
import { NS, type PetKey } from './locales.ts'
import { WHALE_PATH } from './whale.ts'
import css from './Pet.module.css'

/** Registration-side business face: the snapshot source bound as `usePetSnapshot`. */
export interface PetInjected {
  hooks: {
    petSnapshot: SnapshotStore<PetSnapshotValue | null>
  }
}

/** Full props for the shell-overlay pet entry. */
export type PetProps = PropsRuntime<'shell.overlay'> & InjectFace<PetInjected> & PropsLocale<typeof NS>

/**
 * Sea-level geometry in stage pixels: the wave baseline travels the full
 * circle height, so the visible water height as a fraction of the circle
 * equals the balance percentage (level 0 → bottom edge 104, level 1 → top
 * edge 8).
 */
const SEA_TOP = 8
const SEA_BOTTOM = 104

/** One phase's physics targets: bob amplitude/frequency, sway, and jitter. */
interface PhaseTargets {
  readonly amp: number
  readonly freq: number
  readonly rotAmp: number
  readonly jitter: number
}

const TARGETS: Record<PetPhase, PhaseTargets> = {
  idle: { amp: 3, freq: 1.1, rotAmp: 0.6, jitter: 0 },
  thinking: { amp: 2.5, freq: 0.9, rotAmp: 2.8, jitter: 0 },
  working: { amp: 4.5, freq: 2.3, rotAmp: 2, jitter: 0.7 },
  error: { amp: 1, freq: 0, rotAmp: 0, jitter: 2.4 },
}

const PHASE_LABEL_KEY: Record<PetPhase, PetKey> = {
  idle: 'phase.idle',
  thinking: 'phase.thinking',
  working: 'phase.working',
  error: 'phase.error',
}

const CHATTER_KEYS: Record<PetPhase, readonly PetKey[]> = {
  idle: ['chatter.idle', 'chatter.idle2', 'chatter.idle3', 'chatter.idle4'],
  thinking: ['chatter.thinking', 'chatter.thinking2', 'chatter.thinking3'],
  working: ['chatter.working', 'chatter.working2', 'chatter.working3'],
  error: ['chatter.error', 'chatter.error2', 'chatter.error3'],
}

const LOW_KEYS: readonly PetKey[] = ['chatter.low', 'chatter.low2', 'chatter.low3']

const DIVE_KEYS: readonly PetKey[] = ['chatter.dive', 'chatter.dive2', 'chatter.dive3']

const HEART_EMOJIS = ['❤️', '💙', '💛', '💚', '🧡'] as const

/** One random floating heart. */
interface Heart {
  readonly id: number
  readonly hx: number
  readonly hy: number
  readonly hdx: number
  readonly hr: number
  readonly hdr: number
  readonly hs: number
  readonly size: number
  readonly emoji: string
}

interface SavedPos {
  readonly x: number
  readonly y: number
}

interface DragState {
  readonly startX: number
  readonly startY: number
  readonly baseX: number
  readonly baseY: number
  moved: boolean
}

interface Particle {
  readonly el: HTMLSpanElement
  readonly kind: 'bubble' | 'drop' | 'ring'
  x: number
  y: number
  vx: number
  vy: number
  t: number
  readonly seed: number
}

/** The whale physics state mutated by the rAF loop. */
interface WhaleState {
  t: number
  ph: number
  jumpY: number
  vy: number
  jumping: boolean
  squash: number
  cAmp: number
  cFreq: number
  cRot: number
  cJit: number
  lowRot: number
  bubbleTimer: number
  rare: number
  spinDeg: number
  flightT: number
  tilt: number
  charging: number
  charge: number
  /** Dive landing hit count: 0 = airborne, 1 = big splash + high rebound, 2 = small hop, 3 = settle. */
  bounced: number
}

function whaleState(): WhaleState {
  return {
    t: 0, ph: 0, jumpY: 0, vy: 0, jumping: false, squash: 1,
    cAmp: 3, cFreq: 1.1, cRot: 0.6, cJit: 0, lowRot: 0, bubbleTimer: 0,
    rare: 0, spinDeg: 0, flightT: 0, tilt: 0, charging: 0, charge: 0, bounced: 0,
  }
}

/** Read the persisted position; storage failures fall back to the corner anchor. */
function readPos(): SavedPos | null {
  try {
    const raw = localStorage.getItem('dsh-pet-pos')
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Partial<SavedPos>
    return typeof parsed.x === 'number' && typeof parsed.y === 'number'
      ? { x: parsed.x, y: parsed.y }
      : null
  } catch {
    // Storage can be unavailable (private mode, quota); the corner anchor is the fallback.
    return null
  }
}

/** Persist the dragged position; failures are ignored — the corner anchor returns. */
function savePos(pos: SavedPos): void {
  try {
    localStorage.setItem('dsh-pet-pos', JSON.stringify(pos))
  } catch {
    // Storage can be unavailable (private mode, quota); the corner anchor is the fallback.
  }
}

function clampX(x: number): number {
  return typeof window === 'undefined' || window.innerWidth === 0 ? x : Math.min(Math.max(x, 4), window.innerWidth - 106)
}

function clampY(y: number): number {
  return typeof window === 'undefined' || window.innerHeight === 0 ? y : Math.min(Math.max(y, 4), window.innerHeight - 174)
}

function currencySymbol(currency: string | null): string {
  if (currency === 'CNY') return '¥'
  if (currency === 'USD') return '$'
  return currency ?? ''
}

/**
 * The pet entry: one whale mark standing in a circular sea, with a status
 * pill. The balance reads as the sea level under the mark.
 * @param props - the four-share props (usePetSnapshot + `t`).
 * @returns the widget element.
 */
export function Pet(props: PetProps): JSX.Element {
  const { usePetSnapshot, t } = props
  const snapshot = usePetSnapshot(s => s)
  const phase: PetPhase = snapshot?.phase ?? 'idle'
  const low = snapshot?.balance != null && snapshot.balance < snapshot.balanceScale * 0.2

  const [minimized, setMinimized] = useState(false)
  const [extra, setExtra] = useState<{ text: string; key: number } | null>(null)
  const [hearts, setHearts] = useState<Heart[]>([])
  const [pos] = useState<SavedPos | null>(readPos)

  const nodeRef = useRef<HTMLDivElement>(null)
  const fxRef = useRef<HTMLDivElement>(null)
  const seaRef = useRef<SVGGElement>(null)
  const whaleRef = useRef<HTMLDivElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const phaseRef = useRef<PetPhase>('idle')
  const lowRef = useRef(false)
  const levelRef = useRef(0.5)
  const seaLevelRef = useRef({ disp: 0.5, init: false })
  const whaleStateRef = useRef<WhaleState>(whaleState())
  const dragRef = useRef<DragState | null>(null)
  const lastBalanceRef = useRef<number | null>(null)

  const scale = snapshot?.balanceScale ?? 500
  const balance = snapshot?.balance
  if (balance != null) lastBalanceRef.current = balance
  const shownBalance = balance ?? lastBalanceRef.current
  // Linear mapping: balanceScale is the amount at which the sea reads full.
  const level = shownBalance == null || !(scale > 0)
    ? 0.5
    : Math.min(1, Math.max(0, shownBalance / scale))

  useEffect(() => {
    phaseRef.current = phase
    lowRef.current = low
  }, [phase, low])

  useEffect(() => {
    levelRef.current = level
  }, [level])

  useEffect(() => {
    let raf = 0
    let last = 0
    let time = 0
    const m = whaleStateRef.current
    const loop = (ts: number): void => {
      raf = requestAnimationFrame(loop)
      // rAF timestamp: vsync-aligned; cap dt so a busy main thread slows the
      // motion instead of stepping it (first frame after a stall never jumps).
      const dt = last === 0 ? 0 : Math.min(0.025, (ts - last) / 1000)
      last = ts
      time += dt

      const sea = seaRef.current
      if (sea !== null) {
        const state = seaLevelRef.current
        if (!state.init) {
          state.init = true
          state.disp = levelRef.current
        }
        state.disp += (levelRef.current - state.disp) * (1 - Math.exp(-dt * 1.6))
        const tide = Math.sin(time * 0.6) * 1.5
        sea.style.transform = `translateY(${(SEA_BOTTOM - (SEA_BOTTOM - SEA_TOP) * state.disp + tide).toFixed(2)}px)`
      }

      const node = whaleRef.current
      if (node !== null) updateWhale(node, m, dt)

      if (phaseRef.current === 'thinking') {
        m.bubbleTimer += dt
        if (m.bubbleTimer > 0.4) {
          m.bubbleTimer = 0
          spawnBubble()
        }
      }
      updateParticles(dt)
    }
    loop(0)
    return () => { cancelAnimationFrame(raf) }
  }, [])

  /** Advance the whale physics one frame: ease targets, jump/dive, and pose. */
  const updateWhale = (node: HTMLDivElement, m: WhaleState, dt: number): void => {
    const tg = TARGETS[phaseRef.current]
    const k = 1 - Math.exp(-dt * 5)
    m.cAmp += (tg.amp - m.cAmp) * k
    m.cFreq += (tg.freq - m.cFreq) * k
    m.cRot += (tg.rotAmp - m.cRot) * k
    m.cJit += (tg.jitter - m.cJit) * k
    m.lowRot += ((lowRef.current ? -9 : 0) - m.lowRot) * k
    m.ph += dt * m.cFreq * Math.PI * 2

    const bobY = Math.sin(m.ph) * m.cAmp
    const swayRot = Math.sin(m.ph * 0.6 + 0.8) * m.cRot
    const jitter = m.cJit * (Math.sin(m.t * 21) * 0.5 + Math.sin(m.t * 37 + 1.7) * 0.3 + Math.sin(m.t * 9.3 + 0.4) * 0.2)

    if (m.charging) {
      m.charge += dt
      if (m.charge >= 0.28) {
        m.charging = 0
        m.jumping = true
        m.vy = -430
        m.jumpY = -1
      }
    }
    if (m.jumping) {
      m.vy += 900 * dt
      m.jumpY += m.vy * dt
      if (m.rare) {
        m.flightT += dt
        const p = Math.min(1, m.flightT / 0.94)
        const s = p * p * (3 - 2 * p)
        m.spinDeg = 360 * s
      }
      if (m.jumpY >= 0 && m.vy > 0) {
        m.jumpY = 0
        m.squash = m.rare && m.bounced === 0 ? 0.78 : 0.84
        if (m.rare) {
          if (m.bounced >= 2) {
            // third contact: a last tiny splash, then settle flat
            spawnSplash(4)
            m.jumping = false
            m.vy = 0
            m.rare = 0
            m.bounced = 0
            m.spinDeg = 0
            m.flightT = 0
            m.charge = 0
            m.charging = 0
          } else {
            // first contact: big splash and a high rebound; second: a small hop —
            // the heights and splashes decay so the landing settles naturally
            spawnSplash(m.bounced === 0 ? 26 : 8)
            m.bounced += 1
            m.vy = -m.vy * (m.bounced === 1 ? 0.55 : 0.45)
          }
        } else {
          m.vy = -m.vy * 0.42
          spawnSplash(14)
          if (Math.abs(m.vy) < 60) {
            m.jumping = false
            m.vy = 0
          }
        }
      }
    } else if (!m.charging) {
      m.jumpY = 0
    }
    m.squash += (1 - m.squash) * (1 - Math.exp(-dt * 11))

    const tiltTarget = (m.rare && m.jumping && m.vy < 0) ? Math.min(10, -m.vy * 0.02) : 0
    m.tilt += (tiltTarget - m.tilt) * (1 - Math.exp(-dt * 10))

    let sx = 1
    let sy = 1
    let crouch = 0
    if (m.charging) {
      crouch = Math.min(1, m.charge / 0.28)
      sy = 1 - 0.2 * crouch
      sx = 1 + 0.25 * crouch
    }
    if (m.jumping) {
      const stretch = Math.min(1, -m.jumpY / 40)
      sy = 1 + stretch * 0.07
      sx = 1 - stretch * 0.05
    }
    if (!m.charging) {
      sy *= m.squash
      sx *= 1 + (1 - m.squash) * 1.1
    }

    const y = bobY + m.jumpY + (m.charging ? 1.5 * crouch : 0)
    const rot = swayRot + jitter + m.lowRot + m.tilt + (m.rare ? m.spinDeg : 0)
    const origin = m.rare ? '42% 66%' : '50% 50%'
    if (node.style.transformOrigin !== origin) node.style.transformOrigin = origin
    node.style.transform = `translateY(${y.toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`

    m.t += dt
  }

  const spawnBubble = (): void => {
    const fx = fxRef.current
    if (fx === null) return
    const el = document.createElement('span')
    el.className = css.fxDot ?? ''
    const size = 3 + Math.random() * 3
    el.style.width = `${size}px`
    el.style.height = `${size}px`
    fx.appendChild(el)
    particlesRef.current.push({
      el,
      kind: 'bubble',
      x: 14 + Math.random() * 68,
      y: 0,
      vx: 0,
      vy: 22 + Math.random() * 16,
      t: 0,
      seed: Math.random() * 6.28,
    })
  }

  /** One landing splash: a spreading ring plus droplets arcing outward and falling back. */
  const spawnSplash = (count: number): void => {
    const fx = fxRef.current
    if (fx === null) return
    const ring = document.createElement('span')
    ring.className = css.fxRing ?? ''
    fx.appendChild(ring)
    particlesRef.current.push({ el: ring, kind: 'ring', x: 48, y: 0, vx: 0, vy: 0, t: 0, seed: 0 })
    for (let i = 0; i < count; i += 1) {
      const el = document.createElement('span')
      el.className = css.fxDot ?? ''
      const size = 3 + Math.random() * 4
      el.style.width = `${size}px`
      el.style.height = `${size}px`
      const shade = Math.random()
      el.style.background = shade > 0.45 ? 'rgba(255,255,255,.95)'
        : shade > 0.2 ? 'rgba(147,197,253,.95)' : 'rgba(103,232,249,.9)'
      fx.appendChild(el)
      particlesRef.current.push({
        el,
        kind: 'drop',
        x: 20 + Math.random() * 56,
        y: 0,
        vx: (Math.random() - 0.5) * 300,
        vy: -90 - Math.random() * 110,
        t: 0,
        seed: 0,
      })
    }
  }

  const updateParticles = (dt: number): void => {
    const particles = particlesRef.current
    for (let i = particles.length - 1; i >= 0; i -= 1) {
      const p = particles[i]
      if (p === undefined) continue
      p.t += dt
      if (p.kind === 'ring') {
        const life = Math.max(0, 1 - p.t / 0.45)
        const scale = 0.3 + (p.t / 0.45) * 1.1
        p.el.style.transform = `translateX(-50%) scale(${scale.toFixed(3)})`
        p.el.style.opacity = String(life)
        if (p.t > 0.45) {
          p.el.remove()
          particles.splice(i, 1)
        }
      } else if (p.kind === 'bubble') {
        p.x += Math.sin(p.t * 6 + p.seed) * 10 * dt
        p.y -= p.vy * dt
        p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
        p.el.style.opacity = String(Math.max(0, 1 - p.t / 1.5))
        if (p.y < -34 || p.t > 1.5) {
          p.el.remove()
          particles.splice(i, 1)
        }
      } else {
        p.vy += 460 * dt
        p.x += p.vx * dt
        p.y += p.vy * dt
        p.el.style.transform = `translate(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px)`
        p.el.style.opacity = String(Math.max(0, 1 - p.t / 1.1))
        if (p.t > 1.1) {
          p.el.remove()
          particles.splice(i, 1)
        }
      }
    }
  }

  const pet = (): void => {
    const m = whaleStateRef.current
    const rare = Math.random() < 0.4
    if (!m.jumping && !m.charging) {
      m.rare = rare ? 1 : 0
      if (rare) {
        m.charging = 1
        m.charge = 0
        m.spinDeg = 0
        m.flightT = 0
        m.tilt = 0
        m.bounced = 0
      } else {
        m.jumping = true
        m.vy = -230
        m.jumpY = -1
      }
    }
    const key = Date.now() + Math.random()
    const pool = rare ? DIVE_KEYS : low ? LOW_KEYS : CHATTER_KEYS[phase]
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? 'chatter.idle'
    setExtra({ text: t(pick), key })
    const id = key + Math.random()
    const heart: Heart = {
      id,
      hx: (Math.random() * 2 - 1) * 14 - 6,
      hy: -(30 + Math.random() * 28),
      hdx: (Math.random() * 2 - 1) * 10,
      hr: (Math.random() * 2 - 1) * 30,
      hdr: 15 + (Math.random() * 2 - 1) * 30,
      hs: 0.9 + Math.random() * 0.5,
      size: 14 + Math.random() * 5,
      emoji: HEART_EMOJIS[Math.floor(Math.random() * HEART_EMOJIS.length)] ?? '❤️',
    }
    setHearts(values => [...values, heart])
    setTimeout(() => { setHearts(values => values.filter(value => value.id !== id)) }, 1000)
    const hold = rare ? 3200 : 2400
    setTimeout(() => { setExtra(value => (value !== null && value.key === key ? null : value)) }, hold)
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect()
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      baseX: rect.left,
      baseY: rect.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    const node = nodeRef.current
    if (drag === null || node === null) return
    if (Math.abs(event.clientX - drag.startX) + Math.abs(event.clientY - drag.startY) > 4) drag.moved = true
    node.style.left = `${clampX(drag.baseX + event.clientX - drag.startX)}px`
    node.style.top = `${clampY(drag.baseY + event.clientY - drag.startY)}px`
    node.style.right = 'auto'
    node.style.bottom = 'auto'
  }

  const onPointerUp = (): void => {
    const node = nodeRef.current
    if (node !== null && node.style.left !== '') {
      const x = Number.parseFloat(node.style.left)
      const y = Number.parseFloat(node.style.top)
      if (Number.isFinite(x) && Number.isFinite(y)) savePos({ x, y })
    }
    dragRef.current = null
  }

  const onClick = (): void => {
    const drag = dragRef.current
    if (drag !== null && drag.moved) return
    pet()
  }

  const rootStyle = pos === null ? undefined : { left: pos.x, top: pos.y, right: 'auto', bottom: 'auto' }

  if (minimized) {
    return (
      <div ref={nodeRef} className={css.root} style={rootStyle} onClick={() => { setMinimized(false) }} title={t('action.restore')}>
        <div className={css.dot} />
      </div>
    )
  }

  const seaY = (SEA_BOTTOM - (SEA_BOTTOM - SEA_TOP) * level).toFixed(1)
  const textY = Math.min(15, 94 - Number(seaY))

  const balanceText = snapshot == null ? null
    : snapshot.balancePending ? '…'
      : snapshot.balance != null ? `${currencySymbol(snapshot.balanceCurrency)}${snapshot.balance.toFixed(2)}`
        : snapshot.balanceError != null ? snapshot.balanceError.slice(0, 14)
          : '—'

  const detail = extra === null
    ? phase === 'error' && snapshot?.error != null ? snapshot.error.slice(0, 36)
      : phase === 'working' && snapshot?.tool != null ? snapshot.tool
        : (phase === 'thinking' || phase === 'working') && (snapshot?.elapsed ?? 0) >= 1 ? `${snapshot?.elapsed ?? 0}s`
          : null
    : null

  return (
    <div
      ref={nodeRef}
      className={css.root}
      data-phase={phase}
      data-low={low ? '1' : '0'}
      style={rootStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
    >
      <div className={css.card}>
        <div className={css.stage}>
          <div className={css.shadow} />
          <div className={css.zzz} aria-hidden>💤</div>
          <div className={css.alert} aria-hidden>❗</div>
          <div ref={whaleRef} className={css.whale}>
            <svg className={css.body} viewBox="0 0 27 23" aria-hidden>
              <defs>
                <linearGradient id="dshPetWhaleGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6B8CFF" />
                  <stop offset="100%" stopColor="#3D5BDB" />
                </linearGradient>
              </defs>
              <path d={WHALE_PATH} fill="url(#dshPetWhaleGradient)" />
            </svg>
          </div>
          <div className={css.sea}>
            <svg viewBox="0 0 112 104" aria-hidden>
              <defs>
                <clipPath id="dshPetSeaClip">
                  <circle cx="56" cy="56" r="48" />
                </clipPath>
                <linearGradient id="dshPetSeaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgba(147,197,253,.5)" />
                  <stop offset="100%" stopColor="rgba(96,165,250,.28)" />
                </linearGradient>
              </defs>
              <g clipPath="url(#dshPetSeaClip)">
                <g ref={seaRef} data-testid="pet-sea-level" style={{ transform: `translateY(${seaY}px)` }}>
                  <g className={css.seaWave}>
                    <path d="M-24 0 q6 3 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 L144 120 L-24 120 Z" fill="url(#dshPetSeaFill)" />
                    <path d="M-24 0 q6 3 12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0 t12 0" fill="none" stroke="rgba(255,255,255,.85)" strokeWidth={1.6} strokeLinecap="round" />
                  </g>
                  {balanceText !== null ? (
                    <g className={css.balText}>
                      <text x="56" y={textY} textAnchor="middle" fill="rgba(255,255,255,.88)" fontSize="10.5" fontWeight="600">{balanceText}</text>
                    </g>
                  ) : null}
                </g>
              </g>
            </svg>
          </div>
          <div ref={fxRef} className={css.fx} />
          {hearts.map(heart => (
            <div
              key={heart.id}
              className={css.heart}
              aria-hidden
              style={{
                '--hx': `${heart.hx.toFixed(1)}px`,
                '--hy': `${heart.hy.toFixed(1)}px`,
                '--hdx': `${heart.hdx.toFixed(1)}px`,
                '--hr': `${heart.hr.toFixed(1)}deg`,
                '--hdr': `${heart.hdr.toFixed(1)}deg`,
                '--hs': heart.hs.toFixed(2),
                fontSize: `${heart.size.toFixed(1)}px`,
              } as CSSProperties}
            >
              {heart.emoji}
            </div>
          ))}
        </div>
        <div className={css.bubbleWrap}>
          <div className={css.bubble} key={`${phase}-${extra?.key ?? ''}`}>
            {extra !== null ? (
              <span className={css.bubbleText}>{extra.text}</span>
            ) : (
              <>
                <span className={css.statusDot} />
                <span className={css.bubbleText}>{t(PHASE_LABEL_KEY[phase])}</span>
                {detail !== null ? <span className={css.bubbleSep}>·</span> : null}
                {detail !== null ? <span className={css.bubbleText}>{detail}</span> : null}
              </>
            )}
          </div>
        </div>
        <button
          type="button"
          className={css.min}
          onClick={(event) => {
            event.stopPropagation()
            setMinimized(true)
          }}
          title={t('action.minimize')}
        />
      </div>
    </div>
  )
}
