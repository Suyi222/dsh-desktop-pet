import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { SessionId } from '@deepseek-ai/dsh-session'
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol'
import PetStatusService, { type PetSnapshotValue } from '../src/index.ts'

const DEFAULT_CONFIG = {
  balanceBaseUrl: 'https://api.deepseek.com',
  balanceScale: 100,
  balanceRefetchMs: 60_000,
}

interface FakeAgent {
  readonly id: SessionId
  status: 'idle' | 'running'
}

interface Harness {
  readonly ctx: Context
  readonly agents: Map<SessionId, FakeAgent>
  readonly credentials: { resolve: ReturnType<typeof vi.fn> }
  /** The service fiber's own context: where its event listeners live. */
  readonly serviceCtx: Context
  dispose(): Promise<void>
}

const harnesses: Harness[] = []

async function setup(config = DEFAULT_CONFIG): Promise<Harness> {
  const ctx = new Context()
  const agents = new Map<SessionId, FakeAgent>()
  ctx.provide('agents', { get: (id: SessionId) => agents.get(id) })
  const credentials = { resolve: vi.fn(async () => ({ value: 'sk-test', source: 'test' })) }
  ctx.provide('credentials', credentials)
  const fiber = await ctx.plugin(PetStatusService, config)
  const harness: Harness = {
    ctx,
    agents,
    credentials,
    serviceCtx: fiber.ctx,
    dispose: async () => { await fiber.dispose() },
  }
  harnesses.push(harness)
  return harness
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 5))
}

function emitAgentStatus(h: Harness, agent: FakeAgent, status: 'idle' | 'running'): void {
  // The fake registry mirrors the transition, like the live agent registry.
  agent.status = status
  h.serviceCtx.emit('agent/status', { agent, status } as never)
}

function emitToolStart(h: Harness, agent: FakeAgent, name: string): void {
  const exec = { agent, name }
  const next = vi.fn(async () => ({ allow: true }))
  h.serviceCtx.emit('tools/pre-execute', exec as never, next as never)
}

function emitToolEnd(h: Harness, agent: FakeAgent): void {
  h.serviceCtx.emit('tools/result', { agent, name: 'read' } as never, {} as never)
}

function emitAgentError(h: Harness, agent: FakeAgent, error: unknown): void {
  h.serviceCtx.emit('agent/error', { agent, turn: 1, step: 1, error } as never)
}

function agent(h: Harness, id: string): FakeAgent {
  const value = { id: SessionId(id), status: 'idle' as const }
  h.agents.set(value.id, value)
  return value
}

function snapshotOf(h: Harness, id: string): PetSnapshotValue {
  return h.ctx.petStatus.snapshot({ sessionId: SessionId(id) })
}

afterEach(async () => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  await Promise.all(harnesses.splice(0).map(value => value.dispose()))
})

describe('PetStatusService', () => {
  it('publishes the petStatus namespace with the snapshot Remote', async () => {
    const h = await setup()
    expect(h.ctx.petStatus.typertRemote.serviceKey).toBe('petStatus')
    expect(remoteMethods(h.ctx.petStatus)).toEqual([
      { method: 'snapshot', invocation: { kind: 'direct' } },
    ])
  })

  it('returns an idle snapshot for a session with no agent activity', async () => {
    const h = await setup()
    const result = snapshotOf(h, 'quiet-session')
    expect(result).toMatchObject({ phase: 'idle', tool: null })
  })

  it('calibrates the fold against the live agent on snapshot', async () => {
    const h = await setup()
    const a = agent(h, 'calibrate')
    a.status = 'running'
    const result = snapshotOf(h, 'calibrate')
    expect(result).toMatchObject({ phase: 'thinking' })
  })

  it('folds agent events into the snapshot', async () => {
    const h = await setup()
    const a = agent(h, 'busy')
    emitAgentStatus(h, a, 'running')
    emitToolStart(h, a, 'bash')
    expect(snapshotOf(h, 'busy')).toMatchObject({ phase: 'working', tool: 'bash' })
    emitToolEnd(h, a)
    expect(snapshotOf(h, 'busy')).toMatchObject({ phase: 'thinking', tool: null })
    emitAgentError(h, a, new Error('boom'))
    expect(snapshotOf(h, 'busy')).toMatchObject({ phase: 'error', error: 'boom' })
    emitAgentStatus(h, a, 'idle')
    expect(snapshotOf(h, 'busy')).toMatchObject({ phase: 'idle', error: null })
  })

  it('reports elapsed seconds since the last fold transition', async () => {
    vi.useFakeTimers()
    const h = await setup({ ...DEFAULT_CONFIG, balanceRefetchMs: Number.MAX_SAFE_INTEGER })
    const a = agent(h, 'elapsed')
    vi.setSystemTime(1_700_000_000_000)
    emitAgentStatus(h, a, 'running')
    vi.setSystemTime(1_700_000_005_000)
    expect(snapshotOf(h, 'elapsed')).toMatchObject({ elapsed: 5 })
    vi.useRealTimers()
  })

  it('refreshes the balance once per staleness window and returns it cached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        is_available: true,
        balance_infos: [{ currency: 'CNY', total_balance: '88.50' }],
      }),
    })))
    const h = await setup()
    const a = agent(h, 'wallet')
    a.status = 'running'
    expect(snapshotOf(h, 'wallet')).toMatchObject({ balancePending: true, balance: null })
    await flush()
    expect(snapshotOf(h, 'wallet')).toMatchObject({ balance: 88.5, balanceCurrency: 'CNY', balancePending: false })
    await flush()
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it('folds a missing API key into the balance error', async () => {
    const h = await setup()
    h.credentials.resolve.mockResolvedValueOnce(undefined)
    snapshotOf(h, 'nokey')
    await flush()
    expect(snapshotOf(h, 'nokey')).toMatchObject({ balance: null, balanceError: 'DEEPSEEK_API_KEY is not configured' })
  })

  it('folds string, message-object, and opaque agent errors', async () => {
    const h = await setup()
    const a = agent(h, 'error-kinds')
    emitAgentStatus(h, a, 'running')
    emitAgentError(h, a, 'plain failure')
    expect(snapshotOf(h, 'error-kinds')).toMatchObject({ phase: 'error', error: 'plain failure' })
    emitAgentError(h, a, { message: 'wrapped failure' })
    expect(snapshotOf(h, 'error-kinds')).toMatchObject({ error: 'wrapped failure' })
    emitAgentError(h, a, 42)
    expect(snapshotOf(h, 'error-kinds')).toMatchObject({ error: '42' })
    emitAgentError(h, a, { detail: 'no message' })
    expect(snapshotOf(h, 'error-kinds')).toMatchObject({ error: '[object Object]' })
    emitAgentError(h, a, { message: 42 })
    expect(snapshotOf(h, 'error-kinds')).toMatchObject({ error: '[object Object]' })
  })

  it('ignores tool events whose exec carries no agent', async () => {
    const h = await setup()
    const a = agent(h, 'agentless-tools')
    emitAgentStatus(h, a, 'running')
    emitToolStart(h, a, 'bash')
    expect(snapshotOf(h, 'agentless-tools')).toMatchObject({ phase: 'working' })
    h.serviceCtx.emit('tools/pre-execute', { name: 'read' } as never, vi.fn() as never)
    h.serviceCtx.emit('tools/result', { name: 'read' } as never, {} as never)
    expect(snapshotOf(h, 'agentless-tools')).toMatchObject({ phase: 'working', tool: 'bash' })
  })

  it('folds a non-Error credentials failure into the balance error', async () => {
    const h = await setup()
    h.credentials.resolve.mockRejectedValueOnce('raw string failure')
    snapshotOf(h, 'raw-failure')
    await flush()
    expect(snapshotOf(h, 'raw-failure')).toMatchObject({
      balance: null, balanceError: 'raw string failure',
    })
  })

  it('folds a failed balance fetch into the balance error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    const h = await setup()
    snapshotOf(h, 'unauthorized')
    await flush()
    expect(snapshotOf(h, 'unauthorized')).toMatchObject({ balance: null, balanceError: 'balance endpoint returned HTTP 401' })
  })
})
