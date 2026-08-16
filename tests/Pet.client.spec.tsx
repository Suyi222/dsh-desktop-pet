// @vitest-environment jsdom
// Pet widget behavior: phase label, sea-level balance, error text, minimize/restore,
// and the click pet — driven purely through props, no wire.

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import type { PetSnapshotValue } from '../src/client.ts'
// Type-only: pulls the LocaleNamespaceMap merge so PetProps carries `t`.
import type {} from '../src/client/index.ts'
import { Pet, type PetProps } from '../src/client/Pet.tsx'
import { zh } from '../src/client/locales.ts'

const t: PetProps['t'] = makeTranslate(zh, commonZh)

function snapshot(over: Partial<PetSnapshotValue> = {}): PetSnapshotValue {
  return {
    phase: 'idle',
    tool: null,
    elapsed: 0,
    error: null,
    balance: null,
    balanceCurrency: null,
    balancePending: true,
    balanceError: null,
    balanceScale: 100,
    ...over,
  }
}

/** A selector hook bound to a live store so act() updates re-render the widget. */
function snapshotHook(store: SnapshotStore<PetSnapshotValue | null>): PetProps['usePetSnapshot'] {
  return ((selector: (value: PetSnapshotValue | null) => unknown) => {
    const value = useSyncExternalStore(listener => store.subscribe(listener), () => store.getSnapshot())
    return selector(value)
  }) as PetProps['usePetSnapshot']
}

function renderPet(value: PetSnapshotValue | null): SnapshotStore<PetSnapshotValue | null> {
  const store = createSnapshotStore<PetSnapshotValue | null>(value)
  const props = { usePetSnapshot: snapshotHook(store), t } as unknown as PetProps
  render(<Pet {...props} />)
  return store
}

afterEach(cleanup)

describe('Pet', () => {
  it('renders the resting label and querying balance while no snapshot has landed', () => {
    renderPet(snapshot())
    expect(screen.getByText('休息中')).toBeTruthy()
    expect(screen.getByText('…')).toBeTruthy()
  })

  it('renders the balance amount and scaled sea level for a healthy balance', () => {
    renderPet(snapshot({ balance: 88.5, balanceCurrency: 'CNY', balancePending: false }))
    expect(screen.getByText('¥88.50')).toBeTruthy()
    expect(screen.getByTestId('pet-sea-level').getAttribute('style')).toContain('translateY(19.0')
  })

  it('shows the tool name while working', () => {
    renderPet(snapshot({ phase: 'working', tool: 'bash', balancePending: false, balance: 50 }))
    expect(screen.getByText('工作中')).toBeTruthy()
    expect(screen.getByText('bash')).toBeTruthy()
  })

  it('shows the error text and alert while errored', () => {
    renderPet(snapshot({ phase: 'error', error: 'boom', balancePending: false, balance: 50 }))
    expect(screen.getByText(/boom/)).toBeTruthy()
    expect(screen.getByText('❗')).toBeTruthy()
  })

  it('pets on click: a low-balance chatter line appears', () => {
    renderPet(snapshot({ balance: 5, balancePending: false }))
    fireEvent.click(screen.getByText('休息中'))
    expect(screen.getByText(/余额快见底啦|该充值了|快没电了/)).toBeTruthy()
  })

  it('minimizes to the restore dot and restores on click', () => {
    renderPet(snapshot())
    fireEvent.click(screen.getByTitle('最小化'))
    expect(screen.getByTitle('显示小助手')).toBeTruthy()
    fireEvent.click(screen.getByTitle('显示小助手'))
    expect(screen.getByText('休息中')).toBeTruthy()
  })

  it('reflects a later snapshot through the store', () => {
    const store = renderPet(snapshot())
    act(() => { store.set(snapshot({ phase: 'thinking', balancePending: false, balance: 60 })) })
    expect(screen.getByText('思考中')).toBeTruthy()
  })
})
