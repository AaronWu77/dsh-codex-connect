/** Codex Connect's durable user-message provenance for the merge-extensible DSH source map. */
import type { ContextFormed } from '@deepseek-ai/dsh-llm'

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'dsh-codex-connect': { kind: 'dsh-codex-connect' } & ContextFormed
  }
}
