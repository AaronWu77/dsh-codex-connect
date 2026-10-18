/** Runtime search-route adapter for the supported DeepSeek Harness release. */

import type WebRuntime from '@deepseek-ai/dsh-web'

function readSearchProvider(web: WebRuntime): string | undefined {
  if (typeof web.getSearchProvider !== 'function' || typeof web.setSearchProvider !== 'function') {
    throw new Error('The installed DeepSeek Harness does not expose the supported search route API')
  }
  const value = web.getSearchProvider()
  if (value !== undefined && typeof value !== 'string') {
    throw new Error('The installed DeepSeek Harness returned an invalid search route')
  }
  return value
}

function writeSearchProvider(web: WebRuntime, provider: string | undefined): void {
  if (typeof web.setSearchProvider !== 'function') {
    throw new Error('The installed DeepSeek Harness does not expose the supported search route API')
  }
  web.setSearchProvider(provider)
  if (readSearchProvider(web) !== provider) {
    throw new Error('The installed DeepSeek Harness refused the search route change')
  }
}

/**
 * Select one provider in the supported DSH runtime and return an idempotent restore operation.
 * The restore preserves a newer third-party route change instead of overwriting it.
 * @param web - active DSH web runtime.
 * @param provider - registered provider id selected while the capability is enabled.
 * @returns disposer that restores the route observed before selection.
 */
export function selectOpenAICodexSearchRoute(web: WebRuntime, provider: string): () => void {
  const previous = readSearchProvider(web)
  writeSearchProvider(web, provider)
  let active = true
  return () => {
    if (!active) return
    active = false
    if (readSearchProvider(web) === provider) writeSearchProvider(web, previous)
  }
}
