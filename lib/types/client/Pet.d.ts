/**
 * The desktop-pet widget: one official-whale mark over the shell overlay,
 * driven by the petStatus Remote snapshot. The whale motion is a rAF
 * physics loop (per-phase ease targets, a springy jump, and a rare charged
 * dive with a 360° spin timed to the water entry); the whale stands in a
 * circular sea whose level mirrors the API balance and whose surface
 * ripples with a scrolling wave plus a slow tide.
 */
import { type JSX } from 'react';
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { PetSnapshotValue } from '../client.ts';
import { NS } from './locales.ts';
/** Registration-side business face: the snapshot source bound as `usePetSnapshot`. */
export interface PetInjected {
    hooks: {
        petSnapshot: SnapshotStore<PetSnapshotValue | null>;
    };
}
/** Full props for the shell-overlay pet entry. */
export type PetProps = PropsRuntime<'shell.overlay'> & InjectFace<PetInjected> & PropsLocale<typeof NS>;
/**
 * The pet entry: one whale mark standing in a circular sea, with a status
 * pill. The balance reads as the sea level under the mark.
 * @param props - the four-share props (usePetSnapshot + `t`).
 * @returns the widget element.
 */
export declare function Pet(props: PetProps): JSX.Element;
//# sourceMappingURL=Pet.d.ts.map