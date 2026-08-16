/**
 * Pet-status Remote: one live snapshot per session for the Web desktop-pet
 * widget. The agent fold is keyed by session id from agent events; the
 * balance indicator is a cached DeepSeek `/user/balance` read.
 * @module dsh-desktop-pet
 */
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
import s from '@deepseek-ai/schemastery';
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { fetchBalance } from "./balance.js";
import { applyAgentError, applyAgentStatus, applyToolEnd, applyToolStart, createPetState, } from "./state.js";
export * from "./state.js";
export { fetchBalance, parseBalanceResponse } from "./balance.js";
const DEFAULT_BALANCE_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_BALANCE_SCALE = 100;
const DEFAULT_BALANCE_REFETCH_MS = 15_000;
function emptyBalanceCache() {
    return { balance: null, currency: null, pending: true, error: null, at: 0 };
}
/** Render an unknown agent-error value as a snapshot string. */
function errorText(value) {
    if (value instanceof Error)
        return value.message;
    if (typeof value === 'string')
        return value;
    if (value !== null && typeof value === 'object' && 'message' in value) {
        const message = value.message;
        if (typeof message === 'string')
            return message;
    }
    return String(value);
}
/**
 * Live pet-status service: folds agent events per session and serves one
 * snapshot plus the latest cached DeepSeek balance over the Remote API.
 */
let PetStatusService = (() => {
    let _classSuper = TypertRemoteService;
    let _instanceExtraInitializers = [];
    let _snapshot_decorators;
    return class PetStatusService extends _classSuper {
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            _snapshot_decorators = [Remote('snapshot')];
            __esDecorate(this, null, _snapshot_decorators, { kind: "method", name: "snapshot", static: false, private: false, access: { has: obj => "snapshot" in obj, get: obj => obj.snapshot }, metadata: _metadata }, null, _instanceExtraInitializers);
            if (_metadata) Object.defineProperty(this, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
        }
        static inject = ['agents', 'credentials'];
        /** Loader validation for the balance policy. */
        static Config = s.object({
            balanceBaseUrl: s.string().default(DEFAULT_BALANCE_BASE_URL),
            balanceScale: s.number().min(1).default(DEFAULT_BALANCE_SCALE),
            balanceRefetchMs: s.number().min(1).default(DEFAULT_BALANCE_REFETCH_MS),
        });
        balanceBaseUrl = __runInitializers(this, _instanceExtraInitializers);
        balanceScale;
        balanceRefetchMs;
        states = new Map();
        balanceBySession = new Map();
        balanceFetching = new Set();
        /**
         * @param ctx - Host context carrying the agent registry and credentials.
         * @param config - Balance policy from the composition.
         */
        constructor(ctx, config) {
            super(ctx, 'petStatus');
            this.balanceBaseUrl = config.balanceBaseUrl;
            this.balanceScale = config.balanceScale;
            this.balanceRefetchMs = config.balanceRefetchMs;
            this.ctx.on('agent/status', (payload) => {
                this.states.set(payload.agent.id, applyAgentStatus(this.stateOf(payload.agent.id), payload.status, Date.now()));
            });
            this.ctx.on('tools/pre-execute', (exec, next) => {
                if (exec.agent !== undefined) {
                    this.states.set(exec.agent.id, applyToolStart(this.stateOf(exec.agent.id), exec.name, Date.now()));
                }
                return next();
            });
            this.ctx.on('tools/result', (exec) => {
                if (exec.agent !== undefined) {
                    this.states.set(exec.agent.id, applyToolEnd(this.stateOf(exec.agent.id), Date.now()));
                }
            });
            this.ctx.on('agent/error', (payload) => {
                this.states.set(payload.agent.id, applyAgentError(this.stateOf(payload.agent.id), errorText(payload.error), Date.now()));
            });
        }
        /**
         * Read one pet snapshot, calibrating the fold against the live agent and
         * triggering a cached balance refresh when the cache is stale. The Remote
         * face wraps the business value in the standard result envelope.
         * @param request - the session whose agent the pet reflects.
         * @returns the snapshot value.
         */
        snapshot(request) {
            const sessionId = request.sessionId;
            const now = Date.now();
            let state = this.stateOf(sessionId);
            const agent = this.ctx.agents.get(sessionId);
            if (agent !== undefined)
                state = applyAgentStatus(state, agent.status, now);
            const cache = this.balanceBySession.get(sessionId) ?? emptyBalanceCache();
            if (now - cache.at > this.balanceRefetchMs)
                void this.refreshBalance(sessionId, cache);
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
            };
        }
        /** Read the current fold, seeding an idle one when absent. */
        stateOf(sessionId) {
            return this.states.get(sessionId) ?? createPetState(Date.now());
        }
        /** Refetch the balance once per staleness window; failures fold to the cache. */
        async refreshBalance(sessionId, cache) {
            if (this.balanceFetching.has(sessionId))
                return;
            this.balanceBySession.set(sessionId, cache);
            this.balanceFetching.add(sessionId);
            try {
                const resolved = await this.ctx.credentials.resolve(credentialRef('DEEPSEEK_API_KEY'));
                const key = resolved?.value;
                if (!key)
                    throw new Error('DEEPSEEK_API_KEY is not configured');
                const result = await fetchBalance(this.balanceBaseUrl, key);
                cache.balance = result.balance;
                cache.currency = result.currency;
                cache.pending = false;
                cache.error = null;
            }
            catch (error) {
                cache.balance = null;
                cache.currency = null;
                cache.pending = false;
                cache.error = error instanceof Error ? error.message : String(error);
            }
            finally {
                this.balanceFetching.delete(sessionId);
                cache.at = Date.now();
            }
        }
    };
})();
export { PetStatusService };
export default PetStatusService;
//# sourceMappingURL=index.js.map