/** Node-free quota route contract shared by the Host route and the browser service. */

import type { OpenAICodexUsage } from './usage.ts'

/** Same-origin endpoint exposing every non-active stored account's rolling windows. */
export const OPENAI_CODEX_QUOTA_PATH = '/plugins/dsh-openai-codex/quota'

/** One stored account's quota result from one Host read. */
export interface OpenAICodexQuotaAccount {
  /** Stable browser-safe account key. */
  readonly accountKey: string
  /** Secret-free rolling windows when this read succeeded. */
  readonly usage?: OpenAICodexUsage
  /** True when this read could not produce figures; the client keeps its last ones. */
  readonly unavailable?: true
}

/** Per-account quota response returned by the Host route. */
export interface OpenAICodexQuotaPayload {
  /**
   * One entry per stored account except the store's active account, which the
   * browser reads from the account store's own polled snapshot. Entries follow
   * the credential document's order.
   */
  readonly accounts: readonly OpenAICodexQuotaAccount[]
}
