import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { selectOpenAICodexSearchRoute } from '../src/search-route-override.ts'

let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
})

describe('supported DSH search route override', () => {
  it('selects and restores idempotently, or rejects an unextended Host', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })

    const web: Parameters<typeof selectOpenAICodexSearchRoute>[0] = ctx.web
    if (typeof web.getSearchProvider !== 'function' || typeof web.setSearchProvider !== 'function') {
      expect(() => selectOpenAICodexSearchRoute(web, 'openai-codex'))
        .toThrow('does not expose the supported search route API')
      return
    }
    const restore = selectOpenAICodexSearchRoute(web, 'openai-codex')
    expect(web.getSearchProvider()).toBe('openai-codex')

    restore()
    restore()
    expect(web.getSearchProvider()).toBe('deepseek-official')
  })

  it('preserves another owner, or rejects an unextended Host', async () => {
    const ctx = new Context()
    context = ctx
    await ctx.plugin(WebRuntime, { searchProvider: 'deepseek-official' })

    const web: Parameters<typeof selectOpenAICodexSearchRoute>[0] = ctx.web
    if (typeof web.getSearchProvider !== 'function' || typeof web.setSearchProvider !== 'function') {
      expect(() => selectOpenAICodexSearchRoute(web, 'openai-codex'))
        .toThrow('does not expose the supported search route API')
      return
    }
    const restore = selectOpenAICodexSearchRoute(web, 'openai-codex')
    web.setSearchProvider('new-owner')
    restore()

    expect(web.getSearchProvider()).toBe('new-owner')
  })

  it('rejects an unsupported runtime before changing it', () => {
    expect(() => selectOpenAICodexSearchRoute({} as WebRuntime, 'openai-codex'))
      .toThrow('does not expose the supported search route API')
  })
})
