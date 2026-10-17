/** Host PI streams carrying events produced by the pinned local PI provider. */
import { normalizeContext } from '@earendil-works/pi-ai'
import type { Api, AssistantMessageEventStream, Provider, StreamOptions } from '@earendil-works/pi-ai'
import type { Provider as HostProvider } from '@earendil-works/pi-ai-host'
import { AssistantMessageEventStream as HostStream } from '@earendil-works/pi-ai-host/utils/event-stream'

/** Relay unexpected producer failures to both stream consumers instead of leaving them pending. */
class ForwardedStream extends HostStream {
  private failure: { error: unknown } | undefined
  private readonly forwarding: Promise<void>

  constructor(source: AssistantMessageEventStream) {
    super()
    this.forwarding = (async () => {
      try {
        for await (const event of source) this.push(event)
        this.end(await source.result())
      } catch (error) {
        this.failure = { error }
        this.end()
      }
    })()
  }

  override async *[Symbol.asyncIterator]() {
    for await (const event of { [Symbol.asyncIterator]: () => super[Symbol.asyncIterator]() }) yield event
    if (this.failure !== undefined) throw this.failure.error
  }

  override async result() {
    await this.forwarding
    if (this.failure !== undefined) throw this.failure.error
    return super.result()
  }
}

function forward(source: AssistantMessageEventStream) {
  return new ForwardedStream(source)
}

/** Preserve the local provider while returning streams minted by the host PI version.
 * @param provider - configured PI 0.87.1 Codex provider.
 * @returns host-compatible provider with unchanged request and catalog behavior.
 */
export function bridgePiProvider(provider: Provider): HostProvider {
  const { fetchDeferred, ...methods } = provider
  return {
    ...methods,
    stream(model, context, options) {
      const localOptions: (StreamOptions & Record<string, unknown>) | undefined =
        options === undefined ? undefined : { ...options }
      return forward(provider.stream<Api>(model, normalizeContext(context), localOptions))
    },
    streamSimple(model, context, options) {
      return forward(provider.streamSimple(model, normalizeContext(context), options))
    },
    ...fetchDeferred === undefined ? {} : {
      fetchDeferred: (model, handle, options) => forward(fetchDeferred.call(provider, model, handle, options)),
    },
  }
}
