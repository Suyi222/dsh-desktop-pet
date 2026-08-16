/**
 * Pet-status Remote: one live snapshot per session for the Web desktop-pet
 * widget. The agent fold is keyed by session id from agent events; the
 * balance indicator is a cached DeepSeek `/user/balance` read.
 * @module dsh-desktop-pet
 */

import { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
// Type-only: pulls the agent and tools event maps into the cordis Events merge.
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-tools'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { fetchBalance } from './balance.ts'
import {
  applyAgentError,
  applyAgentStatus,
  applyToolEnd,
  applyToolStart,
  createPetState,
  type PetState,
} from './state.ts'
import type { PetSnapshotRequest, PetSnapshotValue } from './types.ts'

export type * from './types.ts'
export * from './state.ts'
export { fetchBalance, parseBalanceResponse } from './balance.ts'
export type { DeepSeekBalance } from './balance.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    petStatus: PetStatusService
  }
}

/** Deployment policy for the pet widget's balance indicator. */
export interface Config {
  readonly balanceBaseUrl: string
  readonly balanceScale: number
  readonly balanceRefetchMs: number
}

const DEFAULT_BALANCE_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_BALANCE_SCALE = 100
const DEFAULT_BALANCE_REFETCH_MS = 15_000

/** One cached balance read per session. */
interface BalanceCache {
  balance: number | null
  currency: string | null
  pending: boolean
  error: string | null
  at: number
}

function emptyBalanceCache(): BalanceCache {
  return { balance: null, currency: null, pending: true, error: null, at: 0 }
}

/** Render an unknown agent-error value as a snapshot string. */
function errorText(value: unknown): string {
  if (value instanceof Error) return value.message
  if (typeof value === 'string') return value
  if (value !== null && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message
    if (typeof message === 'string') return message
  }
  return String(value)
}

/**
 * Live pet-status service: folds agent events per session and serves one
 * snapshot plus the latest cached DeepSeek balance over the Remote API.
 */
export class PetStatusService extends TypertRemoteService {
  static inject = ['agents', 'credentials']

  /** Loader validation for the balance policy. */
  static Config: s<Config> = s.object({
    balanceBaseUrl: s.string().default(DEFAULT_BALANCE_BASE_URL),
    balanceScale: s.number().min(1).default(DEFAULT_BALANCE_SCALE),
    balanceRefetchMs: s.number().min(1).default(DEFAULT_BALANCE_REFETCH_MS),
  })

  private readonly balanceBaseUrl: string
  private readonly balanceScale: number
  private readonly balanceRefetchMs: number
  private readonly states = new Map<SessionId, PetState>()
  private readonly balanceBySession = new Map<SessionId, BalanceCache>()
  private readonly balanceFetching = new Set<SessionId>()

  /**
   * @param ctx - Host context carrying the agent registry and credentials.
   * @param config - Balance policy from the composition.
   */
  constructor(ctx: Context, config: Config) {
    super(ctx, 'petStatus')
    this.balanceBaseUrl = config.balanceBaseUrl
    this.balanceScale = config.balanceScale
    this.balanceRefetchMs = config.balanceRefetchMs

    this.ctx.on('agent/status', (payload) => {
      this.states.set(payload.agent.id, applyAgentStatus(this.stateOf(payload.agent.id), payload.status, Date.now()))
    })
    this.ctx.on('tools/pre-execute', (exec, next) => {
      if (exec.agent !== undefined) {
        this.states.set(exec.agent.id, applyToolStart(this.stateOf(exec.agent.id), exec.name, Date.now()))
      }
      return next()
    })
    this.ctx.on('tools/result', (exec) => {
      if (exec.agent !== undefined) {
        this.states.set(exec.agent.id, applyToolEnd(this.stateOf(exec.agent.id), Date.now()))
      }
    })
    this.ctx.on('agent/error', (payload) => {
      this.states.set(payload.agent.id, applyAgentError(this.stateOf(payload.agent.id), errorText(payload.error), Date.now()))
    })
  }

  /**
   * Read one pet snapshot, calibrating the fold against the live agent and
   * triggering a cached balance refresh when the cache is stale. The Remote
   * face wraps the business value in the standard result envelope.
   * @param request - the session whose agent the pet reflects.
   * @returns the snapshot value.
   */
  @Remote('snapshot')
  snapshot(request: PetSnapshotRequest): PetSnapshotValue {
    const sessionId = request.sessionId
    const now = Date.now()
    let state = this.stateOf(sessionId)
    const agent = this.ctx.agents.get(sessionId)
    if (agent !== undefined) state = applyAgentStatus(state, agent.status, now)
    const cache = this.balanceBySession.get(sessionId) ?? emptyBalanceCache()
    if (now - cache.at > this.balanceRefetchMs) void this.refreshBalance(sessionId, cache)
    return {
      phase: state.phase,
      tool: state.tool,
      elapsed: Math.max(0, Math.floor((now - state.since) / 1000)),
      error: state.error,
      balance: cache.balance,
      balanceCurrency: cache.currency,
      balancePending: cache.pending,
      balanceError: cache.error,
      balanceScale: this.balanceScale,
    }
  }

  /** Read the current fold, seeding an idle one when absent. */
  private stateOf(sessionId: SessionId): PetState {
    return this.states.get(sessionId) ?? createPetState(Date.now())
  }

  /** Refetch the balance once per staleness window; failures fold to the cache. */
  private async refreshBalance(sessionId: SessionId, cache: BalanceCache): Promise<void> {
    if (this.balanceFetching.has(sessionId)) return
    this.balanceBySession.set(sessionId, cache)
    this.balanceFetching.add(sessionId)
    try {
      const resolved = await this.ctx.credentials.resolve(credentialRef('DEEPSEEK_API_KEY'))
      const key = resolved?.value
      if (!key) throw new Error('DEEPSEEK_API_KEY is not configured')
      const result = await fetchBalance(this.balanceBaseUrl, key)
      cache.balance = result.balance
      cache.currency = result.currency
      cache.pending = false
      cache.error = null
    } catch (error) {
      cache.balance = null
      cache.currency = null
      cache.pending = false
      cache.error = error instanceof Error ? error.message : String(error)
    } finally {
      this.balanceFetching.delete(sessionId)
      cache.at = Date.now()
    }
  }
}

export default PetStatusService
