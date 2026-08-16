/**
 * Browser-local controller over the petStatus Remote: one observable
 * snapshot store refreshed on demand. The apply layer owns the refresh
 * cadence; the renderer binds the store through the `hooks` compartment.
 * @module @deepseek-ai/dsh-client-ui-pet/client/controller
 */
import { type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client';
import type { PetSnapshotValue } from '../client.ts';
/**
 * The one Remote call this controller needs. The generated face wraps the
 * business result in {@link RemoteResult}: a carrier failure arrives as the
 * `ok: false` branch, so the controller reads one envelope and never wraps a
 * call to recover a transport error.
 */
export interface PetStatusRemote {
    snapshot: (request: {
        readonly sessionId: SessionId;
    }) => Promise<{
        readonly ok: true;
        readonly value: PetSnapshotValue;
    } | {
        readonly ok: false;
        readonly error: unknown;
    }>;
}
/**
 * Pet snapshot controller: owns the observable snapshot and refreshes it
 * from the Remote.
 */
export declare class PetController {
    private readonly remote;
    /** The snapshot the renderer binds as `usePetSnapshot`. */
    readonly store: SnapshotStore<PetSnapshotValue | null>;
    /**
     * @param remote - the petStatus Remote namespace.
     * @param initial - seed snapshot; null until the first refresh lands.
     */
    constructor(remote: PetStatusRemote, initial?: PetSnapshotValue | null);
    /**
     * Read one snapshot and publish it on success. Failures leave the previous
     * value in place; the widget renders its last good state.
     * @param sessionId - the session whose agent the pet reflects.
     */
    refresh(sessionId: SessionId): Promise<void>;
}
//# sourceMappingURL=controller.d.ts.map