import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchBalance, parseBalanceResponse } from '../src/balance.ts'

const VALID_BODY = JSON.stringify({
  is_available: true,
  balance_infos: [{ currency: 'CNY', total_balance: '88.50' }],
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('parseBalanceResponse', () => {
  it('parses the first balance info entry', () => {
    expect(parseBalanceResponse(VALID_BODY)).toEqual({ balance: 88.5, currency: 'CNY' })
  })

  it('folds a missing balance_infos array to null balance', () => {
    expect(parseBalanceResponse('{"is_available":true}')).toEqual({
      balance: null, currency: null,
    })
  })

  it('folds a non-numeric total_balance to null balance', () => {
    const body = JSON.stringify({ balance_infos: [{ currency: 'USD', total_balance: 'n/a' }] })
    expect(parseBalanceResponse(body)).toEqual({ balance: null, currency: 'USD' })
  })

  it('folds a missing currency to null', () => {
    const body = JSON.stringify({ balance_infos: [{ total_balance: '12' }] })
    expect(parseBalanceResponse(body)).toEqual({ balance: 12, currency: null })
  })

  it('propagates a JSON.parse failure', () => {
    expect(() => parseBalanceResponse('not json')).toThrow()
  })
})

describe('fetchBalance', () => {
  it('fetches and parses a successful response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => VALID_BODY,
    })))
    await expect(fetchBalance('https://api.deepseek.com', 'sk-test')).resolves.toEqual({
      balance: 88.5, currency: 'CNY',
    })
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    const call = vi.mocked(fetch).mock.calls[0]
    expect(call).toBeDefined()
    expect(call?.[0]).toBe('https://api.deepseek.com/user/balance')
    expect(call?.[1]).toMatchObject({ headers: { authorization: 'Bearer sk-test' } })
  })

  it('strips a trailing slash from the base URL', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => VALID_BODY,
    })))
    await fetchBalance('https://api.deepseek.com/', 'sk-test')
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://api.deepseek.com/user/balance')
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401 })))
    await expect(fetchBalance('https://api.deepseek.com', 'bad')).rejects.toThrow(
      'balance endpoint returned HTTP 401',
    )
  })

  it('propagates a parse failure from a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => 'not json',
    })))
    await expect(fetchBalance('https://api.deepseek.com', 'sk-test')).rejects.toThrow()
  })
})
