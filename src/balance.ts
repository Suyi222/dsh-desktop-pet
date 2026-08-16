/** Parsed DeepSeek `/user/balance` payload. */
export interface DeepSeekBalance {
  readonly balance: number | null
  readonly currency: string | null
}

interface BalanceResponseBody {
  readonly is_available?: boolean
  readonly balance_infos?: ReadonlyArray<{
    readonly currency?: string
    readonly total_balance?: string
  }>
}

/**
 * Parse one `/user/balance` response body. `JSON.parse` failures are
 * caller-owned; a missing or non-numeric `total_balance` folds to `null`.
 * @param body - raw response text.
 * @returns the first balance info entry's total and currency.
 */
export function parseBalanceResponse(body: string): DeepSeekBalance {
  const data = JSON.parse(body) as unknown as BalanceResponseBody
  const info = data.balance_infos?.[0]
  const total = info !== undefined && typeof info.total_balance === 'string'
    ? Number.parseFloat(info.total_balance)
    : Number.NaN
  return {
    balance: Number.isFinite(total) ? total : null,
    currency: info?.currency ?? null,
  }
}

/**
 * Read the balance endpoint with the provided API key. Non-2xx responses
 * throw; the endpoint base keeps its configured form.
 * @param baseUrl - configured API base (for example `https://api.deepseek.com`).
 * @param apiKey - resolved `DEEPSEEK_API_KEY` value.
 * @returns the parsed balance payload.
 */
export async function fetchBalance(baseUrl: string, apiKey: string): Promise<DeepSeekBalance> {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/user/balance`, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`balance endpoint returned HTTP ${response.status}`)
  return parseBalanceResponse(await response.text())
}
