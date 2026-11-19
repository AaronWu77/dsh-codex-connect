/** Browser-safe identity shared by Codex account routes and Composer controls. */

/** Primary Harness route and pi-ai provider id owned by this bundle. */
export const OPENAI_CODEX_PROVIDER = 'openai-codex'

/**
 * Match the primary route or its numeric account suffix, never another provider's suffix.
 * @param routeId - Harness provider route id.
 * @returns Whether this bundle owns the primary or a numbered Codex account route.
 */
export function isOpenAICodexRouteId(routeId: string): boolean {
  if (routeId === OPENAI_CODEX_PROVIDER) return true
  const prefix = `${OPENAI_CODEX_PROVIDER}-`
  return routeId.startsWith(prefix) && /^\d+$/u.test(routeId.slice(prefix.length))
}
