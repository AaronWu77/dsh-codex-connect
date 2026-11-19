/** Adapter-owned request attribution, without tokens or module-global mutable state. */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { CapturedConversationSpeed } from './speed-mode-registry.ts'

interface SpeedRequestState { accountKey?: string; selection: CapturedConversationSpeed }

/** One adapter instance's asynchronous request-local account and speed capture. */
export class SpeedModeRequestScope {
  private readonly scope = new AsyncLocalStorage<SpeedRequestState>()

  /** Record only the account actually captured by the ordinary auth resolver. */
  recordAccount(accountKey: string): void { const current = this.scope.getStore(); if (current !== undefined) current.accountKey = accountKey }
  /** Current request attribution; absent means no paid selection can be confirmed. */
  current(): Readonly<SpeedRequestState> | undefined { return this.scope.getStore() }

  /** Scope the complete lazy stream, including cancellation and iterator teardown. */
  stream(stream: (options: GenerateOptions) => AsyncIterable<StreamChunk>, options: GenerateOptions,
    capture: () => CapturedConversationSpeed): AsyncIterable<StreamChunk> {
    const owner = this.scope
    return { async *[Symbol.asyncIterator]() {
      const state: SpeedRequestState = { selection: capture() }
      const iterator = owner.run(state, () => stream(options)[Symbol.asyncIterator]())
      try {
        for (;;) {
          const next = await owner.run(state, () => iterator.next())
          if (next.done) return
          yield next.value
        }
      } finally {
        try { await owner.run(state, () => iterator.return?.()) } finally { delete state.accountKey }
      }
    } }
  }
}
