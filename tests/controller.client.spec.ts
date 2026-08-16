import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { PetSnapshotValue } from '../src/client.ts'
import { PetController, type PetStatusRemote } from '../src/client/controller.ts'

const sid = (key: string): SessionId => key as SessionId

function snapshotValue(): PetSnapshotValue {
  return {
    phase: 'working',
    tool: 'bash',
    elapsed: 2,
    error: null,
    balance: 50,
    balanceCurrency: 'CNY',
    balancePending: false,
    balanceError: null,
    balanceScale: 100,
  }
}

function remote(script: (request: { readonly sessionId: SessionId }) => Promise<unknown>): PetStatusRemote {
  return { snapshot: script as PetStatusRemote['snapshot'] }
}

describe('PetController', () => {
  it('starts with the seed snapshot', () => {
    const controller = new PetController(remote(vi.fn()), snapshotValue())
    expect(controller.store.getSnapshot()).toMatchObject({ phase: 'working' })
  })

  it('publishes a successful refresh into the store', async () => {
    const controller = new PetController(remote(vi.fn(async () => ({ ok: true, value: snapshotValue() }))))
    await controller.refresh(sid('s1'))
    expect(controller.store.getSnapshot()).toMatchObject({ phase: 'working', tool: 'bash' })
  })

  it('keeps the previous value when the refresh fails', async () => {
    const seed = snapshotValue()
    const controller = new PetController(remote(vi.fn(async () => ({ ok: false, error: { code: 'down' } }))), seed)
    await controller.refresh(sid('s1'))
    expect(controller.store.getSnapshot()).toEqual(seed)
  })
})
