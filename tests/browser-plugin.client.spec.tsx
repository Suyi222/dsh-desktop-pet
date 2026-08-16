// @vitest-environment jsdom
/**
 * ui-pet browser half on a real cordis Context with fake slots/remote/
 * sessions faces: the plugin registers the shell-overlay widget entry with
 * the hooks compartment, the snapshot poll refreshes through the petStatus
 * Remote on its cadence, and disposal rides the plugin fiber. The node half
 * and the invariant companion are exercised over the same Context.
 */
import { Context, Service } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import { SlotRegistry, type SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PetSnapshotValue } from '../src/client.ts'
import { apply, inject } from '../src/client/index.ts'
import type { PetInjected } from '../src/client/Pet.tsx'
import { apply as invariantApply } from '../src/invariant.ts'

afterEach(() => {
  vi.useRealTimers()
})

const sid = (key: string): SessionId => key as SessionId

function snapshotValue(): PetSnapshotValue {
  return {
    phase: 'idle',
    tool: null,
    elapsed: 0,
    error: null,
    balance: 88.5,
    balanceCurrency: 'CNY',
    balancePending: false,
    balanceError: null,
    balanceScale: 100,
  }
}

/** Boot the plugin over fake faces; the Remote snapshot records arguments. */
async function bench(): Promise<{
  readonly ctx: Context
  readonly snapshot: ReturnType<typeof vi.fn>
  entry(): { id: unknown; order: unknown; locale: unknown; inject: (() => PetInjected) | undefined }
  dispose(): Promise<void>
}> {
  const ctx = new Context()
  const snapshot = vi.fn(async () => ({ ok: true, value: snapshotValue() }))
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }

    /** The plugin mounts its own Remote contribution; the fake just accepts it. */
    async $mount(): Promise<() => Promise<void>> {
      return async () => {}
    }
  }
  new RemoteService(ctx)
  ctx.provide('remote.petStatus', { snapshot })
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: { 'shell.overlay': { kind: 'list', scope: 'root' } },
  } as never, (() => null) as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ current: sid('s1') }) },
  })
  const fiber = await ctx.plugin({ inject: [...inject], apply })
  return {
    ctx,
    snapshot,
    entry: () => {
      const entry = ctx.slots.entries('shell.overlay')[0]
      if (entry === undefined) return { id: undefined, order: undefined, locale: undefined, inject: undefined }
      return {
        id: entry.options.id,
        order: entry.options.order,
        locale: entry.locale,
        inject: entry.inject as unknown as (() => PetInjected) | undefined,
      }
    },
    dispose: async () => { await fiber.dispose() },
  }
}

describe('ui-pet browser plugin', () => {
  it('registers the shell-overlay widget with the hooks compartment', async () => {
    const b = await bench()
    try {
      expect(b.entry()).toMatchObject({ id: 'ui-pet', order: 60, locale: 'pet' })
      const injected = b.entry().inject?.()
      expect(injected?.hooks.petSnapshot).toBeTypeOf('object')
    } finally {
      await b.dispose()
    }
  })

  it('polls the Remote on the snapshot cadence and publishes the reply', async () => {
    vi.useFakeTimers()
    const b = await bench()
    try {
      expect(b.snapshot).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1000)
      expect(b.snapshot).toHaveBeenCalledWith({ sessionId: sid('s1') })
      await vi.advanceTimersByTimeAsync(1000)
      expect(b.snapshot).toHaveBeenCalledTimes(2)
    } finally {
      await b.dispose()
      vi.useRealTimers()
    }
  })

  it('node half and invariant companion load without side effects', async () => {
    const ctx = new Context()
    const register = vi.fn(() => () => {})
    ctx.provide('invariants', { register })
    await invariantApply(ctx)
    expect(register).toHaveBeenCalledWith('dsh-desktop-pet', expect.any(Function))
  })
})
