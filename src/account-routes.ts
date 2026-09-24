/**
 * Stable LLM-route assignment for the multi-account Codex model picker.
 * @module dsh-codex-connect/account-routes
 */

import type { OpenAICodexAccountSummary } from './store.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import { OPENAI_CODEX_ACCOUNT_LABEL_LENGTH, openAICodexAccountKeySuffix } from './account-contract.ts'

/** One registered LLM route and the stored account it authenticates as. */
export interface OpenAICodexAccountRoute {
  /** Harness route id; the store's active account always keeps {@link OPENAI_CODEX_PROVIDER}. */
  routeId: string
  /** Selector label naming the account this route authenticates as. */
  displayName: string
  /** Account key this route is bound to; absent binds whatever is active per request. */
  accountKey?: string
}

/** Label shown for the route serving the store's active account. */
export const OPENAI_CODEX_PRIMARY_DISPLAY_NAME = 'OpenAI Codex'

/** Account-key characters kept in a secondary route label. */
export const OPENAI_CODEX_ROUTE_LABEL_SUFFIX_LENGTH = OPENAI_CODEX_ACCOUNT_LABEL_LENGTH

/** Whether a route id belongs to this plugin's Codex route family. */
export function isOpenAICodexRouteId(routeId: string): boolean {
  if (routeId === OPENAI_CODEX_PROVIDER) return true
  const suffix = routeId.slice(OPENAI_CODEX_PROVIDER.length)
  return suffix.startsWith('-') && /^\d+$/u.test(suffix.slice(1))
}

/** Build the stable selector label for one non-primary account. */
export function openAICodexAccountRouteLabel(accountKey: string): string {
  return `${OPENAI_CODEX_PRIMARY_DISPLAY_NAME} (acct ${openAICodexAccountKeySuffix(accountKey)})`
}

/** The lowest free `openai-codex-N` id at or above 2. */
function nextRouteId(used: ReadonlySet<string>): string {
  for (let index = 2; ; index += 1) {
    const candidate = `${OPENAI_CODEX_PROVIDER}-${String(index)}`
    if (!used.has(candidate)) return candidate
  }
}

/**
 * Assigns one LLM route per stored account. The active account always holds
 * the primary id `openai-codex`, so existing settings, defaults, and the
 * settings card keep addressing the user's current selection. Every other
 * account receives `openai-codex-2`, `openai-codex-3`, ... in credential
 * document order at first sight, and keeps that id for as long as it stays
 * non-primary while this registry lives, so no account moves between ids
 * mid-session. Activating an account and then activating another one swaps
 * accounts between the primary id and a secondary id; that swap is inherent
 * to pinning the primary id to the current selection.
 */
export class OpenAICodexAccountRouteRegistry {
  private readonly assigned = new Map<string, string>()

  /**
   * @param accounts - current browser-safe account summaries in document order.
   * @returns the complete route set; the primary route alone when no account is stored.
   */
  reconcile(accounts: readonly OpenAICodexAccountSummary[]): readonly OpenAICodexAccountRoute[] {
    const present = new Set(accounts.map(account => account.accountKey))
    for (const accountKey of [...this.assigned.keys()]) {
      if (!present.has(accountKey)) this.assigned.delete(accountKey)
    }
    const activeAccountKey = accounts.find(account => account.active)?.accountKey
    // An account holding the primary id is not also owed a secondary one.
    if (activeAccountKey !== undefined) this.assigned.delete(activeAccountKey)
    const used = new Set<string>([OPENAI_CODEX_PROVIDER, ...this.assigned.values()])
    // Every route names its account, including the primary one: a bare product
    // name left the picker's first entry unattributable.
    const routes: OpenAICodexAccountRoute[] = [
      {
        routeId: OPENAI_CODEX_PROVIDER,
        displayName: activeAccountKey === undefined
          ? OPENAI_CODEX_PRIMARY_DISPLAY_NAME
          : openAICodexAccountRouteLabel(activeAccountKey),
      },
    ]
    for (const account of accounts) {
      if (account.accountKey === activeAccountKey) continue
      let routeId = this.assigned.get(account.accountKey)
      if (routeId === undefined) {
        routeId = nextRouteId(used)
        this.assigned.set(account.accountKey, routeId)
      }
      used.add(routeId)
      routes.push({ routeId, displayName: openAICodexAccountRouteLabel(account.accountKey), accountKey: account.accountKey })
    }
    return routes
  }
}
