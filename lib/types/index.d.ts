/**
 * Pet-status Remote: one live snapshot per session for the Web desktop-pet
 * widget. The agent fold is keyed by session id from agent events; the
 * balance indicator is a cached DeepSeek `/user/balance` read.
 * @module dsh-desktop-pet
 */
import { Context } from '@deepseek-ai/cordis';
import s from '@deepseek-ai/schemastery';
import { TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import type { PetSnapshotRequest, PetSnapshotValue } from './types.ts';
export type * from './types.ts';
export * from './state.ts';
export { fetchBalance, parseBalanceResponse } from './balance.ts';
export type { DeepSeekBalance } from './balance.ts';
declare module '@deepseek-ai/cordis' {
    interface Context {
        petStatus: PetStatusService;
    }
}
/** Deployment policy for the pet widget's balance indicator. */
export interface Config {
    readonly balanceBaseUrl: string;
    readonly balanceScale: number;
    readonly balanceRefetchMs: number;
}
/**
 * Live pet-status service: folds agent events per session and serves one
 * snapshot plus the latest cached DeepSeek balance over the Remote API.
 */
export declare class PetStatusService extends TypertRemoteService {
    static inject: string[];
    /** Loader validation for the balance policy. */
    static Config: s<Config>;
    private readonly balanceBaseUrl;
    private readonly balanceScale;
    private readonly balanceRefetchMs;
    private readonly states;
    private readonly balanceBySession;
    private readonly balanceFetching;
    /**
     * @param ctx - Host context carrying the agent registry and credentials.
     * @param config - Balance policy from the composition.
     */
    constructor(ctx: Context, config: Config);
    /**
     * Read one pet snapshot, calibrating the fold against the live agent and
     * triggering a cached balance refresh when the cache is stale. The Remote
     * face wraps the business value in the standard result envelope.
     * @param request - the session whose agent the pet reflects.
     * @returns the snapshot value.
     */
    snapshot(request: PetSnapshotRequest): PetSnapshotValue;
    /** Read the current fold, seeding an idle one when absent. */
    private stateOf;
    /** Refetch the balance once per staleness window; failures fold to the cache. */
    private refreshBalance;
}
export default PetStatusService;
//# sourceMappingURL=index.d.ts.map