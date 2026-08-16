import type { AgentStatus } from '@deepseek-ai/dsh-agent';
import type { PetPhase } from './types.ts';
/**
 * Immutable agent-lifecycle fold for one session's pet snapshot.
 * Each apply returns a fresh state; the service owns the map.
 */
export interface PetState {
    readonly phase: PetPhase;
    readonly running: boolean;
    readonly tool: string | null;
    readonly since: number;
    readonly error: string | null;
}
/** The initial idle state for one session. */
export declare function createPetState(now: number): PetState;
/**
 * Fold one agent/status transition. Leaving `running` resets to idle;
 * entering it from idle opens `thinking`.
 * @param state - previous fold.
 * @param status - the status just entered.
 * @param now - transition timestamp.
 * @returns the next fold.
 */
export declare function applyAgentStatus(state: PetState, status: AgentStatus, now: number): PetState;
/** Fold one tool start: the agent is working on `tool`. */
export declare function applyToolStart(state: PetState, tool: string, now: number): PetState;
/**
 * Fold one tool end. A still-running turn returns to `thinking`; an idle
 * agent clears the tool name and stays idle.
 */
export declare function applyToolEnd(state: PetState, now: number): PetState;
/** Fold one agent error into the snapshot. */
export declare function applyAgentError(state: PetState, error: string, now: number): PetState;
//# sourceMappingURL=state.d.ts.map