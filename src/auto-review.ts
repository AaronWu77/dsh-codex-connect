/** DSH approval-answerer and exact human-command retries with owned cancellation and draining. */

import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import type { ApprovalRequestEvent } from '@deepseek-ai/dsh-user-approval/types'
import type { AutoReviewBackend } from './auto-review-backend.ts'
import { OpenAICodexAutoReviewBackend } from './auto-review-backend.ts'
import { AutoReviewState, buildAutoReviewContext, hasAutoReviewCommandReceipt, redactAutoReviewText } from './auto-review-contract.ts'
import type { AutoReviewLocalPolicy, AutoReviewPreflight } from './auto-review-preflight.ts'
import { resolveAutoReviewPreflight, sameAutoReviewSnapshot } from './auto-review-preflight.ts'
import { OPENAI_CODEX_PROVIDER } from './store.ts'
import { isOpenAICodexRouteId } from './account-route-id.ts'
import type { OpenAICodexCredentialStore } from './store.ts'
import type { OpenAICodexProxyManager } from './provider-proxy.ts'

const REJECTION_GUIDANCE = 'Do not attempt the same outcome through a workaround, indirect execution, or policy circumvention. Stop this action and work that depends on it; continue independent, already-authorized work. Report the blocked dependency. Retrying the denied action requires exact-action user approval and must still respect higher-priority restrictions.'
type Decision = ApprovalOutcome | 'delegate'

/** Instance-owned policy and metadata resolver; absent local authorization defaults to manual. */
export interface AutoReviewAnswererOptions {
  readonly resolveLocalPolicy?: () => AutoReviewLocalPolicy
  readonly resolvePreflight?: (request: ApprovalRequestEvent, policy: AutoReviewLocalPolicy, signal: AbortSignal) => Promise<AutoReviewPreflight>
  readonly enabled?: () => boolean
  readonly resolveRouteAccountKey?: (provider: string, signal: AbortSignal) => Promise<string | undefined>
}

function notice(summary: string, text: string) {
  return createUserMessage({
    source: { kind: 'dsh-codex-connect' as const, form: 'notice' as const, summary },
    content: [{ type: 'text' as const, text }],
  })
}

/** Owns admitted local checks and remote reviews, but not the delegated human answerer. */
export class OpenAICodexAutoReviewAnswerer {
  private readonly lifecycle = new AbortController()
  private accountSelection = new AbortController()
  private readonly operations = new Set<Promise<unknown>>()
  private disposal: Promise<void> | undefined
  private readonly resolveLocalPolicy: () => AutoReviewLocalPolicy
  private readonly resolvePreflight: NonNullable<AutoReviewAnswererOptions['resolvePreflight']>
  private readonly enabled: () => boolean

  constructor(
    private readonly backend: AutoReviewBackend,
    readonly state: AutoReviewState = new AutoReviewState(),
    private readonly log: (message: string) => void = () => undefined,
    private readonly options: AutoReviewAnswererOptions = {},
  ) {
    this.resolveLocalPolicy = options.resolveLocalPolicy ?? (() => 'manual')
    this.resolvePreflight = options.resolvePreflight ?? resolveAutoReviewPreflight
    this.enabled = options.enabled ?? (() => true)
  }

  private own<T>(signal: AbortSignal | undefined, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const control = AbortSignal.any([this.lifecycle.signal, this.accountSelection.signal, ...signal === undefined ? [] : [signal]])
    const pending = Promise.resolve().then(() => operation(control))
    this.operations.add(pending)
    void pending.then(() => this.operations.delete(pending), () => this.operations.delete(pending))
    return pending
  }

  /**
   * Decide one exact request, or call next without owning the human answerer's lifetime.
   * @param request - public Host request; caller cancellation prevents late state publication.
   * @param next - remaining answerers; only the Host service can enforce its never policy.
   * @returns a one-shot grant backed by local authority, a non-grant, or the delegated result.
   */
  answer(request: ApprovalRequestEvent, next: () => Promise<ApprovalOutcome>): Promise<ApprovalOutcome> {
    const accountSignal = this.accountSelection.signal
    return this.own(request.signal, signal => this.decide({ ...request, signal }, signal))
      .then(result => accountSignal.aborted || this.lifecycle.signal.aborted || request.signal?.aborted === true ? 'cancelled' : result === 'delegate' ? next() : result)
  }

  private async decide(request: ApprovalRequestEvent, signal: AbortSignal): Promise<Decision> {
    if (signal.aborted) return 'cancelled'
    if (!this.enabled()) { this.state.disarm(request.agent); return 'delegate' }
    const provider = request.agent.session.requestHeader()?.config.provider
    if (provider === undefined || !isOpenAICodexRouteId(provider)) {
      this.state.disarm(request.agent)
      return 'delegate'
    }
    let accountKey: string | undefined
    if (this.options.resolveRouteAccountKey !== undefined) {
      try { accountKey = await this.options.resolveRouteAccountKey(provider, signal) } catch (error) {
        return signal.aborted ? 'cancelled' : 'delegate'
      }
      if (signal.aborted) return 'cancelled'
      if (accountKey === undefined) return 'delegate'
    } else if (provider !== OPENAI_CODEX_PROVIDER) return 'delegate'
    let preflight: AutoReviewPreflight
    try { preflight = await this.resolvePreflight(request, this.resolveLocalPolicy(), signal) } catch (error) {
      if (signal.aborted) return 'cancelled'
      this.state.disarm(request.agent)
      this.log('Codex Auto-review delegated because local metadata is unavailable')
      return 'delegate'
    }
    if (signal.aborted) return 'cancelled'
    if (!this.enabled()) { this.state.disarm(request.agent); return 'delegate' }
    if (preflight.kind === 'human') {
      this.state.disarm(request.agent)
      return 'delegate'
    }
    const { action, snapshot } = preflight
    const override = this.state.consume(request.agent, action, snapshot)
    if (override === 'matched') {
      this.state.recordDecision(request.agent, action, false, 'Explicit exact-action human command')
      this.log('Codex Auto-review allowed one locally revalidated exact retry ' + action.fingerprint)
      return 'allowed-once'
    }
    if (override === 'mismatched') {
      request.agent.inject(notice('The approved retry needs fresh human approval.',
        'The one-shot approval was consumed because the action, directory, local scope, or target metadata changed. The host must review this action again.'))
      return 'delegate'
    }
    if (this.state.breakerOpen(request.agent, action.turn)) return 'delegate'
    const context = buildAutoReviewContext(request.agent)
    if (context.hasTrustedUserEvidence !== true) return 'delegate'
    let result
    try {
      result = await this.backend.review({ action, context, signal, ...(accountKey === undefined ? {} : { accountKey }) })
    } catch (error) {
      if (signal.aborted) return 'cancelled'
      this.log('Codex Auto-review delegated because the reviewer request failed')
      return 'delegate'
    }
    if (signal.aborted) return 'cancelled'
    if (!this.enabled()) return 'delegate'
    if (result.status === 'unavailable') return 'delegate'
    if (result.status === 'cancelled') return 'cancelled'
    if (result.status === 'timeout') {
      const retry = this.state.allowTimeoutRetry(request.agent, action)
      request.agent.inject(notice('Codex Auto-review timed out.', retry
        ? 'Codex Auto-review timed out before deciding this action. The action was not authorized. You may retry this exact action once or ask the user for approval.'
        : 'Codex Auto-review timed out again for this exact action. The action was not authorized; ask the user for approval instead of retrying the reviewer.'))
      return retry ? 'rejected' : 'delegate'
    }
    const assessment = result.assessment
    const denied = assessment.outcome === 'deny'
    if (!denied) {
      let current: AutoReviewPreflight
      try { current = await this.resolvePreflight(request, this.resolveLocalPolicy(), signal) } catch (error) {
        return signal.aborted ? 'cancelled' : 'delegate'
      }
      if (signal.aborted) return 'cancelled'
      if (!this.enabled() || current.kind !== 'eligible' || current.action.fingerprint !== action.fingerprint
        || !sameAutoReviewSnapshot(snapshot, current.snapshot)) return 'delegate'
      if (snapshot.policy === 'manual' || assessment.risk_level === 'high' || assessment.risk_level === 'critical'
        || assessment.user_authorization === 'unknown'
        || (assessment.risk_level === 'medium' || snapshot.riskFloor === 'medium') && assessment.user_authorization === 'low') return 'delegate'
    }
    const rationale = redactAutoReviewText(assessment.rationale).text
    const exactRetryAllowed = assessment.risk_level !== 'high' && assessment.risk_level !== 'critical'
    const denial = this.state.recordDecision(request.agent, action, denied, rationale, snapshot, exactRetryAllowed)
    this.log('Codex Auto-review ' + (denied ? 'denied ' : 'allowed ') + action.fingerprint
      + ' risk=' + assessment.risk_level + ' authorization=' + assessment.user_authorization)
    if (!denied) return 'allowed-once'
    request.agent.inject(notice('Codex Auto-review denied an action.',
      'Untrusted reviewer rationale: ' + rationale + '\n' + REJECTION_GUIDANCE
      + (denial?.exactRetryAllowed ? '\nA user can approve one exact retry with /approve ' + denial.id + '.' : '\nThis risk requires the host human approval chain.')))
    if (this.state.breakerOpen(request.agent, action.turn)) {
      request.agent.cancel({ kind: 'hook', reason: 'Codex Auto-review denial circuit breaker opened' }, { keepInbox: true })
    }
    return 'rejected'
  }

  /**
   * Accept only a live, logged human command; target changes and cancellation leave no new grant.
   * The later retry additionally requires the runtime's successful command/done record.
   * @param invocation - human command invocation whose command/run is already committed.
   * @returns success after arming a single exact retry, or a visible refusal without new authority.
   */
  approveExactRetry(invocation: CommandInvocation): Promise<CommandResult> {
    return this.own(invocation.signal, async signal => {
      if (signal.aborted || !this.enabled()) return { kind: 'error', text: 'Codex Auto-review is disabled or the command was cancelled.' }
      const id = invocation.rawInput.trim()
      const denial = this.state.denials(invocation.agent).find(candidate => candidate.id === id)
      if (denial?.snapshot === undefined || !denial.exactRetryAllowed) return { kind: 'error', text: 'Choose a locally eligible recent denial with /approve <full-id>.' }
      if (!hasAutoReviewCommandReceipt(invocation.agent, invocation.commandId, denial.id, false)) return { kind: 'error', text: 'This retry requires a command submitted through the human command interface.' }
      let current: AutoReviewPreflight
      try {
        current = await this.resolvePreflight({ agent: invocation.agent, toolName: denial.action.toolName, callId: denial.action.callId, signal }, this.resolveLocalPolicy(), signal)
      } catch (error) { return { kind: 'error', text: 'The current target cannot be revalidated. Ask the host for fresh approval.' } }
      if (signal.aborted || !this.enabled()) return { kind: 'error', text: 'The command was cancelled or Auto-review was disabled; no retry was authorized.' }
      if (current.kind !== 'eligible' || current.action.fingerprint !== denial.fingerprint || !sameAutoReviewSnapshot(denial.snapshot, current.snapshot)) {
        return { kind: 'error', text: 'The action, directory, authorization scope, or target changed. Ask the host for fresh approval.' }
      }
      invocation.agent.inject(notice('One exact retry was approved by a user command.',
        'The user command approved one retry of denial ' + denial.id + '. Retry the same tool, arguments, and directory through the normal tool interface. This does not authorize other actions or override host restrictions.'))
      if (signal.aborted) return { kind: 'error', text: 'The command was cancelled; no retry was authorized.' }
      if (this.state.arm(invocation.agent, denial.id, invocation.commandId) === undefined) return { kind: 'error', text: 'That denial is no longer available.' }
      return { kind: 'success', text: 'Approved one exact retry for ' + denial.toolName + ' (' + denial.id + ').' }
    })
  }

  /** Revoke pending grants and cancel reviews across every committed account command, including away/back. */
  invalidateAccountSelections(): void {
    this.accountSelection.abort(new Error('Codex account selection changed'))
    this.state.clear()
    this.accountSelection = new AbortController()
  }

  /**
   * Stop admission, cancel owned work, await settlement, and revoke pending retries before dependencies close.
   * @returns the shared quiescent disposal promise; an uncooperative admitted operation keeps it pending.
   */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal
    this.lifecycle.abort(new Error('Codex Auto-review disposed'))
    this.disposal = Promise.allSettled([...this.operations]).then(() => { this.state.clear() })
    return this.disposal
  }
}

/**
 * Install the default-manual answerer and effect-owned human command.
 * The enclosing owner must await dispose before releasing shared proxy resources.
 * @param ctx - contribution owner for the listener, command and cancellation lifetime.
 * @param credentials - private OAuth store used only by the remote transport.
 * @param proxyManager - shared transport owner, kept usable until reviewer disposal settles.
 * @param resolveProxyUrl - current provider proxy selection.
 * @param enabled - current opt-in and disclosure acknowledgment.
 * @param resolveLocalPolicy - explicit local authorization scope; omission means manual.
 * @param resolveRouteAccountKey - current Host account binding; missing secondary bindings delegate to a human.
 * @returns the owner whose dispose method drains all admitted review and command work.
 */
export function registerOpenAICodexAutoReview(
  ctx: Context,
  credentials: OpenAICodexCredentialStore,
  proxyManager: OpenAICodexProxyManager,
  resolveProxyUrl: () => string | undefined,
  enabled: () => boolean,
  resolveLocalPolicy: () => AutoReviewLocalPolicy = () => 'manual',
  resolveRouteAccountKey?: (provider: string, signal: AbortSignal) => Promise<string | undefined>,
): OpenAICodexAutoReviewAnswerer {
  const answerer = new OpenAICodexAutoReviewAnswerer(
    new OpenAICodexAutoReviewBackend(credentials, proxyManager, resolveProxyUrl), new AutoReviewState(),
    message => { ctx.logger.info(message) }, { resolveLocalPolicy, enabled, ...(resolveRouteAccountKey === undefined ? {} : { resolveRouteAccountKey }) },
  )
  ctx.on('approval/request', (request, next) => answerer.answer(request, next), { prepend: true })
  ctx.effect(() => () => answerer.dispose(), 'dsh-codex-connect: Auto-review lifecycle')
  ctx.inject(['commands'], commandCtx => commandCtx.commands.register({
    name: 'approve', description: 'Approve one exact locally eligible action denied by Codex Auto-review',
    input: { hint: 'full denial id' }, recordInput: true,
    handler: invocation => answerer.approveExactRetry(invocation),
  }))
  return answerer
}
