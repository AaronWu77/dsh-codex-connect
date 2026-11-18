import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Include from '@deepseek-ai/cordis-plugin-include'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as PiAiRuntime from '@deepseek-ai/dsh-llm-pi-ai'
import WebRuntime from '@deepseek-ai/dsh-web'
import * as OpenAICodex from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  vi.unstubAllEnvs()
})

describe('OpenAI Codex real composition', () => {
  it('composes with the rc.2 pi-ai catalog directory without duplicate declarations', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-openai-codex-home-'))
    // The stored account document decides the registered route set; keep it empty and hermetic.
    vi.stubEnv('DSH_HOME', root)
    const ctx = new Context()
    context = ctx
    await ctx.plugin(LlmRuntime)
    await ctx.plugin(PiAiRuntime, {})
    await expect(ctx.plugin(OpenAICodex, {})).resolves.toBeDefined()
  })

  it('loads through the Loader, exposes the catalog, and unregisters on disposal', async () => {
    root = await mkdtemp(join(tmpdir(), 'dsh-openai-codex-loader-'))
    vi.stubEnv('DSH_HOME', root)
    vi.stubEnv('CODEX_HOME', root)
    const newModels = ['gpt-6.2-astra', 'gpt-6.2-sol']
    await writeFile(join(root, 'models_cache.json'), JSON.stringify({
      fetched_at: Date.now(), client_version: '0.169.0',
      models: newModels.map(slug => ({
        slug, display_name: slug, context_window: 500_000, max_context_window: 1_000_000, max_output_tokens: 128_000,
        supported_reasoning_levels: [{ effort: 'high' }, { effort: 'max' }], input_modalities: ['text', 'image'],
      })),
    }))
    const configPath = join(root, 'cordis.yml')
    await writeFile(configPath, [
      '- id: llm',
      "  name: 'test-llm-service'",
      '- id: web',
      "  name: 'test-web-service'",
      '- id: llm-openai-codex',
      '  name: dsh-codex-connect',
      '  config:',
      '    models:',
      '      - gpt-5.6-luna',
      '      - gpt-5.6-terra',
      ...newModels.map(id => `      - ${id}`),
      '',
    ].join('\n'))

    const ctx = new Context()
    context = ctx
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    const modules = new Map<string, unknown>([
      ['test-llm-service', LlmRuntime],
      ['test-web-service', WebRuntime],
      ['dsh-codex-connect', OpenAICodex],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    await ctx.loader.create({
      name: 'cordis:include',
      config: { path: pathToFileURL(configPath).href },
    })
    await ctx.loader.await()

    expect(ctx.llm.listProviders()).toEqual([{ id: 'openai-codex', name: 'OpenAI Codex' }])
    await vi.waitFor(async () => {
      expect((await ctx.llm.listModels('openai-codex')).map(model => model.id).sort())
        .toEqual(['gpt-5.6-luna', 'gpt-5.6-terra', ...newModels].sort())
    }, { timeout: 20_000 })
    for (const id of newModels) {
      await expect(ctx.llm.resolveModelInfo('openai-codex', id)).resolves.toMatchObject({
        id, context: { contextWindow: 500_000 },
      })
    }

    await expect(ctx.web.search({ query: 'must stay unconfigured' }))
      .rejects.toMatchObject({ code: 'WEB_PROVIDER_UNAVAILABLE' })

    const entry = [...ctx.loader.entries()].find(candidate => candidate.options.name === 'dsh-codex-connect')
    if (entry === undefined) throw new Error('OpenAI Codex Loader entry missing')
    if (entry.fiber === undefined) throw new Error('OpenAI Codex plugin fiber missing')
    await entry.fiber.dispose()
    expect(ctx.llm.listProviders()).toEqual([])
  })
})
