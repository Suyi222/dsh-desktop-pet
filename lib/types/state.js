/** The initial idle state for one session. */
export function createPetState(now) {
    return { phase: 'idle', running: false, tool: null, since: now, error: null };
}
/**
 * Fold one agent/status transition. Leaving `running` resets to idle;
 * entering it from idle opens `thinking`.
 * @param state - previous fold.
 * @param status - the status just entered.
 * @param now - transition timestamp.
 * @returns the next fold.
 */
export function applyAgentStatus(state, status, now) {
    const running = status === 'running';
    if (!running) {
        return { phase: 'idle', running, tool: null, error: null, since: now };
    }
    if (state.phase === 'idle') {
        return { ...state, running, phase: 'thinking', since: now };
    }
    return { ...state, running };
}
/** Fold one tool start: the agent is working on `tool`. */
export function applyToolStart(state, tool, now) {
    return { ...state, phase: 'working', tool, since: now };
}
/**
 * Fold one tool end. A still-running turn returns to `thinking`; an idle
 * agent clears the tool name and stays idle.
 */
export function applyToolEnd(state, now) {
    if (!state.running)
        return { ...state, tool: null };
    return { ...state, tool: null, phase: 'thinking', since: now };
}
/** Fold one agent error into the snapshot. */
export function applyAgentError(state, error, now) {
    return { ...state, phase: 'error', error, since: now };
}
//# sourceMappingURL=state.js.map