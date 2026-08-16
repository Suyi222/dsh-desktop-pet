import type { AgentStatus } from '@deepseek-ai/dsh-agent'
import type { PetPhase } from './types.ts'

/**
 * Immutable agent-lifecycle fold for one session's pet snapshot.
 * Each apply returns a fresh state; the service owns the map.
 */
export interface PetState {
  readonly phase: PetPhase
  readonly running: boolean
  readonly tool: string | null
  readonly since: number
  readonly error: string | null
}

/** The initial idle state for one session. */
export function createPetState(now: number): PetState {
  return { phase: 'idle', running: false, tool: null, since: now, error: null }
}

/**
 * Fold one agent/status transition. Leaving `running` resets to idle;
 * entering it from idle opens `thinking`.
 * @param state - previous fold.
 * @param status - the status just entered.
 * @param now - transition timestamp.
 * @returns the next fold.
 */
export function applyAgentStatus(state: PetState, status: AgentStatus, now: number): PetState {
  const running = status === 'running'
  if (!running) {
    return { phase: 'idle', running, tool: null, error: null, since: now }
  }
  if (state.phase === 'idle') {
    return { ...state, running, phase: 'thinking', since: now }
  }
  return { ...state, running }
}

/** Fold one tool start: the agent is working on `tool`. */
export function applyToolStart(state: PetState, tool: string, now: number): PetState {
  return { ...state, phase: 'working', tool, since: now }
}

/**
 * Fold one tool end. A still-running turn returns to `thinking`; an idle
 * agent clears the tool name and stays idle.
 */
export function applyToolEnd(state: PetState, now: number): PetState {
  if (!state.running) return { ...state, tool: null }
  return { ...state, tool: null, phase: 'thinking', since: now }
}

/** Fold one agent error into the snapshot. */
export function applyAgentError(state: PetState, error: string, now: number): PetState {
  return { ...state, phase: 'error', error, since: now }
}
