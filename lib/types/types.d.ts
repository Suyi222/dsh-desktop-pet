import type { SessionId } from '@deepseek-ai/dsh-session/types';
/** One pet-facing phase of the agent lifecycle. */
export type PetPhase = 'idle' | 'thinking' | 'working' | 'error';
/** Snapshot request: the session whose agent the pet reflects. */
export interface PetSnapshotRequest {
    readonly sessionId: SessionId;
}
/**
 * One pet snapshot: the session's agent-lifecycle fold plus the latest
 * cached API-balance read and the bar's full-scale value.
 */
export interface PetSnapshotValue {
    readonly phase: PetPhase;
    readonly tool: string | null;
    readonly elapsed: number;
    readonly error: string | null;
    readonly balance: number | null;
    readonly balanceCurrency: string | null;
    readonly balancePending: boolean;
    readonly balanceError: string | null;
    /** Balance amount at which the widget bar reads full. */
    readonly balanceScale: number;
}
//# sourceMappingURL=types.d.ts.map