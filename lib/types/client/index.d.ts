/**
 * Desktop-pet plugin, browser half: one official-whale widget in the shell
 * overlay. The plugin mounts its own petStatus Remote contribution, then a
 * controller polls it for the current session and publishes each snapshot
 * into a store bound to the widget through the `hooks` compartment; the
 * widget itself owns no subscription machinery.
 * @module dsh-desktop-pet/client
 */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import { type PetKey } from './locales.ts';
export { Pet } from './Pet.tsx';
export type { PetInjected, PetProps } from './Pet.tsx';
export { PetController } from './controller.ts';
export type { PetStatusRemote } from './controller.ts';
export type { PetKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** The desktop-pet widget's copy. */
        pet: PetKey;
    }
}
/** Required services: the slot registry, the Remote service, the session list, and copy. */
export declare const inject: string[];
/**
 * Client plugin body: mount the petStatus Remote, register the dictionaries,
 * the snapshot poll, and the shell-overlay widget.
 * @param ctx - client root context.
 */
export declare function apply(ctx: ClientContext): Promise<void>;
//# sourceMappingURL=index.d.ts.map