/** Parsed DeepSeek `/user/balance` payload. */
export interface DeepSeekBalance {
    readonly balance: number | null;
    readonly currency: string | null;
}
/**
 * Parse one `/user/balance` response body. `JSON.parse` failures are
 * caller-owned; a missing or non-numeric `total_balance` folds to `null`.
 * @param body - raw response text.
 * @returns the first balance info entry's total and currency.
 */
export declare function parseBalanceResponse(body: string): DeepSeekBalance;
/**
 * Read the balance endpoint with the provided API key. Non-2xx responses
 * throw; the endpoint base keeps its configured form.
 * @param baseUrl - configured API base (for example `https://api.deepseek.com`).
 * @param apiKey - resolved `DEEPSEEK_API_KEY` value.
 * @returns the parsed balance payload.
 */
export declare function fetchBalance(baseUrl: string, apiKey: string): Promise<DeepSeekBalance>;
//# sourceMappingURL=balance.d.ts.map