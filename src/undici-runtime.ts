/** Load npm Undici without replacing the dispatcher owned by Node's fetch. */

import { createRequire } from 'node:module'

type UndiciModule = typeof import('undici')

const LEGACY_GLOBAL_DISPATCHER = Symbol.for('undici.globalDispatcher.1')
const inheritedDispatcher = Reflect.get(globalThis, LEGACY_GLOBAL_DISPATCHER)
// Node lazily initializes its own Undici when a provider reads WebSocket.
// Include that initialization in the same preservation window as npm Undici.
void globalThis.WebSocket
const require = createRequire(import.meta.url)
const undici = require('undici') as UndiciModule
// Undici initializes a v2 dispatcher and its v1 bridge. A host v1 dispatcher
// must stay on the v1 protocol; it cannot be assigned to the v2 slot.
if (inheritedDispatcher !== undefined) {
  Reflect.set(globalThis, LEGACY_GLOBAL_DISPATCHER, inheritedDispatcher)
}

/** Undici dispatcher base loaded after preserving Node's dispatcher. */
export const Dispatcher = undici.Dispatcher
/** Direct Undici agent loaded after preserving Node's dispatcher. */
export const Agent = undici.Agent
/** HTTP(S) proxy agent loaded after preserving Node's dispatcher. */
export const ProxyAgent = undici.ProxyAgent
/** Undici fetch loaded after preserving Node's dispatcher. */
export const fetch = undici.fetch
/** Read npm Undici's active dispatcher. */
export const getGlobalDispatcher = undici.getGlobalDispatcher
/** Replace npm Undici's dispatcher while mirroring its legacy bridge. */
export const setGlobalDispatcher = undici.setGlobalDispatcher
