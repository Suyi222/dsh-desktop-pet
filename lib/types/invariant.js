/** Package-owned invariant companion. @module dsh-desktop-pet/invariant */
const PACKAGE_NAME = 'dsh-desktop-pet';
/** Cordis companion plugin name. */
export const name = 'pet-status-invariant';
/** Services required before the companion can reserve and check package ownership. */
export const inject = ['invariants'];
/**
 * No runtime invariant: the fold is event-driven per-session state, and the
 * balance cache is refreshed on demand with no second authority.
 */
const install = Object.assign(() => { }, { inject: ['petStatus'] });
/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx) => Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install));
//# sourceMappingURL=invariant.js.map