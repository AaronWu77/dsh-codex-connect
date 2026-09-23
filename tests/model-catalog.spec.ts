import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { OAuthCredential } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { OpenAICodexCredentialStore, OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import {
  DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
  OPENAI_CODEX_MODEL_CATALOG_TTL_MS,
  OPENAI_CODEX_MODELS_URL,
  OpenAICodexModelCatalog,
  parseOpenAICodexModelsPayload,
} from '../src/model-catalog.ts'
import {
  applyOpenAICodexLiveCatalog,
  createOpenAICodexProfile,
  openAICodexModelCatalogFrom,
  openAICodexModelFamily,
  openAICodexUnavailableModels,
  isOpenAICodexKnownModelFamily,
  withOpenAICodexAstra,
} from '../src/adapter.ts'

let root: string | undefined
let clock = 1_000_000

afterEach(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  clock = 1_000_000
})

async function authenticatedStore(): Promise<OpenAICodexCredentialStore> {
  root = await mkdtemp(join(tmpdir(), 'dsh-codex-model-catalog-'))
  const store = new OpenAICodexCredentialStore(join(root, 'auth.json'))
  const credential: OAuthCredential = {
    type: 'oauth',
    access: 'access-secret',
    refresh: 'refresh-secret',
    expires: Date.now() + 3_600_000,
    accountId: 'account-1',
  }
  await store.modify(OPENAI_CODEX_PROVIDER, () => Promise.resolve(credential))
  return store
}

/** One server model record with overridable catalog facts. */
function liveModel(slug: string, patch: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug,
    display_name: slug,
    description: 'test model',
    default_reasoning_level: 'medium',
    supported_reasoning_levels: [{ effort: 'low', description: 'fast' }, { effort: 'high', description: 'deep' }],
    context_window: 272_000,
    max_context_window: 872_000,
    service_tiers: [{ id: 'priority', name: 'Fast', description: 'faster' }],
    input_modalities: ['text', 'image'],
    ...patch,
  }
}

/** The parsed catalog-layer form of one server record. */
function liveEntry(slug: string, patch: Record<string, unknown> = {}) {
  return parseOpenAICodexModelsPayload({ models: [liveModel(slug, patch)] })[0]!
}

function catalogResponse(models: readonly unknown[], headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ models }), {
    status: 200,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function catalogFor(store: OpenAICodexCredentialStore, fetchImpl: typeof fetch): OpenAICodexModelCatalog {
  if (root === undefined) throw new Error('test root was not created')
  return new OpenAICodexModelCatalog({
    credentials: store,
    cachePath: join(root, 'dsh-codex-connect-models.json'),
    clientVersion: DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
    cliCachePath: join(root, 'cli-models_cache.json'),
    fetchImpl,
    now: () => clock,
  })
}

describe('live Codex model catalog', () => {
  it('sends the version gate and active-account headers, then caches to the plugin file', async () => {
    const store = await authenticatedStore()
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return catalogResponse([liveModel('gpt-5.6-sol')], { etag: 'W/"v1"' })
    }) as unknown as typeof fetch
    const catalog = catalogFor(store, fetchImpl)

    await catalog.initialize()

    expect(calls).toHaveLength(1)
    const target = new URL(calls[0]!.url)
    expect(`${target.origin}${target.pathname}`).toBe(OPENAI_CODEX_MODELS_URL)
    expect(target.searchParams.get('client_version')).toBe(DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION)
    const headers = calls[0]!.init?.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer access-secret')
    expect(headers['chatgpt-account-id']).toBe('account-1')
    expect(headers.originator).toBe('deepseek-harness')
    expect(headers['if-none-match']).toBeUndefined()
    expect(catalog.source()).toBe('live')
    expect(catalog.models().map(model => model.slug)).toEqual(['gpt-5.6-sol'])
    const cached = JSON.parse(await readFile(join(root!, 'dsh-codex-connect-models.json'), 'utf8')) as Record<string, unknown>
    expect(cached['client_version']).toBe(DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION)
    expect(cached['etag']).toBe('W/"v1"')
    expect(cached['models']).toEqual([expect.objectContaining({ slug: 'gpt-5.6-sol', contextWindow: 272_000, maxContextWindow: 872_000 })])
  })

  it('sends If-None-Match from the cache and keeps the cached value on 304', async () => {
    const store = await authenticatedStore()
    const first = catalogFor(store, vi.fn(async () => catalogResponse([liveModel('gpt-5.6-sol')], { etag: 'W/"v1"' })) as unknown as typeof fetch)
    await first.initialize()
    clock += OPENAI_CODEX_MODEL_CATALOG_TTL_MS + 1

    const calls: RequestInit[] = []
    const conditional = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push(init ?? {})
      return new Response(null, { status: 304 })
    }) as unknown as typeof fetch
    const second = catalogFor(store, conditional)
    await second.initialize()

    expect((calls[0]?.headers as Record<string, string>)['if-none-match']).toBe('W/"v1"')
    expect(second.source()).toBe('cache')
    expect(second.models().map(model => model.slug)).toEqual(['gpt-5.6-sol'])
    // The 304 confirmed the layer in hand, so it starts the TTL like a 200 body.
    await second.refresh()
    expect(calls).toHaveLength(1)
  })

  it('falls back to the Codex CLI cache when the live read fails', async () => {
    const store = await authenticatedStore()
    await writeFile(join(root!, 'cli-models_cache.json'), JSON.stringify({
      fetched_at: 42,
      models: [liveModel('gpt-reserve'), liveModel('gpt-5.6-terra', { context_window: 1_000, max_context_window: 2_000 })],
    }))
    const catalog = catalogFor(store, vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)

    await catalog.initialize()

    expect(catalog.source()).toBe('cli-cache')
    expect(catalog.updatedAt()).toBe(42)
    expect(catalog.models().map(model => model.slug)).toEqual(['gpt-reserve', 'gpt-5.6-terra'])
    expect(catalog.models()[1]).toMatchObject({ contextWindow: 1_000, maxContextWindow: 2_000 })
  })

  it('recovers official GPT-6 variants from the CLI cache when the live read fails', async () => {
    const store = await authenticatedStore()
    await writeFile(join(root!, 'cli-models_cache.json'), JSON.stringify({
      fetched_at: '2026-09-23T09:26:11.298831200Z',
      models: [liveModel('gpt-6-sol'), liveModel('gpt-6-luna')],
    }))
    const catalog = catalogFor(store, vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)

    await catalog.initialize()

    expect(catalog.source()).toBe('cli-cache')
    expect(catalog.models().map(model => model.slug)).toEqual(['gpt-6-sol', 'gpt-6-luna'])
    expect(openAICodexModelCatalogFrom({ live: catalog.models(), mode: 'default' })
      .filter(model => model.id.startsWith('gpt-6-')).map(model => model.id))
      .toEqual(['gpt-6-astra', 'gpt-6-sol', 'gpt-6-luna'])
  })
  it('reads the official client\'s ISO-8601 fetched_at as the fallback timestamp', async () => {
    // The Codex CLI writes nanosecond digits: ~/.codex/models_cache.json.
    const stamp = '2026-09-21T21:37:47.186693100Z'
    const store = await authenticatedStore()
    await writeFile(join(root!, 'cli-models_cache.json'), JSON.stringify({
      fetched_at: stamp,
      models: [liveModel('gpt-reserve')],
    }))
    const catalog = catalogFor(store, vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch)

    await catalog.initialize()

    expect(catalog.source()).toBe('cli-cache')
    expect(catalog.updatedAt()).toBe(Date.parse(stamp))
  })

  it('retries a failed live read instead of suppressing it for the TTL', async () => {
    const store = await authenticatedStore()
    await writeFile(join(root!, 'cli-models_cache.json'), JSON.stringify({
      fetched_at: 42,
      models: [liveModel('gpt-reserve')],
    }))
    const fetchImpl = vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch
    const catalog = catalogFor(store, fetchImpl)

    await catalog.initialize()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    await catalog.refresh()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('ends at the bundled catalog without throwing when no layer is reachable', async () => {
    const store = await authenticatedStore()
    const errors: string[] = []
    const catalog = new OpenAICodexModelCatalog({
      credentials: store,
      cachePath: join(root!, 'missing.json'),
      cliCachePath: join(root!, 'missing-cli.json'),
      clientVersion: DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
      fetchImpl: vi.fn(async () => { throw new Error('offline') }) as unknown as typeof fetch,
      now: () => clock,
      logError: message => { errors.push(message) },
    })

    await expect(catalog.initialize()).resolves.toBeUndefined()
    expect(catalog.source()).toBe('bundled')
    expect(catalog.models()).toEqual([])
    // The bundled layer still answers, so the picker never empties.
    expect(openAICodexModelCatalogFrom({ live: [], mode: 'default' }).length).toBeGreaterThan(2)
    // A failure streak is reported at most once.
    await catalog.refresh(true)
    expect(errors).toHaveLength(1)
  })

  it('treats an empty or malformed live payload as a failed read, never as an empty picker', async () => {
    const store = await authenticatedStore()
    const empty = catalogFor(store, vi.fn(async () => catalogResponse([])) as unknown as typeof fetch)
    await empty.initialize()
    expect(empty.source()).toBe('bundled')
    expect(empty.models()).toEqual([])

    clock += 1
    const malformed = catalogFor(store, vi.fn(async () => catalogResponse([{ slug: '' }])) as unknown as typeof fetch)
    await malformed.initialize()
    expect(malformed.source()).toBe('bundled')
  })

  it('does not re-read the live catalog inside the TTL and does after it expires', async () => {
    const store = await authenticatedStore()
    const fetchImpl = vi.fn(async () => catalogResponse([liveModel('gpt-5.6-sol')])) as unknown as typeof fetch
    const catalog = catalogFor(store, fetchImpl)

    await catalog.initialize()
    await catalog.refresh()
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    clock += OPENAI_CODEX_MODEL_CATALOG_TTL_MS + 1
    await catalog.refresh()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

describe('live catalog merge', () => {
  it('uses the default window by default and the extended ceiling in extended mode', () => {
    const live = [liveEntry('gpt-5.6-sol', { context_window: 272_000, max_context_window: 872_000 })]
    const standard = openAICodexModelCatalogFrom({ live, mode: 'default' }).find(model => model.id === 'gpt-5.6-sol')!
    expect(standard).toMatchObject({ contextWindow: 272_000, maxContextWindow: 872_000, contextLimitSource: 'codex-catalog' })
    const extended = openAICodexModelCatalogFrom({ live, mode: 'extended' }).find(model => model.id === 'gpt-5.6-sol')!
    expect(extended).toMatchObject({ contextWindow: 872_000, maxContextWindow: 872_000 })
    const pinned = openAICodexModelCatalogFrom({
      live: [liveEntry('gpt-5.5', { context_window: 272_000, max_context_window: 272_000 })],
      mode: 'extended',
    }).find(model => model.id === 'gpt-5.5')!
    expect(pinned).toMatchObject({ contextWindow: 272_000, maxContextWindow: 272_000 })
  })

  it('overlays the server output cap, tiers, and reasoning levels and round-trips them', () => {
    const live = [liveEntry('gpt-5.6-sol', { max_output_tokens: 64_000 })]
    const entry = openAICodexModelCatalogFrom({ live, mode: 'default' }).find(model => model.id === 'gpt-5.6-sol')!
    expect(entry.maxTokens).toBe(64_000)
    expect(entry.serviceTiers).toEqual([{ id: 'priority', name: 'Fast', description: 'faster' }])
    expect(entry.reasoningLevels?.map(level => level.effort)).toEqual(['low', 'high'])
  })

  it('adds a family-known slug and keeps an unrecognized family out of the picker', () => {
    const known = openaiCodexProvider().getModels().map(model => model.id)
    expect(openAICodexModelFamily('gpt-5.6-next')).toBe('gpt-5.6')
    expect(openAICodexModelFamily('gpt-reserve')).toBeUndefined()
    expect(openAICodexModelFamily('codex-auto-review')).toBeUndefined()
    expect(isOpenAICodexKnownModelFamily('gpt-5.6-next', known)).toBe(true)
    expect(isOpenAICodexKnownModelFamily('gpt-reserve', known)).toBe(false)

    const live = [liveEntry('gpt-5.6-next'), liveEntry('gpt-reserve'), liveEntry('codex-auto-review')]
    const ids = openAICodexModelCatalogFrom({ live, mode: 'default' }).map(model => model.id)
    expect(ids).toContain('gpt-5.6-next')
    expect(ids).not.toContain('gpt-reserve')
    expect(ids).not.toContain('codex-auto-review')
    expect(openAICodexUnavailableModels(live)).toEqual(['gpt-reserve', 'codex-auto-review'])
  })

  it('uses the matching 5.6 variant for server-advertised GPT-6 Sol and Luna', () => {
    const provider = withOpenAICodexAstra(openaiCodexProvider())
    const live = [
      liveEntry('gpt-6-sol', { display_name: 'GPT-6-Sol' }),
      liveEntry('gpt-6-luna', { display_name: 'GPT-6-Luna' }),
    ]
    expect(provider.getModels().map(model => model.id)).not.toContain('gpt-6-luna')
    const merged = applyOpenAICodexLiveCatalog(provider, live, 'default')
    expect(merged.unavailableModels).toEqual([])
    for (const name of ['sol', 'luna']) {
      const entry = merged.provider.getModels().find(model => model.id === `gpt-6-${name}`)
      const previous = provider.getModels().find(model => model.id === `gpt-5.6-${name}`)
      expect(entry).toMatchObject({
        name: `GPT-6-${name === 'sol' ? 'Sol' : 'Luna'}`,
        contextWindow: 272_000,
        input: ['text', 'image'],
        thinkingLevelMap: previous?.thinkingLevelMap,
        compat: previous?.compat,
      })
      expect(entry?.thinkingLevelMap?.minimal).toBe('low')
    }
    const extended = openAICodexModelCatalogFrom({ live, mode: 'extended' })
    for (const id of ['gpt-6-sol', 'gpt-6-luna']) {
      expect(extended.find(model => model.id === id)).toMatchObject({
        contextWindow: 872_000, maxContextWindow: 872_000, contextLimitSource: 'codex-catalog',
      })
    }
    expect(openAICodexModelCatalogFrom().map(model => model.id)).not.toContain('gpt-6-luna')
  })

  it('uses live GPT-6 Luna ceilings for explicit overrides without mutating pi-ai', () => {
    const provider = withOpenAICodexAstra(openaiCodexProvider())
    const live = [liveEntry('gpt-6-luna')]
    const layer = { live, mode: 'default' as const }
    expect(createOpenAICodexProfile(provider, undefined, undefined, undefined,
      { 'gpt-6-luna': 872_000 }, undefined, undefined, layer)
      .piProvider.getModels().find(model => model.id === 'gpt-6-luna')?.contextWindow).toBe(872_000)
    expect(() => createOpenAICodexProfile(provider, undefined, undefined, undefined,
      { 'gpt-6-luna': 872_001 }, undefined, undefined, layer)).toThrow('integer from 1 to 872000')
    expect(provider.getModels().some(model => model.id === 'gpt-6-luna')).toBe(false)
  })

  it('lets an explicit per-model override win over the selected mode value', () => {
    const provider = openaiCodexProvider()
    const live = [liveEntry('gpt-5.6-sol', { context_window: 272_000, max_context_window: 872_000 })]
    const layer = { live, mode: 'extended' as const }
    const extended = createOpenAICodexProfile(provider, undefined, undefined, undefined, undefined, undefined, undefined, layer)
    expect(extended.piProvider.getModels().find(model => model.id === 'gpt-5.6-sol')?.contextWindow).toBe(872_000)
    const overridden = createOpenAICodexProfile(provider, undefined, undefined, undefined, { 'gpt-5.6-sol': 300_000 }, undefined, undefined, layer)
    expect(overridden.piProvider.getModels().find(model => model.id === 'gpt-5.6-sol')?.contextWindow).toBe(300_000)
    const untouched = createOpenAICodexProfile(provider)
    expect(untouched.piProvider.getModels().find(model => model.id === 'gpt-5.6-sol')?.contextWindow)
      .toBe(provider.getModels().find(model => model.id === 'gpt-5.6-sol')?.contextWindow)
  })

  it('does not mutate the installed catalog when overlaying', () => {
    const provider = openaiCodexProvider()
    const baseline = provider.getModels().find(model => model.id === 'gpt-5.6-sol')!.contextWindow
    applyOpenAICodexLiveCatalog(provider, [liveEntry('gpt-5.6-sol', { context_window: 111_000 })], 'default')
    expect(provider.getModels().find(model => model.id === 'gpt-5.6-sol')?.contextWindow).toBe(baseline)
  })
})
