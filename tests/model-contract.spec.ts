import { describe, expect, it } from 'vitest'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { assertOpenAICodexContextWindowOverrides, openAICodexModelCatalog, withOpenAICodexContextWindowOverrides } from '../src/adapter.ts'
import { decodeOpenAICodexModelCatalog, isValidOpenAICodexContextBudget, openAICodexContextLimit } from '../src/model-contract.ts'

describe('model-specific configuration ceilings', () => {
  it.each([
    ['gpt-6-astra', 272_000, 872_000],
    ['gpt-5.6-sol', 272_000, 872_000],
    ['gpt-5.6-terra', 272_000, 872_000],
    ['gpt-5.6-luna', 272_000, 872_000],
    ['gpt-5.5', 272_000, 272_000],
    ['gpt-5.3-codex-spark', 128_000, 128_000],
  ])('exposes %s defaults and enforces the ceiling in both browser and adapter validation', (id, contextWindow, maximum) => {
    const model = openAICodexModelCatalog().find(entry => entry.id === id)!
    expect(model).toMatchObject({ contextWindow, maxContextWindow: maximum })
    const catalog = [model]
    for (const budget of [1, contextWindow, maximum]) {
      expect(isValidOpenAICodexContextBudget(budget, maximum)).toBe(true)
      expect(() => assertOpenAICodexContextWindowOverrides({ [id]: budget }, catalog)).not.toThrow()
    }
    for (const budget of [0, -1, 1.5, NaN, Infinity, maximum + 1]) {
      expect(isValidOpenAICodexContextBudget(budget, maximum)).toBe(false)
      expect(() => assertOpenAICodexContextWindowOverrides({ [id]: budget }, catalog)).toThrow('integer from 1 to')
    }
    expect(() => assertOpenAICodexContextWindowOverrides({ [id]: null }, catalog)).not.toThrow()
  })

  it.each([['gpt-5.4', 1_000_000], ['gpt-5.4-mini', 272_000]])(
    'keeps the %s configuration ceiling without advertising a removed bundled model', (id, maximum) => {
      expect(openAICodexModelCatalog().some(model => model.id === id)).toBe(false)
      const legacy = { id, contextWindow: 272_000, ...openAICodexContextLimit(id, 272_000) }
      expect(legacy.maxContextWindow).toBe(maximum)
      expect(() => assertOpenAICodexContextWindowOverrides({ [id]: maximum }, [legacy])).not.toThrow()
      expect(() => assertOpenAICodexContextWindowOverrides({ [id]: maximum + 1 }, [legacy])).toThrow('integer from 1 to')
    },
  )

  it('uses only installed defaults for unlisted models and newer defaults beyond the pinned ceiling', () => {
    for (const id of ['new-model', 'toString', 'gpt-5.6-sol']) {
      expect(openAICodexContextLimit(id, 1_100_000)).toEqual({ maxContextWindow: 1_100_000, contextLimitSource: 'catalog-default' })
    }
    expect(openAICodexContextLimit('gpt-5.3-codex-spark', 128_000).contextLimitSource).toBe('catalog-default')
  })

  it('rejects provider overrides above the ceiling even without Host settings', () => {
    expect(() => withOpenAICodexContextWindowOverrides(openaiCodexProvider(), { 'gpt-5.6-sol': 872_001 })).toThrow('integer from 1 to 872000')
  })

  it('round-trips detached catalog defaults and refuses incomplete or invalid wire limits', () => {
    const catalog = openAICodexModelCatalog()
    expect(decodeOpenAICodexModelCatalog(catalog)).toEqual(catalog)
    const model = catalog[0]!
    for (const patch of [
      { contextWindow: undefined }, { contextWindow: 0 }, { contextWindow: 1.5 },
      { maxContextWindow: undefined }, { maxContextWindow: model.contextWindow - 1 },
      { maxContextWindow: Number.MAX_SAFE_INTEGER + 1 }, { contextLimitSource: 'verified-server' },
    ]) expect(decodeOpenAICodexModelCatalog([{ ...model, ...patch }])).toBeUndefined()
    expect(decodeOpenAICodexModelCatalog([model, model])).toBeUndefined()
    expect(openAICodexModelCatalog()[0]).not.toBe(model)
  })
})
