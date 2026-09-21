import { describe, expect, it } from 'vitest'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import {
  assertOpenAICodexMaxTokensOverrides,
  createOpenAICodexAdapter,
  createOpenAICodexProfile,
  openAICodexModelCatalog,
  OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES,
  OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES,
  OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET,
  OPENAI_CODEX_TRANSPORT,
  OPENAI_CODEX_ASTRA_MODEL_ID,
  withOpenAICodexAstra,
  withOpenAICodexContextWindowOverrides,
  withOpenAICodexMaxTokensOverrides,
} from '../src/adapter.ts'
import type { OpenAICodexCredentialStore } from '../src/store.ts'
import { OPENAI_CODEX_PROVIDER } from '../src/store.ts'
import { Config } from '../src/index.ts'

describe('OpenAI Codex rc.2 adapter profile', () => {
  it('preserves upstream Astra metadata while retaining calibrated reasoning choices', () => {
    const provider = openaiCodexProvider()
    const withoutAstra = {
      ...provider,
      getModels: () => provider.getModels().filter(model => model.id !== OPENAI_CODEX_ASTRA_MODEL_ID),
    }
    const patched = withOpenAICodexAstra(withoutAstra)
    const astra = patched.getModels().filter(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID)

    expect(astra).toEqual([expect.objectContaining({
      name: 'GPT-6-Astra',
      api: 'openai-codex-responses',
      provider: OPENAI_CODEX_PROVIDER,
      input: ['text', 'image'],
      contextWindow: 272_000,
      maxTokens: 128_000,
    })])

    const upstreamAstra = { ...astra[0]!, name: 'Upstream Astra', contextWindow: 300_000, thinkingLevelMap: { minimal: 'minimal' as const } }
    const upstreamProvider = { ...provider, getModels: () => [upstreamAstra, ...withoutAstra.getModels()] }
    const preserved = withOpenAICodexAstra(upstreamProvider)
    expect(preserved.getModels()[0]).toEqual({ ...upstreamAstra, thinkingLevelMap: { off: null, minimal: null, xhigh: 'xhigh', max: 'max' } })
    expect(upstreamAstra.thinkingLevelMap).toEqual({ minimal: 'minimal' })
    expect(preserved.getModels().slice(1)).toEqual(withoutAstra.getModels())
    expect(preserved.getModels().filter(model => model.id === OPENAI_CODEX_ASTRA_MODEL_ID)).toHaveLength(1)
  })

  it('distinguishes an omitted model list from an explicitly empty list', () => {
    expect(Config({}).models).toBeUndefined()
    expect(Config({ models: [] }).models).toEqual([])
  })

  it('supplies all request-image defaults required by ResolvedPiAiProviderProfile', () => {
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    expect(profile.maxRequestImageBytes).toBe(OPENAI_CODEX_MAX_REQUEST_IMAGE_BYTES)
    expect(profile.requestImagePixelBudget).toBe(OPENAI_CODEX_REQUEST_IMAGE_PIXEL_BUDGET)
    expect(profile.requestImageMaxBytes).toBe(OPENAI_CODEX_REQUEST_IMAGE_MAX_BYTES)
    expect(profile.maxRequestImageBytes).toBe(20 * 1024 * 1024)
    expect(profile.requestImagePixelBudget).toBe(2048 * 2048)
    expect(profile.requestImageMaxBytes).toBe(1024 * 1024)
  })

  it('uses the finite SSE transport for completed one-shot requests', () => {
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    expect(profile.transport).toBe(OPENAI_CODEX_TRANSPORT)
    expect(profile.transport).toBe('sse')
  })

  it('filters discovery while keeping a hidden model resolvable', async () => {
    const catalog = openAICodexModelCatalog()
    expect(catalog.length).toBeGreaterThan(2)
    const adapter = createOpenAICodexAdapter(
      {} as OpenAICodexCredentialStore,
      () => undefined,
      undefined,
      () => [catalog[1]!.id, catalog[0]!.id, catalog[1]!.id],
    )

    const listed = await adapter.listModels(OPENAI_CODEX_PROVIDER)
    expect(listed.map(model => model.id)).toEqual([catalog[0]!.id, catalog[1]!.id])
    await expect(adapter.resolveModel(OPENAI_CODEX_PROVIDER, catalog[2]!.id)).resolves.toMatchObject({
      provider: OPENAI_CODEX_PROVIDER,
      id: catalog[2]!.id,
    })
  })

  it('advertises the full catalog when no visible-model list is configured', async () => {
    const adapter = createOpenAICodexAdapter(
      {} as OpenAICodexCredentialStore,
      () => undefined,
    )
    const listed = await adapter.listModels(OPENAI_CODEX_PROVIDER)
    expect(listed).toHaveLength(openAICodexModelCatalog().length)
    expect(listed).toContainEqual(expect.objectContaining({ id: OPENAI_CODEX_ASTRA_MODEL_ID }))
    await expect(adapter.resolveModel(OPENAI_CODEX_PROVIDER, OPENAI_CODEX_ASTRA_MODEL_ID)).resolves.toMatchObject({
      provider: OPENAI_CODEX_PROVIDER,
      id: OPENAI_CODEX_ASTRA_MODEL_ID,
    })
  })

  it('resolves every advertised model and prepares its request without accessing credentials', async () => {
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined)
    const listed = await adapter.listModels(OPENAI_CODEX_PROVIDER)
    expect(listed).toContainEqual(expect.objectContaining({ id: 'gpt-5.6-luna' }))
    for (const model of listed) {
      await expect(adapter.resolveModel(OPENAI_CODEX_PROVIDER, model.id)).resolves.toMatchObject({ id: model.id })
      await expect(adapter.prepareCall(OPENAI_CODEX_PROVIDER, model.id)).resolves.toMatchObject({ model: { id: model.id } })
    }
  })
})

describe('context-window overrides', () => {
  it('keeps the advertised catalog when no overrides are configured', () => {
    const baseline = openaiCodexProvider().getModels()
    const profile = createOpenAICodexProfile(openaiCodexProvider())

    const listed = profile.piProvider.getModels()
    expect(listed).toHaveLength(baseline.length)
    for (const model of listed) {
      expect(model.contextWindow).toBe(baseline.find(entry => entry.id === model.id)?.contextWindow)
    }
  })

  it('replaces only the configured model context windows', () => {
    const baseline = openaiCodexProvider().getModels()
    const target = baseline.find(model => model.id.includes('gpt-5.6')) ?? baseline[0]!
    const other = baseline.find(model => model.id !== target.id)!
    const overrides = { [target.id]: 350_000 }
    const profile = createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, overrides)

    const listed = profile.piProvider.getModels()
    expect(listed.find(model => model.id === target.id)?.contextWindow).toBe(350_000)
    expect(listed.find(model => model.id === other.id)?.contextWindow).toBe(other.contextWindow)
  })

  it('accepts a contextWindowOverrides config section', () => {
    expect(Config({ contextWindowOverrides: { 'gpt-5.6-sol': 350_000 } }).contextWindowOverrides)
      .toEqual({ 'gpt-5.6-sol': 350_000 })
    expect(Config({}).contextWindowOverrides).toBeUndefined()
  })

  it('withOpenAICodexContextWindowOverrides does not mutate the baseline provider', () => {
    const provider = openaiCodexProvider()
    const baseline = provider.getModels()
    const overridden = withOpenAICodexContextWindowOverrides(provider, { [baseline[0]!.id]: 100_000 })

    expect(overridden.getModels()[0]!.contextWindow).toBe(100_000)
    expect(provider.getModels()[0]!.contextWindow).toBe(baseline[0]!.contextWindow)
  })

  it('refreshes resolved budgets without changing an already prepared call or output limits', async () => {
    const target = 'gpt-5.6-sol'
    let overrides: Record<string, number> | undefined = { [target]: 350_000 }
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined,
      undefined, undefined, undefined, undefined, () => overrides)
    const first = await adapter.prepareCall(OPENAI_CODEX_PROVIDER, target)
    expect(first.model.context?.contextWindow).toBe(350_000)
    overrides[target] = 300_000
    const next = await adapter.prepareCall(OPENAI_CODEX_PROVIDER, target)
    expect(next.model.context?.contextWindow).toBe(300_000)
    expect(first.model.context?.contextWindow).toBe(350_000)
    overrides = undefined
    const baseline = openaiCodexProvider().getModels().find(model => model.id === target)!
    expect((await adapter.resolveModel(OPENAI_CODEX_PROVIDER, target)).context?.contextWindow).toBe(baseline.contextWindow)
    const profile = createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, { [target]: 350_000 })
    expect(profile.piProvider.getModels().find(model => model.id === target)?.maxTokens).toBe(baseline.maxTokens)
    expect(profile.configuredMaxTokens.size).toBe(0)
    expect(profile.transport).toBe('sse')
  })

  it('reports unknown catalog ids instead of silently ignoring the override', () => {
    expect(() => createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, { 'misspelled-model': 300_000 }))
      .toThrow('unknown model id "misspelled-model"')
  })
})

describe('maximum-output-token overrides', () => {
  it('rejects unknown ids and budgets outside the configuration ceiling', () => {
    const catalog = openAICodexModelCatalog()
    expect(() => assertOpenAICodexMaxTokensOverrides({ 'misspelled-model': 1_000 }, catalog))
      .toThrow('unknown model id "misspelled-model"')
    for (const budget of [0, -1, 1.5, NaN, Infinity, 872_001]) {
      expect(() => assertOpenAICodexMaxTokensOverrides({ 'gpt-5.6-sol': budget }, catalog))
        .toThrow('integer from 1 to 872000')
    }
    expect(() => assertOpenAICodexMaxTokensOverrides({ 'gpt-5.6-sol': 872_000 }, catalog)).not.toThrow()
    expect(() => assertOpenAICodexMaxTokensOverrides({ 'gpt-5.6-sol': null }, catalog)).not.toThrow()
  })

  it('lands in configuredMaxTokens and the pi-ai model record without touching other models', () => {
    const baseline = openaiCodexProvider().getModels()
    const target = 'gpt-5.6-sol'
    const other = baseline.find(model => model.id !== target)!
    const profile = createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined, undefined, { [target]: 4_096 })

    expect(profile.configuredMaxTokens.get(target)).toBe(4_096)
    expect(profile.configuredMaxTokens.size).toBe(1)
    expect(profile.piProvider.getModels().find(model => model.id === target)?.maxTokens).toBe(4_096)
    expect(profile.piProvider.getModels().find(model => model.id === other.id)?.maxTokens).toBe(other.maxTokens)
  })

  it('emits defaultMaxTokens through the adapter and clears when the override is removed', async () => {
    const target = 'gpt-5.6-sol'
    let maxTokens: Record<string, number> | undefined = { [target]: 4_096 }
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined,
      undefined, undefined, undefined, undefined, undefined, () => maxTokens)

    expect((await adapter.resolveModel(OPENAI_CODEX_PROVIDER, target)).defaultMaxTokens).toBe(4_096)
    maxTokens = undefined
    expect((await adapter.resolveModel(OPENAI_CODEX_PROVIDER, target)).defaultMaxTokens).toBeUndefined()
  })

  it('keeps a context override independent from the output cap', () => {
    const target = 'gpt-5.6-sol'
    const profile = createOpenAICodexProfile(openaiCodexProvider(), undefined, undefined, undefined,
      { [target]: 350_000 }, { [target]: 4_096 })
    expect(profile.piProvider.getModels().find(entry => entry.id === target))
      .toMatchObject({ contextWindow: 350_000, maxTokens: 4_096 })
  })

  it('accepts a maxTokensOverrides config section', () => {
    expect(Config({ maxTokensOverrides: { 'gpt-5.6-sol': 8_192 } }).maxTokensOverrides).toEqual({ 'gpt-5.6-sol': 8_192 })
    expect(Config({}).maxTokensOverrides).toBeUndefined()
  })

  it('withOpenAICodexMaxTokensOverrides does not mutate the baseline provider', () => {
    const provider = openaiCodexProvider()
    const baseline = provider.getModels()
    const overridden = withOpenAICodexMaxTokensOverrides(provider, { [baseline[0]!.id]: 2_048 })
    expect(overridden.getModels()[0]!.maxTokens).toBe(2_048)
    expect(provider.getModels()[0]!.maxTokens).toBe(baseline[0]!.maxTokens)
  })
})

describe('multi-route adapter', () => {
  it('resolves every bound route under its own provider id and catalog', async () => {
    const adapter = createOpenAICodexAdapter({} as OpenAICodexCredentialStore, () => undefined,
      undefined, undefined, undefined, undefined, undefined, undefined,
      () => [
        { routeId: 'openai-codex', displayName: 'OpenAI Codex' },
        { routeId: 'openai-codex-2', displayName: 'OpenAI Codex (acct 3f9a2c)', accountKey: 'acct_3f9a2c' },
      ])

    expect(adapter.providerInfo('openai-codex-2').name).toBe('OpenAI Codex (acct 3f9a2c)')
    expect(await adapter.listModels('openai-codex-2')).toHaveLength(openAICodexModelCatalog().length)
    await expect(adapter.resolveModel('openai-codex-2', 'gpt-5.6-sol')).resolves.toMatchObject({
      provider: 'openai-codex-2',
      id: 'gpt-5.6-sol',
    })
    await expect(adapter.resolveModel(OPENAI_CODEX_PROVIDER, 'gpt-5.6-sol')).resolves.toMatchObject({
      provider: OPENAI_CODEX_PROVIDER,
    })
  })
})
