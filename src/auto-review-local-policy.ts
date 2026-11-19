/** Node-free operator authorization scopes shared by Host settings and Client configuration. */

/** Closed local authorization choices; enabling the remote reviewer does not select a broader scope. */
export const AUTO_REVIEW_LOCAL_POLICIES = ['manual', 'workspace-read', 'workspace-files'] as const

/** Manual has no standing grant; the other values grant only locally eligible ordinary file operations. */
export type AutoReviewLocalPolicy = typeof AUTO_REVIEW_LOCAL_POLICIES[number]

/**
 * Parse an explicit local scope without accepting a model-authored authorization label.
 * @param value - stored or submitted setting; omission preserves the manual default.
 * @returns the selected scope, or manual when omitted.
 * @throws TypeError for every unrecognized explicit value.
 */
export function parseAutoReviewLocalPolicy(value: unknown): AutoReviewLocalPolicy {
  if (value === undefined) return 'manual'
  if (value === 'manual' || value === 'workspace-read' || value === 'workspace-files') return value
  throw new TypeError('autoReviewLocalPolicy must be manual, workspace-read, or workspace-files')
}
