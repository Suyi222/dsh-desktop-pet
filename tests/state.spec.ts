import { describe, expect, it } from 'vitest'
import {
  applyAgentError,
  applyAgentStatus,
  applyToolEnd,
  applyToolStart,
  createPetState,
} from '../src/state.ts'

const NOW = 1_700_000_000_000

describe('pet-status state fold', () => {
  it('creates the idle state', () => {
    expect(createPetState(NOW)).toEqual({
      phase: 'idle', running: false, tool: null, since: NOW, error: null,
    })
  })

  it('opens thinking when an idle agent starts running', () => {
    const next = applyAgentStatus(createPetState(NOW), 'running', NOW + 1000)
    expect(next).toMatchObject({ phase: 'thinking', running: true, since: NOW + 1000 })
  })

  it('keeps the phase when a running agent stays running', () => {
    const running = applyAgentStatus(createPetState(NOW), 'running', NOW)
    const working = applyToolStart(running, 'read', NOW + 100)
    const next = applyAgentStatus(working, 'running', NOW + 200)
    expect(next).toMatchObject({ phase: 'working', running: true, since: NOW + 100 })
  })

  it('resets to idle when the agent stops', () => {
    const running = applyAgentStatus(createPetState(NOW), 'running', NOW)
    const working = applyToolStart(running, 'read', NOW + 100)
    const error = applyAgentError(working, 'boom', NOW + 200)
    const next = applyAgentStatus(error, 'idle', NOW + 300)
    expect(next).toEqual({
      phase: 'idle', running: false, tool: null, error: null, since: NOW + 300,
    })
  })

  it('folds a tool start into working', () => {
    const running = applyAgentStatus(createPetState(NOW), 'running', NOW)
    const next = applyToolStart(running, 'bash', NOW + 100)
    expect(next).toMatchObject({ phase: 'working', tool: 'bash', since: NOW + 100 })
  })

  it('returns to thinking after a tool ends while running', () => {
    const running = applyAgentStatus(createPetState(NOW), 'running', NOW)
    const working = applyToolStart(running, 'bash', NOW + 100)
    const next = applyToolEnd(working, NOW + 200)
    expect(next).toMatchObject({ phase: 'thinking', tool: null, since: NOW + 200 })
  })

  it('clears the tool but stays idle after a tool ends while idle', () => {
    const idle = createPetState(NOW)
    const next = applyToolEnd(idle, NOW + 100)
    expect(next).toEqual({ ...idle, tool: null })
  })

  it('folds an agent error into error', () => {
    const running = applyAgentStatus(createPetState(NOW), 'running', NOW)
    const next = applyAgentError(running, 'boom', NOW + 100)
    expect(next).toMatchObject({ phase: 'error', error: 'boom', since: NOW + 100 })
  })
})
