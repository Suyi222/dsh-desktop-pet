/**
 * Browser-local controller over the petStatus Remote: one observable
 * snapshot store refreshed on demand. The apply layer owns the refresh
 * cadence; the renderer binds the store through the `hooks` compartment.
 * @module @deepseek-ai/dsh-client-ui-pet/client/controller
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-runtime/client';
/**
 * Pet snapshot controller: owns the observable snapshot and refreshes it
 * from the Remote.
 */
export class PetController {
    remote;
    /** The snapshot the renderer binds as `usePetSnapshot`. */
    store;
    /**
     * @param remote - the petStatus Remote namespace.
     * @param initial - seed snapshot; null until the first refresh lands.
     */
    constructor(remote, initial = null) {
        this.remote = remote;
        this.store = createSnapshotStore(initial);
    }
    /**
     * Read one snapshot and publish it on success. Failures leave the previous
     * value in place; the widget renders its last good state.
     * @param sessionId - the session whose agent the pet reflects.
     */
    async refresh(sessionId) {
        const result = await this.remote.snapshot({ sessionId });
        if (result.ok)
            this.store.set(result.value);
    }
}
//# sourceMappingURL=controller.js.map