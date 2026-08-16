import s from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
//#region lib/types/balance.js
/**
* Parse one `/user/balance` response body. `JSON.parse` failures are
* caller-owned; a missing or non-numeric `total_balance` folds to `null`.
* @param body - raw response text.
* @returns the first balance info entry's total and currency.
*/
function parseBalanceResponse(body) {
	const info = JSON.parse(body).balance_infos?.[0];
	const total = info !== void 0 && typeof info.total_balance === "string" ? Number.parseFloat(info.total_balance) : NaN;
	return {
		balance: Number.isFinite(total) ? total : null,
		currency: info?.currency ?? null
	};
}
/**
* Read the balance endpoint with the provided API key. Non-2xx responses
* throw; the endpoint base keeps its configured form.
* @param baseUrl - configured API base (for example `https://api.deepseek.com`).
* @param apiKey - resolved `DEEPSEEK_API_KEY` value.
* @returns the parsed balance payload.
*/
async function fetchBalance(baseUrl, apiKey) {
	const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/user/balance`, {
		headers: { authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(1e4)
	});
	if (!response.ok) throw new Error(`balance endpoint returned HTTP ${response.status}`);
	return parseBalanceResponse(await response.text());
}
//#endregion
//#region lib/types/state.js
/** The initial idle state for one session. */
function createPetState(now) {
	return {
		phase: "idle",
		running: false,
		tool: null,
		since: now,
		error: null
	};
}
/**
* Fold one agent/status transition. Leaving `running` resets to idle;
* entering it from idle opens `thinking`.
* @param state - previous fold.
* @param status - the status just entered.
* @param now - transition timestamp.
* @returns the next fold.
*/
function applyAgentStatus(state, status, now) {
	const running = status === "running";
	if (!running) return {
		phase: "idle",
		running,
		tool: null,
		error: null,
		since: now
	};
	if (state.phase === "idle") return {
		...state,
		running,
		phase: "thinking",
		since: now
	};
	return {
		...state,
		running
	};
}
/** Fold one tool start: the agent is working on `tool`. */
function applyToolStart(state, tool, now) {
	return {
		...state,
		phase: "working",
		tool,
		since: now
	};
}
/**
* Fold one tool end. A still-running turn returns to `thinking`; an idle
* agent clears the tool name and stays idle.
*/
function applyToolEnd(state, now) {
	if (!state.running) return {
		...state,
		tool: null
	};
	return {
		...state,
		tool: null,
		phase: "thinking",
		since: now
	};
}
/** Fold one agent error into the snapshot. */
function applyAgentError(state, error, now) {
	return {
		...state,
		phase: "error",
		error,
		since: now
	};
}
//#endregion
//#region lib/types/index.js
/**
* Pet-status Remote: one live snapshot per session for the Web desktop-pet
* widget. The agent fold is keyed by session id from agent events; the
* balance indicator is a cached DeepSeek `/user/balance` read.
* @module dsh-desktop-pet
*/
var __runInitializers = function(thisArg, initializers, value) {
	var useValue = arguments.length > 2;
	for (var i = 0; i < initializers.length; i++) value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
	return useValue ? value : void 0;
};
var __esDecorate = function(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
	function accept(f) {
		if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected");
		return f;
	}
	var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
	var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
	var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
	var _, done = false;
	for (var i = decorators.length - 1; i >= 0; i--) {
		var context = {};
		for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
		for (var p in contextIn.access) context.access[p] = contextIn.access[p];
		context.addInitializer = function(f) {
			if (done) throw new TypeError("Cannot add initializers after decoration has completed");
			extraInitializers.push(accept(f || null));
		};
		var result = (0, decorators[i])(kind === "accessor" ? {
			get: descriptor.get,
			set: descriptor.set
		} : descriptor[key], context);
		if (kind === "accessor") {
			if (result === void 0) continue;
			if (result === null || typeof result !== "object") throw new TypeError("Object expected");
			if (_ = accept(result.get)) descriptor.get = _;
			if (_ = accept(result.set)) descriptor.set = _;
			if (_ = accept(result.init)) initializers.unshift(_);
		} else if (_ = accept(result)) if (kind === "field") initializers.unshift(_);
		else descriptor[key] = _;
	}
	if (target) Object.defineProperty(target, contextIn.name, descriptor);
	done = true;
};
const DEFAULT_BALANCE_BASE_URL = "https://api.deepseek.com";
const DEFAULT_BALANCE_SCALE = 100;
const DEFAULT_BALANCE_REFETCH_MS = 15e3;
function emptyBalanceCache() {
	return {
		balance: null,
		currency: null,
		pending: true,
		error: null,
		at: 0
	};
}
/** Render an unknown agent-error value as a snapshot string. */
function errorText(value) {
	if (value instanceof Error) return value.message;
	if (typeof value === "string") return value;
	if (value !== null && typeof value === "object" && "message" in value) {
		const message = value.message;
		if (typeof message === "string") return message;
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
			_snapshot_decorators = [Remote("snapshot")];
			__esDecorate(this, null, _snapshot_decorators, {
				kind: "method",
				name: "snapshot",
				static: false,
				private: false,
				access: {
					has: (obj) => "snapshot" in obj,
					get: (obj) => obj.snapshot
				},
				metadata: _metadata
			}, null, _instanceExtraInitializers);
			if (_metadata) Object.defineProperty(this, Symbol.metadata, {
				enumerable: true,
				configurable: true,
				writable: true,
				value: _metadata
			});
		}
		static inject = ["agents", "credentials"];
		/** Loader validation for the balance policy. */
		static Config = s.object({
			balanceBaseUrl: s.string().default(DEFAULT_BALANCE_BASE_URL),
			balanceScale: s.number().min(1).default(DEFAULT_BALANCE_SCALE),
			balanceRefetchMs: s.number().min(1).default(DEFAULT_BALANCE_REFETCH_MS)
		});
		balanceBaseUrl = __runInitializers(this, _instanceExtraInitializers);
		balanceScale;
		balanceRefetchMs;
		states = /* @__PURE__ */ new Map();
		balanceBySession = /* @__PURE__ */ new Map();
		balanceFetching = /* @__PURE__ */ new Set();
		/**
		* @param ctx - Host context carrying the agent registry and credentials.
		* @param config - Balance policy from the composition.
		*/
		constructor(ctx, config) {
			super(ctx, "petStatus");
			this.balanceBaseUrl = config.balanceBaseUrl;
			this.balanceScale = config.balanceScale;
			this.balanceRefetchMs = config.balanceRefetchMs;
			this.ctx.on("agent/status", (payload) => {
				this.states.set(payload.agent.id, applyAgentStatus(this.stateOf(payload.agent.id), payload.status, Date.now()));
			});
			this.ctx.on("tools/pre-execute", (exec, next) => {
				if (exec.agent !== void 0) this.states.set(exec.agent.id, applyToolStart(this.stateOf(exec.agent.id), exec.name, Date.now()));
				return next();
			});
			this.ctx.on("tools/result", (exec) => {
				if (exec.agent !== void 0) this.states.set(exec.agent.id, applyToolEnd(this.stateOf(exec.agent.id), Date.now()));
			});
			this.ctx.on("agent/error", (payload) => {
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
			if (agent !== void 0) state = applyAgentStatus(state, agent.status, now);
			const cache = this.balanceBySession.get(sessionId) ?? emptyBalanceCache();
			if (now - cache.at > this.balanceRefetchMs) this.refreshBalance(sessionId, cache);
			return {
				phase: state.phase,
				tool: state.tool,
				elapsed: Math.max(0, Math.floor((now - state.since) / 1e3)),
				error: state.error,
				balance: cache.balance,
				balanceCurrency: cache.currency,
				balancePending: cache.pending,
				balanceError: cache.error,
				balanceScale: this.balanceScale
			};
		}
		/** Read the current fold, seeding an idle one when absent. */
		stateOf(sessionId) {
			return this.states.get(sessionId) ?? createPetState(Date.now());
		}
		/** Refetch the balance once per staleness window; failures fold to the cache. */
		async refreshBalance(sessionId, cache) {
			if (this.balanceFetching.has(sessionId)) return;
			this.balanceBySession.set(sessionId, cache);
			this.balanceFetching.add(sessionId);
			try {
				const key = (await this.ctx.credentials.resolve(credentialRef("DEEPSEEK_API_KEY")))?.value;
				if (!key) throw new Error("DEEPSEEK_API_KEY is not configured");
				const result = await fetchBalance(this.balanceBaseUrl, key);
				cache.balance = result.balance;
				cache.currency = result.currency;
				cache.pending = false;
				cache.error = null;
			} catch (error) {
				cache.balance = null;
				cache.currency = null;
				cache.pending = false;
				cache.error = error instanceof Error ? error.message : String(error);
			} finally {
				this.balanceFetching.delete(sessionId);
				cache.at = Date.now();
			}
		}
	};
})();
//#endregion
export { PetStatusService, PetStatusService as default, applyAgentError, applyAgentStatus, applyToolEnd, applyToolStart, createPetState, fetchBalance, parseBalanceResponse };
