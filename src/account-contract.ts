/** Node-free account contract shared by the Host and browser plugin halves. */

/** Prefix of the browser-safe key derived from one provider account id. */
export const OPENAI_CODEX_ACCOUNT_KEY_PREFIX = 'acct_'

/** Exact browser-safe account key: the prefix plus a SHA-256 base64url digest. */
export const OPENAI_CODEX_ACCOUNT_KEY_PATTERN = /^acct_[A-Za-z0-9_-]{43}$/u

/** Maximum number of stored OpenAI Codex accounts. */
export const OPENAI_CODEX_ACCOUNT_LIMIT = 16

/** Account-key characters kept in every short human-readable account label. */
export const OPENAI_CODEX_ACCOUNT_LABEL_LENGTH = 6

/**
 * Read the short key-derived suffix that captions one account.
 * @param accountKey - browser-safe key from the credential store's account list.
 * @returns at most {@link OPENAI_CODEX_ACCOUNT_LABEL_LENGTH} key characters.
 */
export function openAICodexAccountKeySuffix(accountKey: string): string {
  return (accountKey.startsWith(OPENAI_CODEX_ACCOUNT_KEY_PREFIX)
    ? accountKey.slice(OPENAI_CODEX_ACCOUNT_KEY_PREFIX.length)
    : accountKey).slice(0, OPENAI_CODEX_ACCOUNT_LABEL_LENGTH)
}

/**
 * Build the short, stable account caption shown beside quota figures, for
 * example `acct 43a31b`. It is derived only from the already-hashed account
 * key, so it can never carry an email, token, or provider account id.
 * @param accountKey - browser-safe key from the credential store's account list.
 * @returns the caption for pickers and cell headers.
 */
export function openAICodexAccountLabel(accountKey: string): string {
  return `acct ${openAICodexAccountKeySuffix(accountKey)}`
}
