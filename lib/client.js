window.__ModuleLoader__.load({
	id: "dsh-codex-connect",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region src/account-route-id.ts
		/** Browser-safe identity shared by Codex account routes and Composer controls. */
		/** Primary Harness route and pi-ai provider id owned by this bundle. */
		const OPENAI_CODEX_PROVIDER = "openai-codex";
		/**
		* Match the primary route or its numeric account suffix, never another provider's suffix.
		* @param routeId - Harness provider route id.
		* @returns Whether this bundle owns the primary or a numbered Codex account route.
		*/
		function isOpenAICodexRouteId(routeId) {
			if (routeId === "openai-codex") return true;
			const prefix = `${OPENAI_CODEX_PROVIDER}-`;
			return routeId.startsWith(prefix) && /^\d+$/u.test(routeId.slice(prefix.length));
		}
		//#endregion
		//#region src/speed-mode-contract.ts
		/** Browser-safe explicit speed hints, not confirmation of backend entitlement or service. */
		/** Same-origin endpoint for revisioned conversation speed commands. */
		const OPENAI_CODEX_SPEED_MODE_PATH = "/plugins/dsh-openai-codex/speed-mode";
		/** Accept only the three public mode ids. */
		function isOpenAICodexSpeedMode(value) {
			return value === "standard" || value === "fast" || value === "ultrafast";
		}
		/** Preserve an optional startup preference until settings layers have merged. */
		function parseOpenAICodexSpeedDefault(value) {
			if (value === void 0 || value === null || isOpenAICodexSpeedMode(value)) return value;
			throw new TypeError("OpenAI Codex new-session speed must be standard, fast, ultrafast, null or omitted");
		}
		/** Exact alpha10 model support, on every locally owned account route; account entitlement stays unknown. */
		function supportsOpenAICodexUltrafast(provider, model) {
			return isOpenAICodexRouteId(provider) && (model === "gpt-6-astra" || model === "gpt-6.1-sol");
		}
		function record$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Validate a Host readback before publishing it to the Composer. */
		function readConversationSpeed(value, provider, model) {
			if (!record$1(value) || typeof value.generation !== "string" || !/^[A-Za-z0-9_-]{1,80}$/u.test(value.generation) || typeof value.revision !== "number" || !Number.isSafeInteger(value.revision) || value.revision < 0 || !isOpenAICodexSpeedMode(value.mode) || value.provider !== provider || value.model !== model || typeof value.modelSupported !== "boolean" || value.eligibility !== "unknown" || typeof value.hasAccount !== "boolean" || typeof value.selectionAvailable !== "boolean" || typeof value.selectionExpired !== "boolean") return void 0;
			return {
				generation: value.generation,
				revision: value.revision,
				mode: value.mode,
				provider,
				model,
				modelSupported: value.modelSupported,
				eligibility: "unknown",
				hasAccount: value.hasAccount,
				selectionAvailable: value.selectionAvailable,
				selectionExpired: value.selectionExpired
			};
		}
		//#endregion
		//#region src/reasoning-defaults.ts
		/** Optional profile effort; the current Host validates each model before authentication. */
		const OPENAI_CODEX_REASONING_EFFORTS = [
			"off",
			"minimal",
			"low",
			"medium",
			"high",
			"xhigh",
			"max"
		];
		/** Preserve reset masks until settings layers have merged. */
		function parseOpenAICodexReasoningEffort(value) {
			if (value === void 0 || value === null) return value;
			if (typeof value !== "string" || !OPENAI_CODEX_REASONING_EFFORTS.some((effort) => effort === value)) throw new TypeError("OpenAI Codex reasoningEffort must be off, minimal, low, medium, high, xhigh, max, null or omitted");
			return value;
		}
		//#endregion
		//#region src/auto-review-local-policy.ts
		/**
		* Parse an explicit local scope without accepting a model-authored authorization label.
		* @param value - stored or submitted setting; omission preserves the manual default.
		* @returns the selected scope, or manual when omitted.
		* @throws TypeError for every unrecognized explicit value.
		*/
		function parseAutoReviewLocalPolicy(value) {
			if (value === void 0) return "manual";
			if (value === "manual" || value === "workspace-read" || value === "workspace-files") return value;
			throw new TypeError("autoReviewLocalPolicy must be manual, workspace-read, or workspace-files");
		}
		//#endregion
		//#region src/settings-contract.ts
		/** Stable Harness settings namespace owned by this plugin. */
		const OPENAI_CODEX_SETTINGS_NAMESPACE = "llm-openai-codex";
		/**
		* Official client version the model catalog endpoint requires. The endpoint is
		* version-gated: a recent official value returns the full catalog, older
		* values return an empty list, and omitting it fails with HTTP 400. Override
		* only to follow a newer official client.
		*/
		const DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION = "0.155.0";
		/** Default context-window mode: the server's default budget, not its extended ceiling. */
		const DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE = "default";
		/** Whether a value is a bounded official-client version sent as `client_version`. */
		function isValidOpenAICodexModelCatalogClientVersion(value) {
			return typeof value === "string" && /^(?=.{1,32}$)\d+\.\d+\.\d+$/u.test(value);
		}
		/** Suggested local HTTP proxy shown by the settings UI; it is never enabled by default. */
		const DEFAULT_OPENAI_CODEX_PROXY_URL = "http://127.0.0.1:7890";
		/** Validate an optional bounded ASCII image route model hint. */
		function isValidOpenAICodexImageModelHint(value) {
			return typeof value === "string" && (value === "" || /^(?=.{1,128}$)[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value));
		}
		/**
		* Normalize the credential-free HTTP proxy URL accepted by Codex Connect.
		* Paths, query strings, fragments, and embedded credentials are rejected so
		* the value remains an origin rather than an opaque request target.
		*/
		function normalizeOpenAICodexProxyUrl(value) {
			if (typeof value !== "string" || value.trim().length === 0) return void 0;
			try {
				const parsed = new URL(value.trim());
				if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return void 0;
				if (parsed.username !== "" || parsed.password !== "") return void 0;
				if (parsed.pathname !== "/" || parsed.search !== "" || parsed.hash !== "") return void 0;
				if (parsed.hostname.length === 0) return void 0;
				if (parsed.port !== "" && (!/^\d+$/u.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65535)) return void 0;
				return parsed.origin;
			} catch {
				return;
			}
		}
		/** Whether a value is a supported, canonical HTTP(S) proxy origin. */
		function isValidOpenAICodexProxyUrl(value) {
			return normalizeOpenAICodexProxyUrl(value) !== void 0;
		}
		/**
		* Whether a value is a bounded per-model override map. Keys are nonempty,
		* unpadded model ids; values are positive safe integers or null to restore
		* that model's catalog default. The Host also checks catalog membership and
		* the model-specific configuration ceiling.
		*/
		function isOpenAICodexOverrideMap(value) {
			if (!isRecord$2(value)) return false;
			const entries = Object.entries(value);
			if (entries.length > 256) return false;
			return entries.every(([modelId, budget]) => modelId.length > 0 && modelId.trim() === modelId && (budget === null || typeof budget === "number" && Number.isSafeInteger(budget) && budget > 0));
		}
		/** Preserve per-model null masks until the Host has merged its settings layers. */
		function parseOpenAICodexOverrideMap(value, field) {
			if (value === void 0 || value === null) return void 0;
			if (!isOpenAICodexOverrideMap(value)) throw new TypeError(`OpenAI Codex ${field} must contain at most 256 nonempty model ids with positive safe-integer token budgets or null resets`);
			return { ...value };
		}
		/** Resolve merged settings; whole-map or per-model null masks use catalog defaults. */
		function resolveOpenAICodexOverrideMap(overrides) {
			if (overrides === void 0) return void 0;
			return Object.fromEntries(Object.entries(overrides).filter((entry) => entry[1] !== null));
		}
		/** Whether a value is a bounded per-model context-window override map. */
		function isValidOpenAICodexContextWindowOverrides(value) {
			return isOpenAICodexOverrideMap(value);
		}
		/** Preserve per-model context-window null masks until the Host merges its settings layers. */
		function parseOpenAICodexContextWindowOverrides(value) {
			return parseOpenAICodexOverrideMap(value, "contextWindowOverrides");
		}
		/** Resolve merged context-window overrides; whole-map or per-model null masks use catalog defaults. */
		function resolveOpenAICodexContextWindowOverrides(value) {
			return resolveOpenAICodexOverrideMap(parseOpenAICodexContextWindowOverrides(value));
		}
		/** Whether a value is a bounded per-model maximum-output-token override map. */
		function isValidOpenAICodexMaxTokensOverrides(value) {
			return isOpenAICodexOverrideMap(value);
		}
		/** Preserve per-model maximum-output-token null masks until the Host merges its settings layers. */
		function parseOpenAICodexMaxTokensOverrides(value) {
			return parseOpenAICodexOverrideMap(value, "maxTokensOverrides");
		}
		/** Resolve merged maximum-output-token overrides; whole-map or per-model null masks use catalog defaults. */
		function resolveOpenAICodexMaxTokensOverrides(value) {
			return resolveOpenAICodexOverrideMap(parseOpenAICodexMaxTokensOverrides(value));
		}
		/** Default model used by the standalone search endpoint. */
		const DEFAULT_OPENAI_CODEX_SEARCH_MODEL = "gpt-5.6-sol";
		/** Default search mode, matching the official local Codex client. */
		const DEFAULT_OPENAI_CODEX_SEARCH_MODE = "cached";
		/** Default provider search-context size. */
		const DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE = "medium";
		/** Default output budget for the standalone search response. */
		const DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS = 1e4;
		/**
		* Parse an explicit transport selection.
		* @param value - serialized selection; omission leaves the transport to the resident budget.
		* @returns the validated transport, or undefined when the setting is absent.
		*/
		function parseOpenAICodexModelTransport(value) {
			if (value === void 0 || value === null) return void 0;
			if (value !== "sse" && value !== "auto" && value !== "websocket-cached") throw new TypeError("OpenAI Codex transport must be \"sse\", \"auto\", or \"websocket-cached\"");
			return value;
		}
		/**
		* Whether a value is a supported resident-connection budget.
		* @param value - candidate budget.
		* @returns true for an integer from 0 through the supported maximum.
		*/
		function isValidOpenAICodexResidentSessions(value) {
			return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 8;
		}
		/**
		* Validate one resident-connection budget.
		* @param value - serialized budget; omission uses the default.
		* @returns the bounded budget.
		*/
		function parseOpenAICodexMaxResidentSessions(value) {
			if (value === void 0 || value === null) return 2;
			if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 8) throw new TypeError(`OpenAI Codex maxResidentWebSocketSessions must be an integer from 0 to 8`);
			return value;
		}
		Object.freeze({
			transport: void 0,
			maxResidentWebSocketSessions: 2,
			models: void 0,
			enableProxy: false,
			proxyUrl: DEFAULT_OPENAI_CODEX_PROXY_URL,
			contextWindowOverrides: void 0,
			maxTokensOverrides: void 0,
			contextWindowMode: DEFAULT_OPENAI_CODEX_CONTEXT_WINDOW_MODE,
			modelCatalogClientVersion: DEFAULT_OPENAI_CODEX_MODEL_CATALOG_CLIENT_VERSION,
			debugLogPayloadFields: false,
			enableNewSessionFastMode: false,
			enableNewSubagentFastMode: false,
			newSessionSpeedMode: void 0,
			newSubagentSpeedMode: void 0,
			reasoningEffort: void 0,
			enableSearch: false,
			enableImageTool: false,
			enableImageGeneration: false,
			imageModelHint: "",
			autoReviewDisclosureAcknowledged: false,
			enableAutoReview: false,
			autoReviewLocalPolicy: "manual",
			searchModel: DEFAULT_OPENAI_CODEX_SEARCH_MODEL,
			searchMode: DEFAULT_OPENAI_CODEX_SEARCH_MODE,
			searchContextSize: DEFAULT_OPENAI_CODEX_SEARCH_CONTEXT_SIZE,
			searchMaxOutputTokens: DEFAULT_OPENAI_CODEX_SEARCH_MAX_OUTPUT_TOKENS
		});
		function isRecord$2(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/** Narrow the redacted settings wire payload before it enters React state. */
		function decodeOpenAICodexSettings(value) {
			if (!isRecord$2(value)) return void 0;
			const transport = value["transport"];
			if (transport !== void 0 && transport !== "sse" && transport !== "auto" && transport !== "websocket-cached") return void 0;
			const maxResidentWebSocketSessions = value["maxResidentWebSocketSessions"];
			const models = value["models"];
			const enableProxy = value["enableProxy"];
			const proxyUrl = value["proxyUrl"];
			const contextWindowOverrides = value["contextWindowOverrides"];
			const maxTokensOverrides = value["maxTokensOverrides"];
			const contextWindowMode = value["contextWindowMode"];
			const modelCatalogClientVersion = value["modelCatalogClientVersion"];
			const debugLogPayloadFields = value["debugLogPayloadFields"];
			const enableNewSessionFastMode = value["enableNewSessionFastMode"];
			const enableNewSubagentFastMode = value["enableNewSubagentFastMode"];
			const newSessionSpeedMode = value["newSessionSpeedMode"];
			const newSubagentSpeedMode = value["newSubagentSpeedMode"];
			const reasoningEffort = value["reasoningEffort"];
			const autoReviewLocalPolicy = value["autoReviewLocalPolicy"];
			const enableSearch = value["enableSearch"];
			const enableImageTool = value["enableImageTool"];
			const enableImageGeneration = value["enableImageGeneration"];
			const imageModelHint = value["imageModelHint"];
			const autoReviewDisclosureAcknowledged = value["autoReviewDisclosureAcknowledged"];
			const enableAutoReview = value["enableAutoReview"];
			const searchModel = value["searchModel"];
			const searchMode = value["searchMode"];
			const searchContextSize = value["searchContextSize"];
			const searchMaxOutputTokens = value["searchMaxOutputTokens"];
			if (models !== void 0 && (!Array.isArray(models) || models.some((model) => typeof model !== "string"))) return void 0;
			if (maxResidentWebSocketSessions !== void 0 && !isValidOpenAICodexResidentSessions(maxResidentWebSocketSessions)) return void 0;
			if (enableProxy !== void 0 && typeof enableProxy !== "boolean") return void 0;
			if (proxyUrl !== void 0 && (typeof proxyUrl !== "string" || !isValidOpenAICodexProxyUrl(proxyUrl))) return void 0;
			if (contextWindowOverrides !== void 0 && contextWindowOverrides !== null && !isValidOpenAICodexContextWindowOverrides(contextWindowOverrides)) return void 0;
			if (maxTokensOverrides !== void 0 && maxTokensOverrides !== null && !isValidOpenAICodexMaxTokensOverrides(maxTokensOverrides)) return void 0;
			if (contextWindowMode !== void 0 && contextWindowMode !== "default" && contextWindowMode !== "extended") return void 0;
			if (modelCatalogClientVersion !== void 0 && !isValidOpenAICodexModelCatalogClientVersion(modelCatalogClientVersion)) return void 0;
			if (enableNewSessionFastMode !== void 0 && typeof enableNewSessionFastMode !== "boolean") return void 0;
			if (enableNewSubagentFastMode !== void 0 && typeof enableNewSubagentFastMode !== "boolean") return void 0;
			if (debugLogPayloadFields !== void 0 && typeof debugLogPayloadFields !== "boolean") return void 0;
			if (typeof enableSearch !== "boolean" || typeof enableImageTool !== "boolean") return void 0;
			if (enableImageGeneration !== void 0 && typeof enableImageGeneration !== "boolean") return void 0;
			if (imageModelHint !== void 0 && !isValidOpenAICodexImageModelHint(imageModelHint)) return void 0;
			if (autoReviewDisclosureAcknowledged !== void 0 && typeof autoReviewDisclosureAcknowledged !== "boolean") return void 0;
			if (enableAutoReview !== void 0 && typeof enableAutoReview !== "boolean") return void 0;
			if (typeof searchModel !== "string" || searchModel.trim().length === 0) return void 0;
			if (searchMode !== "cached" && searchMode !== "indexed" && searchMode !== "live") return void 0;
			if (searchContextSize !== "low" && searchContextSize !== "medium" && searchContextSize !== "high") return void 0;
			if (typeof searchMaxOutputTokens !== "number" || !Number.isInteger(searchMaxOutputTokens) || searchMaxOutputTokens < 1) return void 0;
			let newSessionSpeed;
			let newSubagentSpeed;
			let effort;
			let localPolicy;
			try {
				newSessionSpeed = parseOpenAICodexSpeedDefault(newSessionSpeedMode) ?? void 0;
				newSubagentSpeed = parseOpenAICodexSpeedDefault(newSubagentSpeedMode) ?? void 0;
				effort = parseOpenAICodexReasoningEffort(reasoningEffort) ?? void 0;
				localPolicy = parseAutoReviewLocalPolicy(autoReviewLocalPolicy);
			} catch (error) {
				return;
			}
			const overrides = resolveOpenAICodexContextWindowOverrides(contextWindowOverrides);
			const tokenOverrides = resolveOpenAICodexMaxTokensOverrides(maxTokensOverrides);
			return {
				transport: parseOpenAICodexModelTransport(transport),
				maxResidentWebSocketSessions: parseOpenAICodexMaxResidentSessions(maxResidentWebSocketSessions),
				models: models === void 0 ? void 0 : [...new Set(models)],
				enableProxy: enableProxy ?? false,
				proxyUrl: proxyUrl === void 0 ? DEFAULT_OPENAI_CODEX_PROXY_URL : normalizeOpenAICodexProxyUrl(proxyUrl),
				contextWindowOverrides: overrides === void 0 ? void 0 : Object.freeze(overrides),
				maxTokensOverrides: tokenOverrides === void 0 ? void 0 : Object.freeze(tokenOverrides),
				contextWindowMode: contextWindowMode ?? "default",
				modelCatalogClientVersion: modelCatalogClientVersion ?? "0.155.0",
				debugLogPayloadFields: debugLogPayloadFields ?? false,
				enableNewSessionFastMode: enableNewSessionFastMode ?? false,
				enableNewSubagentFastMode: enableNewSubagentFastMode ?? false,
				newSessionSpeedMode: newSessionSpeed,
				newSubagentSpeedMode: newSubagentSpeed,
				reasoningEffort: effort,
				autoReviewLocalPolicy: localPolicy,
				enableSearch,
				enableImageTool,
				enableImageGeneration: enableImageGeneration ?? false,
				imageModelHint: imageModelHint ?? "",
				autoReviewDisclosureAcknowledged: autoReviewDisclosureAcknowledged ?? false,
				enableAutoReview: enableAutoReview ?? false,
				searchModel,
				searchMode,
				searchContextSize,
				searchMaxOutputTokens
			};
		}
		//#endregion
		//#region src/client/AccountReadiness.tsx
		/** Read-only account evidence in management; navigation never changes the active account. */
		/**
		* Report which saved accounts need attention, without repeating the limits the
		* account list already shows.
		* @param props - account store, quota service, copy, and optional navigation.
		* @returns the readiness section.
		*/
		function AccountReadiness({ account, quota, t, navigate, heading = true }) {
			const state = (0, react.useSyncExternalStore)(account.subscribe, account.getSnapshot, account.getSnapshot);
			const figures = (0, react.useSyncExternalStore)(quota.subscribe, quota.snapshot, quota.snapshot);
			const attention = state.accounts.map((saved) => {
				const item = figures?.accounts?.find((candidate) => candidate.accountKey === saved.accountKey);
				const reauth = item?.errorCode === "reauth-required" || saved.active && state.status.status === "reauth-required";
				const failed = item?.unavailable === true;
				const exhausted = item?.windows.some((w) => w.remainingPercent === 0 && (w.resetAt === void 0 || w.resetAt * 1e3 > Date.now()));
				const expired = item?.windows.some((w) => w.resetAt !== void 0 && w.resetAt * 1e3 <= Date.now());
				return {
					saved,
					item,
					failed,
					key: reauth ? "readinessReauth" : item?.errorCode === "rate-limited" ? "readinessLimited" : failed ? "readinessUnavailable" : expired ? "readinessStale" : !item?.windows.length ? "readinessUnknown" : exhausted ? "readinessExhausted" : "readinessObserved"
				};
			}).filter((entry) => entry.key !== "readinessObserved" && entry.key !== "readinessUnavailable" && entry.key !== "readinessLimited");
			if (attention.length === 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cc-manage-card",
				"aria-label": t("accountReadiness"),
				children: [
					heading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("accountReadiness") }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "cc-account-readiness",
						children: attention.map(({ saved, item, failed, key }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: saved.displayName }),
							saved.active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usingAccount") }) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(key) }),
							item?.fetchedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("small", { children: [
								t("readinessChecked"),
								": ",
								new Date(item.fetchedAt).toLocaleString(t("dateLocale")),
								failed ? " " + t("readinessRetained") : null
							] })
						] }, saved.accountKey))
					}),
					navigate === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						onClick: navigate,
						children: t("readinessManage")
					})
				]
			});
		}
		//#endregion
		//#region src/account-contract.ts
		/** Exact browser-safe account key: the prefix plus a SHA-256 base64url digest. */
		const OPENAI_CODEX_ACCOUNT_KEY_PATTERN = /^acct_[A-Za-z0-9_-]{43}$/u;
		//#endregion
		//#region src/client/request-json.ts
		/** Bounded same-origin browser reads, including response-body consumption. */
		/** Allow the server's 30-second authorization-URL deadline to report first. */
		const BROWSER_REQUEST_TIMEOUT_MS = 45e3;
		/** A timed-out mutation may already have committed on the server. */
		var BrowserRequestTimeoutError = class extends Error {
			constructor() {
				super("Request timed out; server outcome is unconfirmed");
			}
		};
		/** Preserve account JSON decoding and uncertain mutation timeout semantics. */
		function requestJson(path, init) {
			return requestBody(path, init, (response) => response.json().catch(() => void 0));
		}
		/** One headers + body deadline; cancellation settles even transports that ignore abort. */
		async function requestBody(path, init, read) {
			const controller = new AbortController();
			const parent = init.signal;
			const abort = () => {
				controller.abort(parent?.reason);
			};
			if (parent?.aborted) abort();
			else parent?.addEventListener("abort", abort, { once: true });
			const timer = setTimeout(() => {
				controller.abort(new BrowserRequestTimeoutError());
			}, BROWSER_REQUEST_TIMEOUT_MS);
			let rejectAbort;
			try {
				if (controller.signal.aborted) throw controller.signal.reason;
				const cancelled = new Promise((_resolve, reject) => {
					rejectAbort = () => {
						reject(controller.signal.reason);
					};
					controller.signal.addEventListener("abort", rejectAbort, { once: true });
				});
				const reading = (async () => {
					const response = await fetch(path, {
						...init,
						signal: controller.signal
					});
					if (controller.signal.aborted) throw controller.signal.reason;
					const value = await read(response);
					if (controller.signal.aborted) throw controller.signal.reason;
					return {
						response,
						value
					};
				})();
				return await Promise.race([reading, cancelled]);
			} catch (error) {
				controller.abort(error);
				throw error;
			} finally {
				clearTimeout(timer);
				parent?.removeEventListener("abort", abort);
				if (rejectAbort !== void 0) controller.signal.removeEventListener("abort", rejectAbort);
			}
		}
		//#endregion
		//#region src/auth-paths.ts
		/** Node-free route constants shared by the Host and browser plugin halves. */
		/** Plugin-owned status endpoint consumed by its browser half. */
		const OPENAI_CODEX_AUTH_STATUS_PATH = "/plugins/dsh-openai-codex/auth/status";
		/** Plugin-owned browser-login endpoint consumed by its browser half. */
		const OPENAI_CODEX_AUTH_LOGIN_PATH = "/plugins/dsh-openai-codex/auth/login";
		/** Submit the complete OAuth redirect URL to the pending browser login. */
		const OPENAI_CODEX_AUTH_CALLBACK_PATH = "/plugins/dsh-openai-codex/auth/callback";
		/** Plugin-owned logout endpoint consumed by its browser half. */
		const OPENAI_CODEX_AUTH_LOGOUT_PATH = "/plugins/dsh-openai-codex/auth/logout";
		/** Cancel only the pending authorization; never delete a stored credential. */
		const OPENAI_CODEX_AUTH_CANCEL_PATH = "/plugins/dsh-openai-codex/auth/cancel";
		/** List, activate, and remove stored OpenAI Codex accounts. */
		const OPENAI_CODEX_AUTH_ACCOUNTS_PATH = "/plugins/dsh-openai-codex/auth/accounts";
		//#endregion
		//#region src/client/account-store.ts
		var AccountRequestError = class extends Error {};
		function isRecord$1(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		/**
		* Validate the optional reset-credit projection. Malformed blocks are dropped
		* rather than failing the account response, matching the provider parser: the
		* quota windows must keep working without them.
		*/
		function decodeResetCredits(value) {
			if (!isRecord$1(value)) return void 0;
			const availableCount = value["availableCount"];
			if (typeof availableCount !== "number" || !Number.isSafeInteger(availableCount) || availableCount < 0) return void 0;
			const entries = value["credits"];
			if (entries !== void 0 && entries !== null && !Array.isArray(entries)) return void 0;
			const credits = [];
			for (const candidate of entries ?? []) {
				if (!isRecord$1(candidate) || typeof candidate["id"] !== "string" || candidate["id"].length === 0 || candidate["id"].length > 256 || typeof candidate["resetType"] !== "string" || typeof candidate["status"] !== "string" || typeof candidate["grantedAt"] !== "number" || !Number.isSafeInteger(candidate["grantedAt"]) || candidate["grantedAt"] < 0 || candidate["expiresAt"] !== void 0 && (typeof candidate["expiresAt"] !== "number" || !Number.isSafeInteger(candidate["expiresAt"]) || candidate["expiresAt"] < 0) || candidate["title"] !== void 0 && (typeof candidate["title"] !== "string" || candidate["title"].length > 256)) return;
				credits.push({
					id: candidate["id"],
					resetType: candidate["resetType"],
					status: candidate["status"],
					grantedAt: candidate["grantedAt"],
					...typeof candidate["expiresAt"] === "number" ? { expiresAt: candidate["expiresAt"] } : {},
					...typeof candidate["title"] === "string" ? { title: candidate["title"] } : {}
				});
			}
			return {
				availableCount,
				...entries === void 0 || entries === null ? {} : { credits }
			};
		}
		/**
		* Validate one secret-free provider usage projection from a same-origin
		* response.
		* @param value - opaque JSON field carried by the account status or quota route.
		* @returns the validated rolling buckets, credits, optional member limit, and reset credits.
		*/
		function decodeOpenAICodexUsage(value) {
			if (!isRecord$1(value) || !Array.isArray(value["rateLimits"])) throw new AccountRequestError("Invalid account response");
			const rateLimits = value["rateLimits"].map((candidate) => {
				if (!isRecord$1(candidate) || typeof candidate["id"] !== "string" || candidate["id"].length === 0 || candidate["id"].length > 128 || candidate["name"] !== void 0 && (typeof candidate["name"] !== "string" || candidate["name"].length > 128) || !Array.isArray(candidate["windows"])) throw new AccountRequestError("Invalid account response");
				const windows = candidate["windows"].map((window) => {
					if (!isRecord$1(window) || typeof window["remainingPercent"] !== "number" || !Number.isFinite(window["remainingPercent"]) || window["remainingPercent"] < 0 || window["remainingPercent"] > 100 || typeof window["windowSeconds"] !== "number" || !Number.isSafeInteger(window["windowSeconds"]) || window["windowSeconds"] <= 0 || window["resetAt"] !== void 0 && (typeof window["resetAt"] !== "number" || !Number.isSafeInteger(window["resetAt"]) || window["resetAt"] <= 0)) throw new AccountRequestError("Invalid account response");
					return {
						remainingPercent: window["remainingPercent"],
						windowSeconds: window["windowSeconds"],
						...typeof window["resetAt"] === "number" ? { resetAt: window["resetAt"] } : {}
					};
				});
				return {
					id: candidate["id"],
					...typeof candidate["name"] === "string" ? { name: candidate["name"] } : {},
					windows
				};
			});
			const credits = value["credits"];
			if (credits !== void 0 && (!isRecord$1(credits) || typeof credits["unlimited"] !== "boolean" || credits["balance"] !== void 0 && typeof credits["balance"] !== "string")) throw new AccountRequestError("Invalid account response");
			const individual = value["individualLimit"];
			if (individual !== void 0 && (!isRecord$1(individual) || typeof individual["limit"] !== "string" || typeof individual["used"] !== "string" || typeof individual["remaining"] !== "string" || typeof individual["remainingPercent"] !== "number" || !Number.isFinite(individual["remainingPercent"]) || individual["remainingPercent"] < 0 || individual["remainingPercent"] > 100)) throw new AccountRequestError("Invalid account response");
			const resetCredits = decodeResetCredits(value["resetCredits"]);
			return {
				rateLimits,
				...isRecord$1(credits) ? { credits: {
					unlimited: credits["unlimited"],
					...typeof credits["balance"] === "string" ? { balance: credits["balance"] } : {}
				} } : {},
				...isRecord$1(individual) ? { individualLimit: {
					limit: individual["limit"],
					used: individual["used"],
					remaining: individual["remaining"],
					remainingPercent: individual["remainingPercent"]
				} } : {},
				...resetCredits === void 0 ? {} : { resetCredits }
			};
		}
		function parseStatus(value) {
			if (!isRecord$1(value) || typeof value["status"] !== "string") throw new AccountRequestError("Invalid account response");
			if (value["status"] === "signed-out" || value["status"] === "signing-in") return { status: value["status"] };
			if (value["status"] === "signed-in") {
				if (value["quotaError"] !== void 0 && typeof value["quotaError"] !== "string") throw new AccountRequestError("Invalid account response");
				const code = value["quotaErrorCode"];
				if (code !== void 0 && (value["quotaError"] === void 0 || ![
					"reauth-required",
					"rate-limited",
					"unavailable"
				].includes(String(code)))) throw new AccountRequestError("Invalid account response");
				return {
					...code === "reauth-required" || code === "rate-limited" || code === "unavailable" ? { quotaErrorCode: code } : {},
					status: "signed-in",
					usage: decodeOpenAICodexUsage(value["usage"]),
					...typeof value["quotaError"] === "string" ? { quotaError: value["quotaError"] } : {}
				};
			}
			if (value["status"] === "reauth-required" || value["status"] === "error") {
				if (typeof value["message"] !== "string") throw new AccountRequestError("Invalid account response");
				return {
					status: value["status"],
					message: value["message"]
				};
			}
			throw new AccountRequestError("Invalid account response");
		}
		function parseAccounts(value) {
			if (!isRecord$1(value) || !Array.isArray(value["accounts"])) throw new AccountRequestError("Invalid account response");
			if (value["accounts"].length > 16) throw new AccountRequestError("Invalid account response");
			const accounts = value["accounts"].map((candidate) => {
				if (!isRecord$1(candidate) || typeof candidate["accountKey"] !== "string" || !OPENAI_CODEX_ACCOUNT_KEY_PATTERN.test(candidate["accountKey"]) || typeof candidate["active"] !== "boolean" || typeof candidate["displayName"] !== "string" || candidate["displayName"].length === 0 || candidate["displayName"].length > 128 || candidate["maskedEmail"] !== void 0 && typeof candidate["maskedEmail"] !== "string" || typeof candidate["maskedEmail"] === "string" && candidate["maskedEmail"].length > 320 || candidate["profileSource"] !== "oauth" && candidate["profileSource"] !== "generated") throw new AccountRequestError("Invalid account response");
				return {
					accountKey: candidate["accountKey"],
					active: candidate["active"],
					displayName: candidate["displayName"],
					...typeof candidate["maskedEmail"] === "string" ? { maskedEmail: candidate["maskedEmail"] } : {},
					profileSource: candidate["profileSource"]
				};
			});
			if (new Set(accounts.map((account) => account.accountKey)).size !== accounts.length || accounts.filter((account) => account.active).length !== (accounts.length === 0 ? 0 : 1)) throw new AccountRequestError("Invalid account response");
			return accounts;
		}
		function parseChallenge(value) {
			if (!isRecord$1(value) || typeof value["url"] !== "string") throw new AccountRequestError("Invalid account response");
			let url;
			try {
				url = new URL(value["url"]);
			} catch {
				throw new AccountRequestError("Invalid account response");
			}
			if (url.protocol !== "https:" || url.username !== "" || url.password !== "") throw new AccountRequestError("Invalid account response");
			return { url: url.href };
		}
		async function request(path, method = "GET", signal, body) {
			const { response, value } = await requestJson(path, {
				method,
				headers: {
					accept: "application/json",
					...body === void 0 ? {} : { "content-type": "application/json" }
				},
				credentials: "same-origin",
				...signal === void 0 ? {} : { signal },
				...body === void 0 ? {} : { body: JSON.stringify(body) }
			});
			if (!response.ok) throw new AccountRequestError(typeof value === "object" && value !== null && "error" in value && typeof value.error === "string" ? value.error : `HTTP ${response.status}`);
			return value;
		}
		/** One account state per browser-plugin instance; subscribers share requests and timers. */
		var OpenAICodexAccountStore = class {
			snapshot = {
				status: { status: "loading" },
				busy: false,
				accounts: [],
				operation: { kind: "idle" }
			};
			listeners = /* @__PURE__ */ new Set();
			controller;
			timer;
			disposed = false;
			lifetime = new AbortController();
			popup = null;
			getSnapshot = () => this.snapshot;
			subscribe = (listener) => {
				if (this.disposed) return () => {};
				this.listeners.add(listener);
				if (this.listeners.size === 1) this.refresh();
				return () => {
					this.listeners.delete(listener);
					if (this.listeners.size === 0) this.stopPolling();
				};
			};
			publish(snapshot) {
				if (this.disposed) return;
				this.snapshot = {
					authorizationRevision: this.snapshot.authorizationRevision ?? 0,
					...snapshot
				};
				for (const listener of this.listeners) listener();
			}
			failure(error) {
				return error instanceof AccountRequestError && error.message === "remote-web-origin-not-trusted" ? { status: "remote-web-origin-not-trusted" } : {
					status: "error",
					message: error instanceof Error ? error.message : "Account request failed"
				};
			}
			errorMessage(error) {
				return error instanceof Error ? error.message : "Account request failed";
			}
			stopPolling() {
				clearTimeout(this.timer);
				this.timer = void 0;
				this.controller?.abort();
				this.controller = void 0;
			}
			schedule() {
				clearTimeout(this.timer);
				const interval = this.snapshot.operation.kind === "waiting-authorization" || this.snapshot.status.status === "signing-in" ? 1e3 : this.snapshot.operationError !== void 0 ? 5e3 : this.snapshot.status.status === "signed-in" ? 6e4 : this.snapshot.status.status === "error" ? 5e3 : void 0;
				if (!this.disposed && this.listeners.size > 0 && interval !== void 0) this.timer = setTimeout(() => {
					this.refresh();
				}, interval);
			}
			async readServerState(signal) {
				const response = await this.request(OPENAI_CODEX_AUTH_STATUS_PATH, "GET", signal);
				return {
					status: parseStatus(response),
					accounts: parseAccounts(response)
				};
			}
			request(path, method = "GET", signal, body) {
				return request(path, method, signal === void 0 ? this.lifetime.signal : AbortSignal.any([signal, this.lifetime.signal]), body);
			}
			stableStatus(status, accounts) {
				if (status.status !== "signing-in" || accounts.length === 0) return status;
				if (accounts.find((account) => account.active)?.accountKey !== this.snapshot.accounts.find((account) => account.active)?.accountKey) return status;
				return this.snapshot.status.status === "signed-in" || this.snapshot.status.status === "reauth-required" ? this.snapshot.status : status;
			}
			/** Refresh only while observed, without overlapping status reads or OAuth mutations. */
			async refresh() {
				if (this.disposed || this.snapshot.busy || this.controller !== void 0 || this.listeners.size === 0) return;
				const controller = new AbortController();
				this.controller = controller;
				try {
					const server = await this.readServerState(controller.signal);
					if (!controller.signal.aborted) this.publish({
						status: this.stableStatus(server.status, server.accounts),
						accounts: server.accounts,
						busy: false,
						operation: server.status.status === "signing-in" ? { kind: "waiting-authorization" } : { kind: "idle" },
						...server.status.status === "signing-in" && this.snapshot.loginUrl !== void 0 ? { loginUrl: this.snapshot.loginUrl } : {},
						...server.status.status === "signing-in" && this.snapshot.callbackFeedback !== void 0 ? { callbackFeedback: this.snapshot.callbackFeedback } : {}
					});
				} catch (error) {
					if (!controller.signal.aborted) this.publish({
						status: this.failure(error),
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" }
					});
				} finally {
					if (this.controller === controller) {
						this.controller = void 0;
						this.schedule();
					}
				}
			}
			/** Start or reopen the server-owned authorization from a user click, retaining popup permission. */
			async signIn() {
				if (this.disposed || this.snapshot.busy) return;
				this.stopPolling();
				const popup = window.open("about:blank", "_blank");
				this.popup = popup;
				if (popup !== null) popup.opener = null;
				const retained = this.snapshot.status.status === "signed-in" || this.snapshot.status.status === "reauth-required" ? this.snapshot.status : { status: "signing-in" };
				this.publish({
					status: retained,
					busy: true,
					accounts: this.snapshot.accounts,
					operation: { kind: "starting-authorization" },
					authorizationRevision: (this.snapshot.authorizationRevision ?? 0) + 1
				});
				try {
					const challenge = parseChallenge(await this.request(OPENAI_CODEX_AUTH_LOGIN_PATH, "POST"));
					if (this.disposed) {
						popup?.close();
						return;
					}
					if (popup !== null) popup.location.replace(challenge.url);
					this.publish({
						status: retained,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "waiting-authorization" },
						loginUrl: challenge.url
					});
				} catch (error) {
					popup?.close();
					this.publish(this.snapshot.accounts.length === 0 ? {
						status: this.failure(error),
						busy: false,
						accounts: [],
						operation: { kind: "idle" }
					} : {
						status: retained,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
					if (error instanceof BrowserRequestTimeoutError || error instanceof AccountRequestError && error.message === "OpenAI Codex sign-in cancelled") await this.refresh();
				} finally {
					if (this.popup === popup) this.popup = null;
					this.schedule();
				}
			}
			/** Forward a user-pasted callback once. Only fixed feedback codes enter shared state. */
			async submitCallback(callbackUrl) {
				if (this.disposed || this.snapshot.busy || this.snapshot.operation.kind !== "waiting-authorization") return;
				this.stopPolling();
				const { callbackFeedback: _feedback, operationError: _error, ...retained } = this.snapshot;
				this.publish({
					...retained,
					busy: true,
					authorizationRevision: (this.snapshot.authorizationRevision ?? 0) + 1
				});
				let feedback = "callbackFailed";
				try {
					const pending = requestJson(OPENAI_CODEX_AUTH_CALLBACK_PATH, {
						method: "POST",
						credentials: "same-origin",
						signal: this.lifetime.signal,
						headers: {
							accept: "application/json",
							"content-type": "application/json"
						},
						body: JSON.stringify({ callbackUrl })
					});
					callbackUrl = "";
					const { response, value } = await pending;
					feedback = response.ok && isRecord$1(value) && value["ok"] === true ? "callbackAccepted" : response.status === 400 ? "callbackInvalid" : response.status === 409 ? "callbackNoPending" : "callbackFailed";
				} catch (error) {
					feedback = error instanceof BrowserRequestTimeoutError ? "callbackUnconfirmed" : "callbackFailed";
				} finally {
					callbackUrl = "";
					this.publish({
						...this.snapshot,
						busy: false,
						callbackFeedback: feedback
					});
					this.schedule();
				}
			}
			/** Cancel only the pending authorization, preserving an already signed-in account. */
			async cancel() {
				if (this.disposed || this.snapshot.busy) return;
				this.stopPolling();
				this.publish({
					...this.snapshot,
					busy: true,
					operation: { kind: "cancelling-authorization" },
					authorizationRevision: (this.snapshot.authorizationRevision ?? 0) + 1
				});
				try {
					await this.request(OPENAI_CODEX_AUTH_CANCEL_PATH, "POST");
					const { status, accounts } = await this.readServerState();
					this.publish({
						status,
						busy: false,
						accounts,
						operation: { kind: "idle" }
					});
				} catch (error) {
					this.publish(this.snapshot.accounts.length === 0 ? {
						status: this.failure(error),
						busy: false,
						accounts: [],
						operation: { kind: "idle" }
					} : {
						status: this.snapshot.status,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
					if (error instanceof BrowserRequestTimeoutError) await this.refresh();
				} finally {
					this.schedule();
				}
			}
			/** Sign out once for all mounted account views and invalidate older status reads. */
			async signOut() {
				if (this.disposed || this.snapshot.busy) return;
				this.stopPolling();
				this.publish({
					...this.snapshot,
					busy: true,
					operation: { kind: "signing-out" }
				});
				try {
					await this.request(OPENAI_CODEX_AUTH_LOGOUT_PATH, "POST");
					this.publish({
						status: { status: "signed-out" },
						busy: false,
						accounts: [],
						operation: { kind: "idle" }
					});
				} catch (error) {
					this.publish({
						status: this.snapshot.status,
						busy: false,
						accounts: this.snapshot.accounts,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
					if (error instanceof BrowserRequestTimeoutError) await this.refresh();
				} finally {
					this.schedule();
				}
			}
			/** Select one stored account and refresh account-specific status and quota. */
			async activate(accountKey) {
				if (this.disposed || this.snapshot.busy || this.snapshot.accounts.some((account) => account.accountKey === accountKey && account.active)) return;
				await this.mutateAccount("activating", accountKey, "POST", { accountKey });
			}
			/** Remove one stored account, naming the replacement when the active account is removed. */
			async remove(accountKey, replacementAccountKey) {
				if (this.disposed || this.snapshot.busy) return;
				await this.mutateAccount("removing", accountKey, "DELETE", {
					accountKey,
					...replacementAccountKey === void 0 ? {} : { replacementAccountKey }
				});
			}
			async mutateAccount(kind, accountKey, method, body) {
				this.stopPolling();
				this.publish({
					...this.snapshot,
					busy: true,
					operation: {
						kind,
						accountKey
					}
				});
				try {
					await this.request(OPENAI_CODEX_AUTH_ACCOUNTS_PATH, method, void 0, body);
					const { status, accounts } = await this.readServerState();
					this.publish({
						status,
						accounts,
						busy: false,
						operation: { kind: "idle" }
					});
				} catch (error) {
					this.publish({
						status: this.snapshot.status,
						accounts: this.snapshot.accounts,
						busy: false,
						operation: { kind: "idle" },
						operationError: this.errorMessage(error)
					});
					if (error instanceof BrowserRequestTimeoutError) await this.refresh();
				} finally {
					this.schedule();
				}
			}
			/** Stop local observation on plugin unload; do not log out the server account. */
			dispose() {
				this.disposed = true;
				this.lifetime.abort();
				this.stopPolling();
				this.popup?.close();
				this.popup = null;
				this.listeners.clear();
				this.snapshot = {
					status: { status: "loading" },
					busy: false,
					accounts: [],
					operation: { kind: "idle" }
				};
			}
		};
		//#endregion
		//#region src/model-contract.ts
		/** Node-free model catalog contract shared by the Host route and browser card. */
		/** Same-origin endpoint exposing the complete Codex model catalog. */
		const OPENAI_CODEX_MODEL_CATALOG_PATH = "/plugins/dsh-codex-connect/models";
		/** Same-origin endpoint exposing where the catalog came from and when it was read. */
		const OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH = "/plugins/dsh-codex-connect/models/status";
		/** Same-origin endpoint forcing one live catalog read through the active account. */
		const OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH = "/plugins/dsh-codex-connect/models/refresh";
		/** Versioned official-client override policy, not a measured endpoint capacity. */
		const OPENAI_CODEX_CONTEXT_LIMIT_SOURCE = "https://github.com/openai/codex/blob/a97cf1b72eaad05aa49847bc81d09ceac9327754/codex-rs/models-manager/models.json";
		Object.freeze({
			"gpt-6-astra": 872e3,
			"gpt-5.6-sol": 872e3,
			"gpt-5.6-terra": 872e3,
			"gpt-5.6-luna": 872e3,
			"gpt-5.4": 1e6,
			"gpt-5.5": 272e3,
			"gpt-5.4-mini": 272e3
		});
		/** Whether a proposed local token budget fits the model's configuration range. */
		function isValidOpenAICodexContextBudget(value, maximum) {
			return Number.isSafeInteger(value) && value > 0 && value <= maximum;
		}
		/** Validate the model catalog before it enters React state. */
		function decodeOpenAICodexModelCatalog(value) {
			if (!Array.isArray(value)) return void 0;
			const catalog = [];
			const ids = /* @__PURE__ */ new Set();
			for (const entry of value) {
				if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return void 0;
				const record = entry;
				const id = record["id"];
				const name = record["name"];
				const contextWindow = record["contextWindow"];
				const maxTokens = record["maxTokens"];
				const maxContextWindow = record["maxContextWindow"];
				const contextLimitSource = record["contextLimitSource"];
				if (typeof id !== "string" || id.length === 0 || typeof name !== "string" || name.length === 0 || ids.has(id)) return void 0;
				if (typeof contextWindow !== "number" || typeof maxTokens !== "number" || typeof maxContextWindow !== "number" || !isValidOpenAICodexContextBudget(maxContextWindow, Number.MAX_SAFE_INTEGER) || !isValidOpenAICodexContextBudget(contextWindow, maxContextWindow) || !isValidOpenAICodexContextBudget(maxTokens, maxContextWindow) || contextLimitSource !== "codex-catalog" && contextLimitSource !== "catalog-default") return void 0;
				const serviceTiers = decodeServiceTiers(record["serviceTiers"]);
				const reasoningLevels = decodeReasoningLevels(record["reasoningLevels"]);
				if (record.available !== void 0 && typeof record.available !== "boolean") return void 0;
				if (record["serviceTiers"] !== void 0 && serviceTiers === void 0) return void 0;
				if (record["reasoningLevels"] !== void 0 && reasoningLevels === void 0) return void 0;
				ids.add(id);
				catalog.push({
					id,
					name,
					contextWindow,
					maxTokens,
					maxContextWindow,
					contextLimitSource,
					...typeof record.available === "boolean" ? { available: record.available } : {},
					...serviceTiers === void 0 ? {} : { serviceTiers },
					...reasoningLevels === void 0 ? {} : { reasoningLevels }
				});
			}
			return catalog;
		}
		/** Accept a bounded service-tier list from the Host route, ignoring malformed entries. */
		function decodeServiceTiers(value) {
			if (value === void 0) return void 0;
			if (!Array.isArray(value)) return void 0;
			const tiers = [];
			for (const item of value) {
				if (typeof item !== "object" || item === null || Array.isArray(item)) return void 0;
				const record = item;
				const id = record["id"];
				if (typeof id !== "string" || id.length === 0) return void 0;
				const name = record["name"];
				const description = record["description"];
				if (name !== void 0 && typeof name !== "string") return void 0;
				if (description !== void 0 && typeof description !== "string") return void 0;
				tiers.push({
					id,
					...name === void 0 ? {} : { name },
					...description === void 0 ? {} : { description }
				});
			}
			return tiers;
		}
		/** Accept a bounded reasoning-effort list from the Host route, ignoring malformed entries. */
		function decodeReasoningLevels(value) {
			if (value === void 0) return void 0;
			if (!Array.isArray(value)) return void 0;
			const levels = [];
			for (const item of value) {
				if (typeof item !== "object" || item === null || Array.isArray(item)) return void 0;
				const record = item;
				const effort = record["effort"];
				if (typeof effort !== "string" || effort.length === 0) return void 0;
				const description = record["description"];
				if (description !== void 0 && typeof description !== "string") return void 0;
				levels.push({
					effort,
					...description === void 0 ? {} : { description }
				});
			}
			return levels;
		}
		/** Validate the catalog-source status before it enters React state. */
		function decodeOpenAICodexModelCatalogStatus(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const record = value;
			const source = record["source"];
			const clientVersion = record["clientVersion"];
			const modelCount = record["modelCount"];
			const updatedAt = record["updatedAt"];
			const unavailableModels = record["unavailableModels"];
			if (source !== "live" && source !== "cache" && source !== "cli-cache" && source !== "bundled") return void 0;
			if (typeof clientVersion !== "string" || clientVersion.length === 0) return void 0;
			if (typeof modelCount !== "number" || !Number.isSafeInteger(modelCount) || modelCount < 0) return void 0;
			if (updatedAt !== void 0 && (typeof updatedAt !== "number" || !Number.isFinite(updatedAt))) return void 0;
			if (unavailableModels !== void 0 && (!Array.isArray(unavailableModels) || unavailableModels.some((entry) => typeof entry !== "string"))) return void 0;
			return {
				source,
				clientVersion,
				modelCount,
				...updatedAt === void 0 ? {} : { updatedAt },
				unavailableModels: unavailableModels ?? []
			};
		}
		//#endregion
		//#region src/client/AccountModelCatalog.tsx
		/** Account-scoped metadata preview; never activates an account or changes a model selection. */
		function statusMessage(status) {
			switch (status) {
				case 401: return "managementCatalogAuthRequired";
				case 403: return "managementCatalogForbidden";
				case 404: return "managementCatalogAccountRemoved";
				case 503: return "managementCatalogUnavailable";
				default: return "managementCatalogFailed";
			}
		}
		/** Bound reads follow the selected account; late results cannot overwrite a newer selection. */
		function AccountModelCatalog({ t, account, active, refreshRevision = 0 }) {
			const snapshot = (0, react.useSyncExternalStore)(account.subscribe, account.getSnapshot);
			const [selection, setSelection] = (0, react.useState)();
			const accountKey = (snapshot.accounts.find((candidate) => candidate.accountKey === selection) ?? snapshot.accounts.find((candidate) => candidate.active) ?? snapshot.accounts[0])?.accountKey;
			const [preview, setPreview] = (0, react.useState)();
			const [retry, setRetry] = (0, react.useState)(0);
			const selectId = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (!active || accountKey === void 0) return;
				const controller = new AbortController();
				setPreview((previous) => ({
					accountKey,
					status: "loading",
					...previous?.accountKey === accountKey && previous.models !== void 0 ? { models: previous.models } : {}
				}));
				const fail = (error) => {
					if (!controller.signal.aborted) setPreview((previous) => ({
						accountKey,
						status: "failed",
						error,
						...previous?.accountKey === accountKey && previous.models !== void 0 ? { models: previous.models } : {}
					}));
				};
				(async () => {
					try {
						const { response, value } = await requestJson("/plugins/dsh-codex-connect/models?accountKey=" + encodeURIComponent(accountKey), {
							method: "GET",
							credentials: "same-origin",
							signal: controller.signal
						});
						if (!response.ok) {
							fail(statusMessage(response.status));
							return;
						}
						const models = decodeOpenAICodexModelCatalog(value);
						if (models === void 0) {
							fail("managementCatalogInvalid");
							return;
						}
						if (!controller.signal.aborted) setPreview({
							accountKey,
							status: "ready",
							models
						});
					} catch (error) {
						fail(error instanceof BrowserRequestTimeoutError ? "managementCatalogTimeout" : "managementCatalogFailed");
					}
				})();
				return () => {
					controller.abort();
				};
			}, [
				accountKey,
				active,
				retry,
				refreshRevision
			]);
			const current = preview?.accountKey === accountKey ? preview : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cc-manage-catalog",
				"aria-label": t("managementAccountCatalog"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("managementAccountCatalog") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("managementAccountCatalogHelp") })] }), snapshot.accounts.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					children: t("managementCatalogLogin")
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						htmlFor: selectId,
						children: [t("managementPreviewAccount"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
							id: selectId,
							value: accountKey,
							onChange: (event) => {
								setSelection(event.currentTarget.value);
							},
							children: snapshot.accounts.map((candidate) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: candidate.accountKey,
								children: candidate.displayName
							}, candidate.accountKey))
						})]
					}),
					current === void 0 || current.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("modelCatalogLoading")
					}) : null,
					current?.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "alert",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(current.error ?? "managementCatalogFailed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => {
								setRetry((value) => value + 1);
							},
							children: t("managementCatalogRetry")
						})]
					}) : null,
					current?.models !== void 0 && current.status !== "ready" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						role: "status",
						children: t("managementCatalogRetained")
					}) : null,
					current?.models !== void 0 ? current.models.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("managementCatalogEmpty") }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: current.models.map((model) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: model.name }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(model.available === false ? "managementModelUnavailable" : model.available === true ? "managementModelAvailable" : "catalogSourceBundled") })] }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", { children: model.id }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
							t("contextTokens"),
							": ",
							new Intl.NumberFormat(t("dateLocale")).format(model.contextWindow),
							" · ",
							t("maxTokensLabel"),
							": ",
							new Intl.NumberFormat(t("dateLocale")).format(model.maxTokens)
						] }),
						model.available === false ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("managementModelUnavailableReason") }) : null
					] }, model.id)) }) : null
				] })]
			});
		}
		//#endregion
		//#region src/proxy-paths.ts
		/** Node-free route constants shared by the Host and browser plugin halves. */
		/** Detect bounded local/environment proxy candidates without changing settings. */
		const OPENAI_CODEX_PROXY_DETECT_PATH = "/plugins/dsh-openai-codex/proxy/detect";
		/** Test one manually entered proxy origin without changing settings. */
		const OPENAI_CODEX_PROXY_TEST_PATH = "/plugins/dsh-openai-codex/proxy/test";
		//#endregion
		//#region src/client/OpenAICodexConfiguration.tsx
		/** Staged optional-capability editor inside the OpenAI Codex plugin card. */
		const sectionStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 14,
			paddingTop: 18,
			borderTop: "1px solid var(--dsw-alias-border-l2)"
		};
		const flushSectionStyle = {
			...sectionStyle,
			gap: 18,
			paddingTop: 0,
			borderTop: 0
		};
		const headingStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const bodyStyle$1 = {
			margin: 0,
			fontSize: 13,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const fieldsetStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 13,
			margin: 0,
			padding: 0,
			border: 0
		};
		const modelListStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const modelRowStyle = {
			display: "flex",
			alignItems: "center",
			gap: 9,
			minHeight: 30,
			fontSize: 13,
			color: "var(--dsw-alias-label-primary)",
			cursor: "pointer"
		};
		const modelIdStyle = {
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 12,
			color: "var(--dsw-alias-label-secondary)"
		};
		const toggleRowStyle = {
			display: "flex",
			alignItems: "flex-start",
			gap: 10,
			cursor: "pointer"
		};
		const toggleCopyStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 2
		};
		const labelStyle = {
			fontSize: 13,
			lineHeight: "20px",
			fontWeight: 500,
			color: "var(--dsw-alias-label-primary)"
		};
		const formGridStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
			gap: 12
		};
		const formFieldStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 6
		};
		const controlStyle = {
			boxSizing: "border-box",
			width: "100%",
			minHeight: 36,
			padding: "7px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 13
		};
		const actionsStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 10
		};
		const buttonsStyle = {
			display: "flex",
			gap: 8
		};
		const buttonStyle$2 = {
			boxSizing: "border-box",
			minHeight: 34,
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 13,
			cursor: "pointer"
		};
		const primaryButtonStyle$1 = {
			...buttonStyle$2,
			borderColor: "var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)"
		};
		const proxyButtonStyle = {
			...buttonStyle$2,
			minHeight: 44
		};
		const primaryProxyButtonStyle = {
			...primaryButtonStyle$1,
			minHeight: 44
		};
		const errorStyle$2 = {
			...bodyStyle$1,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const successStyle = {
			...bodyStyle$1,
			color: "var(--dsw-alias-state-success-primary, #16825d)"
		};
		const badgeStyle = {
			display: "inline-flex",
			alignItems: "center",
			minHeight: 18,
			padding: "0 6px",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 11,
			lineHeight: "18px",
			fontWeight: 500
		};
		const connectionCardStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 14,
			padding: "14px 16px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))"
		};
		const candidateStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12,
			minHeight: 64,
			padding: "10px 12px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10
		};
		const statePillStyle = {
			...bodyStyle$1,
			display: "inline-flex",
			alignItems: "center",
			justifyContent: "center",
			minHeight: 32,
			padding: "4px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
			whiteSpace: "nowrap"
		};
		const proxyTabsStyle = {
			display: "inline-flex",
			alignSelf: "flex-start",
			padding: 3,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))"
		};
		const proxyTabStyle = {
			boxSizing: "border-box",
			minHeight: 44,
			padding: "8px 14px",
			border: 0,
			borderRadius: 7,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			font: "inherit",
			fontSize: 13,
			cursor: "pointer"
		};
		const activeProxyTabStyle = {
			...proxyTabStyle,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			boxShadow: "0 1px 3px rgb(0 0 0 / 8%)"
		};
		const groupStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10,
			padding: "12px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10
		};
		const pendingStyle = {
			...bodyStyle$1,
			padding: "9px 12px",
			borderRadius: 8,
			border: "1px solid var(--dsw-alias-border-l2)",
			background: "color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)",
			color: "var(--dsw-alias-label-primary)"
		};
		const moduleTabsStyle = {
			display: "grid",
			gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
			gap: 8
		};
		const moduleTabStyle = {
			...buttonStyle$2,
			minWidth: 0,
			minHeight: 44,
			borderRadius: 10,
			overflowWrap: "anywhere"
		};
		const activeModuleTabStyle = {
			...moduleTabStyle,
			border: "1px solid var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
			color: "var(--dsw-alias-label-primary)"
		};
		const CONFIGURATION_MODULES = [
			"models",
			"network",
			"capabilities"
		];
		const CATALOG_SOURCE_KEYS = {
			live: "catalogSourceLive",
			cache: "catalogSourceCache",
			"cli-cache": "catalogSourceCliCache",
			bundled: "catalogSourceBundled"
		};
		const UNAVAILABLE_SNAPSHOT = {
			status: "unavailable",
			value: void 0,
			base: void 0,
			user: void 0,
			revision: void 0,
			writable: false,
			mode: "memory"
		};
		const CONFIG_FIELDS = [
			"models",
			"contextWindowOverrides",
			"maxTokensOverrides",
			"contextWindowMode",
			"enableNewSessionFastMode",
			"enableNewSubagentFastMode",
			"newSessionSpeedMode",
			"newSubagentSpeedMode",
			"reasoningEffort",
			"autoReviewLocalPolicy",
			"debugLogPayloadFields",
			"enableProxy",
			"proxyUrl",
			"maxResidentWebSocketSessions",
			"enableImageTool",
			"enableImageGeneration",
			"imageModelHint",
			"autoReviewDisclosureAcknowledged",
			"enableAutoReview",
			"searchModel",
			"searchMode",
			"searchContextSize",
			"searchMaxOutputTokens",
			"enableSearch"
		];
		/** Require one profile-scoped acknowledgement before staging Auto-review. */
		function AutoReviewConsentDialog({ t, onCancel, onConfirm }) {
			const dialog = (0, react.useRef)(null);
			const titleId = (0, react.useId)();
			(0, react.useEffect)(() => {
				const element = dialog.current;
				element?.showModal();
				return () => {
					element?.close();
				};
			}, []);
			const close = () => {
				dialog.current?.close();
				onCancel();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("dialog", {
				ref: dialog,
				"aria-labelledby": titleId,
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				style: {
					boxSizing: "border-box",
					width: "min(560px, calc(100vw - 32px))",
					padding: 20,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					background: "var(--dsw-alias-bg-layer-1, white)",
					color: "var(--dsw-alias-label-primary)",
					margin: "auto"
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 12
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: titleId,
							style: {
								margin: 0,
								fontSize: 18
							},
							children: t("autoReviewConfirmTitle")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle$1,
							children: t("autoReviewDisclosure")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle$1,
							children: t("autoReviewFailureDisclosure")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
							href: "https://learn.chatgpt.com/docs/sandboxing/auto-review",
							target: "_blank",
							rel: "noopener noreferrer",
							style: {
								...bodyStyle$1,
								textDecoration: "underline",
								textUnderlineOffset: 3
							},
							children: t("autoReviewOfficialDocs")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								...buttonsStyle,
								justifyContent: "flex-end"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle$2,
								onClick: close,
								children: t("autoReviewCancel")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: primaryButtonStyle$1,
								onClick: () => {
									dialog.current?.close();
									onConfirm();
								},
								children: t("autoReviewConfirm")
							})]
						})
					]
				})
			});
		}
		function sameField(field, left, right) {
			if (field === "contextWindowOverrides" || field === "maxTokensOverrides") {
				const leftMap = left;
				const rightMap = right;
				return Object.keys(leftMap ?? {}).length === Object.keys(rightMap ?? {}).length && Object.entries(leftMap ?? {}).every(([id, value]) => rightMap?.[id] === value);
			}
			if (field !== "models") return left === right;
			if (left === void 0 || right === void 0) return left === right;
			return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((model, index) => model === right[index]);
		}
		/** Edit the Host-owned llm-openai-codex settings section with Save/Discard staging. */
		function OpenAICodexConfiguration({ scope, t, activeModule, panelIdPrefix, management = false, flush = false, account }) {
			const subscribe = (0, react.useCallback)((listener) => scope?.subscribe(listener) ?? (() => void 0), [scope]);
			const getSnapshot = (0, react.useCallback)(() => scope?.getSnapshot() ?? UNAVAILABLE_SNAPSHOT, [scope]);
			const snapshot = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const [draft, setDraft] = (0, react.useState)(snapshot.value);
			const baseline = (0, react.useRef)(snapshot.value);
			const [dirty, setDirty] = (0, react.useState)(false);
			const [busy, setBusy] = (0, react.useState)(false);
			const [feedback, setFeedback] = (0, react.useState)("idle");
			const [modelCatalog, setModelCatalog] = (0, react.useState)();
			const [modelCatalogError, setModelCatalogError] = (0, react.useState)(false);
			const [catalogStatus, setCatalogStatus] = (0, react.useState)();
			const [catalogRefreshing, setCatalogRefreshing] = (0, react.useState)(false);
			const [catalogRefreshFailed, setCatalogRefreshFailed] = (0, react.useState)(false);
			const [catalogRefreshRevision, setCatalogRefreshRevision] = (0, react.useState)(0);
			const activeAccountKey = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => account?.subscribe(listener) ?? (() => {}), [account]), (0, react.useCallback)(() => account?.getSnapshot().accounts.find((candidate) => candidate.active)?.accountKey, [account]));
			const [expandedModels, setExpandedModels] = (0, react.useState)({});
			const [proxyDetection, setProxyDetection] = (0, react.useState)({ status: "idle" });
			const [proxyMode, setProxyMode] = (0, react.useState)("auto");
			const [manualProxyUrl, setManualProxyUrl] = (0, react.useState)(snapshot.value?.proxyUrl ?? "");
			const [manualProxyEdited, setManualProxyEdited] = (0, react.useState)(false);
			const [manualProbe, setManualProbe] = (0, react.useState)();
			const [manualProbeBusy, setManualProbeBusy] = (0, react.useState)(false);
			const [currentProxyCheck, setCurrentProxyCheck] = (0, react.useState)({ status: "idle" });
			const [autoReviewConfirmOpen, setAutoReviewConfirmOpen] = (0, react.useState)(false);
			const [localModule, setLocalModule] = (0, react.useState)("models");
			const localPanelIdPrefix = (0, react.useId)();
			const proxyDetectionController = (0, react.useRef)(void 0);
			const manualProbeController = (0, react.useRef)(void 0);
			const currentProxyCheckController = (0, react.useRef)(void 0);
			const proxyDetectionRequest = (0, react.useRef)(0);
			const manualProbeRequest = (0, react.useRef)(0);
			const currentProxyCheckRequest = (0, react.useRef)(0);
			const catalogRequest = (0, react.useRef)(0);
			const replaceManualProxyInput = (0, react.useCallback)((value) => {
				manualProbeController.current?.abort();
				manualProbeRequest.current += 1;
				setManualProbeBusy(false);
				setManualProbe(void 0);
				setManualProxyUrl(value);
			}, []);
			/** Read the effective catalog and its provenance; both routes share one request identity. */
			const loadCatalog = (0, react.useCallback)(async (signal) => {
				const request = ++catalogRequest.current;
				try {
					const [catalogResponse, statusResponse] = await Promise.all([requestJson(OPENAI_CODEX_MODEL_CATALOG_PATH, {
						method: "GET",
						credentials: "same-origin",
						headers: { accept: "application/json" },
						...signal === void 0 ? {} : { signal }
					}), requestJson(OPENAI_CODEX_MODEL_CATALOG_STATUS_PATH, {
						method: "GET",
						credentials: "same-origin",
						headers: { accept: "application/json" },
						...signal === void 0 ? {} : { signal }
					})]);
					if (!catalogResponse.response.ok) throw new Error(`model catalog request failed: ${String(catalogResponse.response.status)}`);
					const catalog = decodeOpenAICodexModelCatalog(catalogResponse.value);
					if (catalog === void 0) throw new Error("model catalog response was invalid");
					if (request !== catalogRequest.current) return false;
					setModelCatalog(catalog);
					setModelCatalogError(false);
					if (statusResponse.response.ok) setCatalogStatus(decodeOpenAICodexModelCatalogStatus(statusResponse.value));
					return true;
				} catch {
					if (request === catalogRequest.current) setModelCatalogError(true);
					return false;
				}
			}, []);
			(0, react.useEffect)(() => {
				if (scope === void 0) return;
				const controller = new AbortController();
				loadCatalog(controller.signal);
				return () => {
					catalogRequest.current += 1;
					controller.abort();
				};
			}, [
				loadCatalog,
				scope,
				activeAccountKey
			]);
			/** Ask the Host for one forced live read, then re-read the effective catalog. */
			const refreshCatalog = async () => {
				if (catalogRefreshing || scope === void 0) return;
				setCatalogRefreshing(true);
				setCatalogRefreshFailed(false);
				try {
					const { response, value } = await requestJson(OPENAI_CODEX_MODEL_CATALOG_REFRESH_PATH, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" }
					});
					if (!response.ok) throw new Error(`model catalog refresh failed: ${String(response.status)}`);
					const status = decodeOpenAICodexModelCatalogStatus(value);
					if (status !== void 0) setCatalogStatus(status);
					await loadCatalog();
					setCatalogRefreshRevision((revision) => revision + 1);
				} catch {
					setCatalogRefreshFailed(true);
				} finally {
					setCatalogRefreshing(false);
				}
			};
			(0, react.useEffect)(() => {
				if (!dirty && !busy) {
					baseline.current = snapshot.value;
					setDraft(snapshot.value);
				}
			}, [
				busy,
				dirty,
				snapshot.revision,
				snapshot.value
			]);
			(0, react.useEffect)(() => {
				const accepted = snapshot.value?.proxyUrl ?? "";
				if (manualProxyEdited && manualProxyUrl === accepted) setManualProxyEdited(false);
				if (!manualProxyEdited && manualProxyUrl !== accepted) replaceManualProxyInput(accepted);
			}, [
				manualProxyEdited,
				manualProxyUrl,
				snapshot.value?.proxyUrl,
				replaceManualProxyInput
			]);
			(0, react.useEffect)(() => {
				if (feedback !== "saved") return;
				const timer = window.setTimeout(() => {
					setFeedback("idle");
				}, 2500);
				return () => {
					window.clearTimeout(timer);
				};
			}, [feedback]);
			(0, react.useEffect)(() => () => {
				proxyDetectionController.current?.abort();
				manualProbeController.current?.abort();
				currentProxyCheckController.current?.abort();
				proxyDetectionRequest.current += 1;
				manualProbeRequest.current += 1;
				currentProxyCheckRequest.current += 1;
			}, []);
			const clearCurrentProxyCheck = () => {
				currentProxyCheckController.current?.abort();
				currentProxyCheckRequest.current += 1;
				setCurrentProxyCheck({ status: "idle" });
			};
			const update = (field, value) => {
				setDraft((current) => current === void 0 ? current : {
					...current,
					[field]: value
				});
				setDirty(true);
				setFeedback("idle");
			};
			const discard = () => {
				setDraft(scope?.getSnapshot().value);
				setDirty(false);
				setFeedback("idle");
				setProxyDetection({ status: "idle" });
				setProxyMode("auto");
				replaceManualProxyInput(scope?.getSnapshot().value?.proxyUrl ?? "");
				setManualProxyEdited(false);
				manualProbeRequest.current += 1;
				setManualProbe(void 0);
				setManualProbeBusy(false);
				clearCurrentProxyCheck();
				setAutoReviewConfirmOpen(false);
			};
			const confirmAutoReview = () => {
				setDraft((current) => current === void 0 ? current : {
					...current,
					autoReviewDisclosureAcknowledged: true,
					enableAutoReview: true
				});
				setDirty(true);
				setFeedback("idle");
				setAutoReviewConfirmOpen(false);
			};
			const detectProxy = async () => {
				proxyDetectionController.current?.abort();
				const controller = new AbortController();
				proxyDetectionController.current = controller;
				const request = ++proxyDetectionRequest.current;
				setProxyDetection({ status: "detecting" });
				try {
					const { response, value: payload } = await requestJson(OPENAI_CODEX_PROXY_DETECT_PATH, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" },
						signal: controller.signal
					});
					if (!response.ok) throw new Error(`proxy detection failed: ${String(response.status)}`);
					const value = payload;
					if (!Array.isArray(value.candidates) || !Array.isArray(value.results)) throw new Error("proxy detection response was invalid");
					if (request !== proxyDetectionRequest.current) return;
					setProxyDetection(value.candidates.length > 0 ? {
						status: "candidate",
						candidates: value.candidates
					} : {
						status: "failed",
						results: value.results
					});
				} catch {
					if (request === proxyDetectionRequest.current) setProxyDetection({
						status: "failed",
						results: []
					});
				}
			};
			const useProxy = (proxyUrl) => {
				if (draft === void 0) return;
				const normalized = normalizeOpenAICodexProxyUrl(proxyUrl);
				if (normalized === void 0) return;
				const detected = proxyDetection.status === "candidate" ? proxyDetection.candidates.find((candidate) => candidate.reachable && candidate.proxyUrl === normalized) : void 0;
				const tested = manualProbe?.reachable === true && manualProbe.proxyUrl === normalized ? manualProbe : detected;
				if (tested === void 0) return;
				setDraft({
					...draft,
					proxyUrl: normalized,
					enableProxy: true
				});
				replaceManualProxyInput(normalized);
				setManualProxyEdited(true);
				setDirty(true);
				setFeedback("idle");
				setManualProbe(tested);
				clearCurrentProxyCheck();
			};
			const testManualProxy = async () => {
				const normalized = normalizeOpenAICodexProxyUrl(manualProxyUrl);
				if (normalized === void 0) return;
				manualProbeController.current?.abort();
				const controller = new AbortController();
				manualProbeController.current = controller;
				const request = ++manualProbeRequest.current;
				setManualProbeBusy(true);
				try {
					const { response, value: payload } = await requestJson(`${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" },
						signal: controller.signal
					});
					if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`);
					const result = payload;
					if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) setManualProbe(result);
				} catch {
					if (request === manualProbeRequest.current && normalizeOpenAICodexProxyUrl(manualProxyUrl) === normalized) setManualProbe({
						proxyUrl: normalized,
						reachable: false,
						classification: "connect-failure"
					});
				} finally {
					if (request === manualProbeRequest.current) setManualProbeBusy(false);
				}
			};
			const checkCurrentProxy = async () => {
				const saved = scope?.getSnapshot().value;
				const normalized = saved?.enableProxy === true ? normalizeOpenAICodexProxyUrl(saved.proxyUrl) : void 0;
				if (normalized === void 0) return;
				currentProxyCheckController.current?.abort();
				const controller = new AbortController();
				currentProxyCheckController.current = controller;
				const request = ++currentProxyCheckRequest.current;
				setCurrentProxyCheck({ status: "checking" });
				try {
					const { response, value: payload } = await requestJson(`${OPENAI_CODEX_PROXY_TEST_PATH}?proxyUrl=${encodeURIComponent(normalized)}`, {
						method: "POST",
						credentials: "same-origin",
						headers: { accept: "application/json" },
						signal: controller.signal
					});
					if (!response.ok) throw new Error(`proxy test failed: ${String(response.status)}`);
					const result = payload;
					const current = scope?.getSnapshot().value;
					if (request !== currentProxyCheckRequest.current || current?.enableProxy !== true || normalizeOpenAICodexProxyUrl(current.proxyUrl) !== normalized) return;
					setCurrentProxyCheck(result.reachable ? {
						status: "success",
						result
					} : {
						status: "failed",
						result
					});
				} catch {
					const current = scope?.getSnapshot().value;
					if (request === currentProxyCheckRequest.current && current?.enableProxy === true && normalizeOpenAICodexProxyUrl(current.proxyUrl) === normalized) setCurrentProxyCheck({ status: "failed" });
				}
			};
			const validModel = draft !== void 0 && draft.searchModel.trim().length > 0;
			const validTokens = draft !== void 0 && Number.isInteger(draft.searchMaxOutputTokens) && draft.searchMaxOutputTokens > 0;
			const validProxy = draft !== void 0 && isValidOpenAICodexProxyUrl(draft.proxyUrl);
			const validResidency = draft !== void 0 && isValidOpenAICodexResidentSessions(draft.maxResidentWebSocketSessions);
			const validImageModelHint = draft !== void 0 && isValidOpenAICodexImageModelHint(draft.imageModelHint);
			const normalizedManualProxy = normalizeOpenAICodexProxyUrl(manualProxyUrl);
			const manualProxyEntered = manualProxyUrl.trim().length > 0;
			const testedManualProxy = normalizedManualProxy !== void 0 && manualProbe?.reachable === true && manualProbe.proxyUrl === normalizedManualProxy;
			const testedProxy = draft !== void 0 && manualProbe?.reachable === true && manualProbe.proxyUrl === normalizeOpenAICodexProxyUrl(draft.proxyUrl);
			const acceptedProxyUnchanged = draft?.enableProxy === true && snapshot.value?.enableProxy === true && normalizeOpenAICodexProxyUrl(draft.proxyUrl) === normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl);
			const validProxySelection = draft?.enableProxy !== true || acceptedProxyUnchanged || testedProxy;
			const validOverrides = (overrides, accepted) => isValidOpenAICodexContextWindowOverrides(overrides ?? {}) && Object.entries(overrides ?? {}).every(([id, budget]) => {
				if (!Number.isSafeInteger(budget) || budget <= 0) return false;
				if (accepted?.[id] === budget) return true;
				const model = modelCatalog?.find((entry) => entry.id === id);
				return model !== void 0 && isValidOpenAICodexContextBudget(budget, model.maxContextWindow);
			});
			const validContexts = draft !== void 0 && validOverrides(draft.contextWindowOverrides, snapshot.value?.contextWindowOverrides);
			const validMaxTokens = draft !== void 0 && validOverrides(draft.maxTokensOverrides, snapshot.value?.maxTokensOverrides);
			const valid = validModel && validTokens && validProxy && validImageModelHint && validContexts && validMaxTokens && validProxySelection && validResidency;
			const save = async () => {
				if (scope === void 0 || draft === void 0 || !snapshot.writable || !valid) return;
				const desired = {
					...draft,
					searchModel: draft.searchModel.trim()
				};
				setBusy(true);
				setFeedback("idle");
				try {
					const current = scope.getSnapshot();
					const original = baseline.current;
					if (current.status !== "ready" || !current.writable || current.value === void 0 || original === void 0 || current.revision === void 0) throw new Error("Host settings are unavailable");
					const changed = CONFIG_FIELDS.filter((field) => !sameField(field, original[field], desired[field]));
					const ops = changed.map((field) => {
						if (!sameField(field, original[field], current.value[field]) && !sameField(field, desired[field], current.value[field])) throw new Error(`Concurrent change to ${field}`);
						const value = field === "contextWindowOverrides" ? {
							...Object.fromEntries((modelCatalog ?? []).map((model) => [model.id, null])),
							...desired.contextWindowOverrides
						} : field === "maxTokensOverrides" ? {
							...Object.fromEntries((modelCatalog ?? []).map((model) => [model.id, null])),
							...desired.maxTokensOverrides
						} : (field === "newSessionSpeedMode" || field === "newSubagentSpeedMode" || field === "reasoningEffort") && desired[field] === void 0 ? null : desired[field];
						return value === void 0 ? {
							op: "unset",
							path: [field]
						} : {
							op: "set",
							path: [field],
							value
						};
					});
					if (ops.length > 0) await scope.mutate(ops, current.revision);
					const accepted = scope.getSnapshot().value;
					if (accepted === void 0 || changed.some((field) => !sameField(field, accepted[field], desired[field]))) throw new Error("Host refused the configuration change");
					setDraft(accepted);
					setDirty(false);
					setFeedback("saved");
					clearCurrentProxyCheck();
				} catch {
					setFeedback("error");
				} finally {
					setBusy(false);
				}
			};
			const loading = snapshot.status === "loading";
			const editable = snapshot.status === "ready" && snapshot.writable && !busy;
			const searchDisabled = !editable || draft?.enableSearch !== true;
			const savedProxyUrl = snapshot.value?.enableProxy === true ? normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl) : void 0;
			const draftProxyUrl = draft?.enableProxy === true ? normalizeOpenAICodexProxyUrl(draft.proxyUrl) : void 0;
			const proxyDraftChanged = snapshot.value !== void 0 && draft !== void 0 && (snapshot.value.enableProxy !== draft.enableProxy || normalizeOpenAICodexProxyUrl(snapshot.value.proxyUrl) !== normalizeOpenAICodexProxyUrl(draft.proxyUrl));
			const manualProxyIsCurrent = normalizedManualProxy !== void 0 && savedProxyUrl === normalizedManualProxy;
			const manualProxyIsSelected = !manualProxyIsCurrent && normalizedManualProxy !== void 0 && draftProxyUrl === normalizedManualProxy;
			const visibleModule = activeModule ?? localModule;
			const panelPrefix = panelIdPrefix ?? localPanelIdPrefix;
			const selectLocalModule = (module) => {
				setLocalModule(module);
				document.getElementById(`${panelPrefix}-${module}-tab`)?.focus();
			};
			const resolvedSectionStyle = flush ? flushSectionStyle : sectionStyle;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: {
					...resolvedSectionStyle,
					display: visibleModule === "account" && !dirty && !manualProxyEdited && (!management || feedback === "idle") ? "none" : resolvedSectionStyle.display
				},
				"aria-label": t("configurationHeading"),
				children: [
					loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						role: "status",
						children: t("settingsLoading")
					}) : null,
					snapshot.status === "unavailable" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("settingsUnavailable")
					}) : null,
					snapshot.status === "ready" && !snapshot.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("settingsReadOnly")
					}) : null,
					draft === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [activeModule === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: moduleTabsStyle,
						role: "tablist",
						"aria-label": t("settingsModules"),
						children: CONFIGURATION_MODULES.map((module, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							id: `${panelPrefix}-${module}-tab`,
							type: "button",
							role: "tab",
							"aria-label": t(`${module}Module`),
							"aria-selected": localModule === module,
							"aria-controls": `${panelPrefix}-${module}`,
							tabIndex: localModule === module ? 0 : -1,
							style: localModule === module ? activeModuleTabStyle : moduleTabStyle,
							onClick: () => {
								setLocalModule(module);
							},
							onKeyDown: (event) => {
								if (![
									"ArrowLeft",
									"ArrowRight",
									"Home",
									"End"
								].includes(event.key)) return;
								event.preventDefault();
								selectLocalModule(CONFIGURATION_MODULES[event.key === "Home" ? 0 : event.key === "End" ? CONFIGURATION_MODULES.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + CONFIGURATION_MODULES.length) % CONFIGURATION_MODULES.length]);
							},
							children: t(`${module}Module`)
						}, module))
					}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("fieldset", {
						style: fieldsetStyle,
						disabled: !editable,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: `${panelPrefix}-models`,
								role: "tabpanel",
								"aria-labelledby": `${panelPrefix}-models-tab`,
								hidden: visibleModule !== "models",
								style: {
									...fieldsetStyle,
									display: visibleModule === "models" ? fieldsetStyle.display : "none"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
										style: headingStyle,
										children: t(management ? "managementGlobalModels" : "modelCatalog")
									}), flush ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [management ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										children: t("managementModelScope")
									}) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: {
											...bodyStyle$1,
											marginTop: 4
										},
										children: t("modelCatalogIntro")
									})] })] }),
									modelCatalog === void 0 && !modelCatalogError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										role: "status",
										children: t("modelCatalogLoading")
									}) : null,
									modelCatalogError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$2,
										role: "alert",
										children: t("modelCatalogFailed")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: actionsStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: bodyStyle$1,
											role: "status",
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: badgeStyle,
													children: catalogStatus === void 0 ? t("catalogSourceBundled") : t(CATALOG_SOURCE_KEYS[catalogStatus.source])
												}),
												" ",
												catalogStatus?.updatedAt === void 0 ? t("catalogUpdatedNever") : t("catalogUpdatedAt", { time: new Date(catalogStatus.updatedAt).toLocaleString() }),
												catalogStatus !== void 0 && catalogStatus.unavailableModels.length > 0 ? ` · ${t("catalogUnavailableModels", { models: catalogStatus.unavailableModels.join(", ") })}` : ""
											]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											style: buttonStyle$2,
											disabled: catalogRefreshing,
											onClick: () => {
												refreshCatalog();
											},
											children: catalogRefreshing ? t("catalogRefreshing") : t("catalogRefresh")
										})]
									}),
									catalogRefreshFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$2,
										role: "status",
										children: t("catalogRefreshFailed")
									}) : null,
									modelCatalog === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										style: modelListStyle,
										role: "group",
										"aria-label": t("modelCatalog"),
										children: modelCatalog.map((model) => {
											const selected = draft.models === void 0 || draft.models.includes(model.id);
											const budget = draft.contextWindowOverrides?.[model.id];
											const invalidBudget = budget !== void 0 && !isValidOpenAICodexContextBudget(budget, model.maxContextWindow);
											const effectiveBudget = budget ?? model.contextWindow;
											const changeBudget = (value) => {
												update("contextWindowOverrides", {
													...draft.contextWindowOverrides,
													[model.id]: value
												});
											};
											const maxTokens = draft.maxTokensOverrides?.[model.id];
											const invalidMaxTokens = maxTokens !== void 0 && !isValidOpenAICodexContextBudget(maxTokens, model.maxContextWindow);
											const effectiveMaxTokens = maxTokens ?? model.maxTokens;
											const changeMaxTokens = (value) => {
												update("maxTokensOverrides", {
													...draft.maxTokensOverrides,
													[model.id]: value
												});
											};
											return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												role: "group",
												"aria-label": model.name,
												style: {
													minWidth: 0,
													padding: "10px 12px",
													marginBottom: 8,
													border: "1px solid var(--dsw-alias-border-l2)",
													borderRadius: 10,
													background: "var(--dsw-alias-bg-layer-1)"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													style: {
														display: "flex",
														alignItems: "center",
														justifyContent: "space-between",
														flexWrap: "wrap",
														gap: 8
													},
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														style: {
															...modelRowStyle,
															minWidth: 0,
															overflowWrap: "anywhere"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "checkbox",
															checked: selected,
															onChange: (event) => {
																const visible = new Set(draft.models ?? modelCatalog.map((entry) => entry.id));
																if (event.currentTarget.checked) visible.add(model.id);
																else visible.delete(model.id);
																update("models", modelCatalog.filter((entry) => visible.has(entry.id)).map((entry) => entry.id));
															}
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: model.name }), model.name === model.id ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															style: modelIdStyle,
															children: [
																" (",
																model.id,
																")"
															]
														})] })]
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															...buttonsStyle,
															alignItems: "center",
															flexWrap: "wrap"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
															style: bodyStyle$1,
															children: [
																t("modelContext"),
																": ",
																invalidBudget ? t("contextCustom") : `${effectiveBudget.toLocaleString()} tokens${budget === void 0 ? ` · ${t("contextDefault")}` : ""}`
															]
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: buttonStyle$2,
															"aria-expanded": expandedModels[model.id] === true,
															onClick: () => {
																setExpandedModels((current) => ({
																	...current,
																	[model.id]: !current[model.id]
																}));
															},
															children: expandedModels[model.id] === true ? t("contextHide") : t("contextAdjust")
														})]
													})]
												}), expandedModels[model.id] === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													role: "group",
													"aria-label": t("contextTokens"),
													style: {
														display: "flex",
														flexDirection: "column",
														gap: 8,
														marginTop: 12
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															style: {
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																gap: 12
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																style: labelStyle,
																children: t("contextTokens")
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "number",
																min: 1,
																step: 1,
																max: model.maxContextWindow,
																style: {
																	...controlStyle,
																	width: 112,
																	flexShrink: 0,
																	textAlign: "right",
																	fontVariantNumeric: "tabular-nums"
																},
																value: Number.isNaN(effectiveBudget) ? "" : effectiveBudget,
																"aria-invalid": invalidBudget,
																onChange: (event) => {
																	changeBudget(event.currentTarget.valueAsNumber);
																}
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																...bodyStyle$1,
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																flexWrap: "wrap",
																gap: 8
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
																style: {
																	display: "inline-flex",
																	alignItems: "center",
																	gap: 6
																},
																children: [
																	model.contextLimitSource === "codex-catalog" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
																		href: OPENAI_CODEX_CONTEXT_LIMIT_SOURCE,
																		target: "_blank",
																		rel: "noopener noreferrer",
																		title: t("contextLimitSource"),
																		style: {
																			color: "inherit",
																			textDecorationStyle: "dotted",
																			textUnderlineOffset: 3
																		},
																		children: t("contextMaximum")
																	}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		title: t("contextLimitFallback"),
																		children: t("contextMaximum")
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		style: {
																			padding: "1px 6px",
																			borderRadius: 4,
																			background: "var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1))",
																			fontVariantNumeric: "tabular-nums"
																		},
																		children: model.maxContextWindow
																	}),
																	/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "tokens" })
																]
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																title: `${t("contextDefault")}: ${model.contextWindow.toLocaleString()} tokens`,
																style: {
																	...bodyStyle$1,
																	padding: "2px 0",
																	border: 0,
																	background: "transparent",
																	font: "inherit",
																	fontSize: 12,
																	cursor: "pointer",
																	textDecoration: "underline",
																	textUnderlineOffset: 3
																},
																onClick: () => {
																	const overrides = { ...draft.contextWindowOverrides };
																	delete overrides[model.id];
																	update("contextWindowOverrides", overrides);
																},
																children: t("contextReset")
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															type: "range",
															min: 1,
															max: model.maxContextWindow,
															step: 1,
															"aria-label": t("contextSlider"),
															"aria-valuetext": invalidBudget ? t("contextInvalid") : `${effectiveBudget.toLocaleString()} tokens`,
															style: {
																width: "100%",
																height: 20,
																margin: 0,
																accentColor: "var(--dsw-alias-label-secondary)"
															},
															value: invalidBudget ? model.contextWindow : effectiveBudget,
															onChange: (event) => {
																changeBudget(event.currentTarget.valueAsNumber);
															}
														}),
														budget !== void 0 && budget > model.contextWindow && !invalidBudget ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: bodyStyle$1,
															role: "status",
															children: t("contextAboveDefault")
														}) : null,
														invalidBudget ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
															style: errorStyle$2,
															role: "alert",
															children: [
																t("contextInvalid"),
																" (1–",
																model.maxContextWindow.toLocaleString(),
																")"
															]
														}) : null
													]
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													role: "group",
													"aria-label": t("maxTokensLabel"),
													style: {
														display: "flex",
														flexDirection: "column",
														gap: 8,
														marginTop: 12
													},
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
															style: {
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																gap: 12
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																style: labelStyle,
																children: t("maxTokensLabel")
															}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
																type: "number",
																min: 1,
																step: 1,
																max: model.maxContextWindow,
																style: {
																	...controlStyle,
																	width: 112,
																	flexShrink: 0,
																	textAlign: "right",
																	fontVariantNumeric: "tabular-nums"
																},
																value: Number.isNaN(effectiveMaxTokens) ? "" : effectiveMaxTokens,
																"aria-invalid": invalidMaxTokens,
																onChange: (event) => {
																	changeMaxTokens(event.currentTarget.valueAsNumber);
																}
															})]
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
															style: {
																...bodyStyle$1,
																display: "flex",
																alignItems: "center",
																justifyContent: "space-between",
																flexWrap: "wrap",
																gap: 8
															},
															children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
																t("maxTokensDefault"),
																": ",
																/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	style: { fontVariantNumeric: "tabular-nums" },
																	children: model.maxTokens.toLocaleString()
																}),
																" tokens"
															] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																type: "button",
																title: `${t("maxTokensDefault")}: ${model.maxTokens.toLocaleString()} tokens`,
																style: {
																	...bodyStyle$1,
																	padding: "2px 0",
																	border: 0,
																	background: "transparent",
																	font: "inherit",
																	fontSize: 12,
																	cursor: "pointer",
																	textDecoration: "underline",
																	textUnderlineOffset: 3
																},
																onClick: () => {
																	const overrides = { ...draft.maxTokensOverrides };
																	delete overrides[model.id];
																	update("maxTokensOverrides", overrides);
																},
																children: t("contextReset")
															})]
														}),
														invalidMaxTokens ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
															style: errorStyle$2,
															role: "alert",
															children: [
																t("maxTokensInvalid"),
																" (1–",
																model.maxContextWindow.toLocaleString(),
																")"
															]
														}) : null
													]
												})] }) : null]
											}, model.id);
										})
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: formFieldStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("contextModeLabel")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												style: {
													...controlStyle,
													maxWidth: 360
												},
												value: draft.contextWindowMode,
												onChange: (event) => {
													update("contextWindowMode", event.currentTarget.value);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "default",
													children: t("contextModeDefault")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "extended",
													children: t("contextModeExtended")
												})]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("contextModeHelp")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										children: t("contextWarning")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										children: t("maxTokensHelp")
									}),
									!validContexts ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$2,
										role: "alert",
										children: t("contextInvalid")
									}) : null,
									!validMaxTokens ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: errorStyle$2,
										role: "alert",
										children: t("maxTokensInvalid")
									}) : null
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: `${panelPrefix}-network`,
								role: "tabpanel",
								"aria-labelledby": `${panelPrefix}-network-tab`,
								hidden: visibleModule !== "network",
								style: {
									...fieldsetStyle,
									display: visibleModule === "network" ? fieldsetStyle.display : "none"
								},
								children: [
									flush ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: { paddingTop: 4 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: headingStyle,
											children: t("networkHeading")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											style: {
												...bodyStyle$1,
												marginTop: 4
											},
											children: t("networkIntro")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: fieldsetStyle,
										role: "group",
										"aria-label": t("currentConnection"),
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
											style: headingStyle,
											children: t("currentConnection")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: connectionCardStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: { minWidth: 0 },
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: labelStyle,
														children: savedProxyUrl === void 0 ? t("directConnection") : t("proxyEnabled")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...modelIdStyle,
															marginTop: 3,
															overflowWrap: "anywhere"
														},
														children: savedProxyUrl ?? t("directConnectionDescription")
													}),
													currentProxyCheck.status === "checking" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...bodyStyle$1,
															marginTop: 5
														},
														role: "status",
														children: t("checkingCurrentConnection")
													}) : null,
													currentProxyCheck.status === "success" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...successStyle,
															marginTop: 5
														},
														role: "status",
														children: t("currentConnectionHealthy")
													}) : null,
													currentProxyCheck.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: {
															...errorStyle$2,
															marginTop: 5
														},
														role: "status",
														children: t("currentConnectionFailed")
													}) : null
												]
											}), savedProxyUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												style: {
													...buttonsStyle,
													flexWrap: "wrap"
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													style: proxyButtonStyle,
													disabled: currentProxyCheck.status === "checking",
													onClick: () => {
														checkCurrentProxy();
													},
													children: currentProxyCheck.status === "checking" ? t("checkingCurrentConnectionButton") : t("checkCurrentConnection")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													style: {
														...proxyButtonStyle,
														borderColor: "transparent",
														background: "transparent",
														color: "var(--dsw-alias-state-error-primary)"
													},
													onClick: () => {
														clearCurrentProxyCheck();
														update("enableProxy", false);
													},
													children: t("disableProxy")
												})]
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: fieldsetStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
												style: headingStyle,
												children: t("changeConnection")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
												style: proxyTabsStyle,
												role: "tablist",
												"aria-label": t("proxyConfigurationMethod"),
												children: ["auto", "manual"].map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
													type: "button",
													role: "tab",
													"aria-selected": proxyMode === mode,
													"aria-controls": `openai-codex-proxy-${mode}`,
													tabIndex: proxyMode === mode ? 0 : -1,
													style: proxyMode === mode ? activeProxyTabStyle : proxyTabStyle,
													onClick: () => {
														setProxyMode(mode);
													},
													onKeyDown: (event) => {
														if (![
															"ArrowLeft",
															"ArrowRight",
															"Home",
															"End"
														].includes(event.key)) return;
														event.preventDefault();
														const next = event.key === "ArrowRight" || event.key === "End" ? "manual" : "auto";
														setProxyMode(next);
														document.getElementById(`openai-codex-proxy-${next}-tab`)?.focus();
													},
													id: `openai-codex-proxy-${mode}-tab`,
													children: mode === "auto" ? t("automaticDetection") : t("manualEntry")
												}, mode))
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												id: "openai-codex-proxy-auto",
												role: "tabpanel",
												"aria-labelledby": "openai-codex-proxy-auto-tab",
												hidden: proxyMode !== "auto",
												style: {
													...fieldsetStyle,
													display: proxyMode === "auto" ? fieldsetStyle.display : "none"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: actionsStyle,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: bodyStyle$1,
															children: t("automaticDetectionHelp")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: proxyButtonStyle,
															onClick: () => {
																detectProxy();
															},
															disabled: proxyDetection.status === "detecting",
															children: proxyDetection.status === "detecting" ? t("detectingProxy") : t("scanLocalProxy")
														})]
													}),
													proxyDetection.status === "candidate" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: fieldsetStyle,
														role: "status",
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: bodyStyle$1,
															children: t("proxyCandidatesFound")
														}), proxyDetection.candidates.map((candidate) => {
															const normalized = normalizeOpenAICodexProxyUrl(candidate.proxyUrl);
															const current = normalized !== void 0 && savedProxyUrl === normalized;
															const selected = !current && normalized !== void 0 && draftProxyUrl === normalized;
															return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																style: candidateStyle,
																children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
																	style: {
																		display: "flex",
																		flexDirection: "column",
																		gap: 3,
																		minWidth: 0
																	},
																	children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
																		style: {
																			...modelIdStyle,
																			overflowWrap: "anywhere"
																		},
																		children: candidate.proxyUrl
																	}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																		style: successStyle,
																		children: t("proxyCandidateHealthy")
																	})]
																}), current || selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
																	style: statePillStyle,
																	children: current ? t("currentProxy") : t("selectedProxy")
																}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
																	type: "button",
																	style: primaryProxyButtonStyle,
																	onClick: () => {
																		useProxy(candidate.proxyUrl);
																	},
																	children: t("useThisProxy")
																})]
															}, candidate.proxyUrl);
														})]
													}) : null,
													proxyDetection.status === "failed" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
														style: candidateStyle,
														role: "alert",
														children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: errorStyle$2,
															children: t("proxyDetectionFailedTitle")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
															style: {
																...bodyStyle$1,
																marginTop: 3
															},
															children: t("proxyDetectionFailed")
														})] })
													}) : null
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
												id: "openai-codex-proxy-manual",
												role: "tabpanel",
												"aria-labelledby": "openai-codex-proxy-manual-tab",
												hidden: proxyMode !== "manual",
												style: {
													...fieldsetStyle,
													display: proxyMode === "manual" ? fieldsetStyle.display : "none"
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: bodyStyle$1,
														children: t("manualProxyHelp")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
														style: formFieldStyle,
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: labelStyle,
															children: t("proxyAddress")
														}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
															style: {
																...controlStyle,
																minHeight: 44
															},
															value: manualProxyUrl,
															"aria-invalid": manualProxyEntered && normalizedManualProxy === void 0,
															onChange: (event) => {
																manualProbeRequest.current += 1;
																setManualProbeBusy(false);
																setManualProbe(void 0);
																replaceManualProxyInput(event.currentTarget.value);
																setManualProxyEdited(true);
																setFeedback("idle");
															}
														})]
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
														style: {
															...buttonsStyle,
															flexWrap: "wrap"
														},
														children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: proxyButtonStyle,
															disabled: normalizedManualProxy === void 0 || manualProbeBusy,
															onClick: () => {
																testManualProxy();
															},
															children: manualProbeBusy ? t("testingProxy") : t("testProxy")
														}), manualProxyIsCurrent || manualProxyIsSelected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															style: statePillStyle,
															children: manualProxyIsCurrent ? t("currentProxy") : t("selectedProxy")
														}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
															type: "button",
															style: primaryProxyButtonStyle,
															disabled: !testedManualProxy,
															onClick: () => {
																useProxy(manualProxyUrl);
															},
															children: t("useThisProxy")
														})]
													}),
													manualProbe === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: manualProbe.reachable ? successStyle : errorStyle$2,
														role: "status",
														children: manualProbe.reachable ? t("proxyTestSucceeded", { status: manualProbe.status ?? manualProbe.classification }) : t("proxyTestFailed", { reason: manualProbe.classification })
													}),
													manualProxyEntered && normalizedManualProxy === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: errorStyle$2,
														role: "alert",
														children: t("invalidProxyUrl")
													}) : null,
													normalizedManualProxy !== void 0 && !manualProxyIsCurrent && !manualProxyIsSelected && !testedManualProxy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
														style: bodyStyle$1,
														children: t("proxyTestRequired")
													}) : null
												]
											})
										]
									}),
									proxyDraftChanged ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: pendingStyle,
										role: "status",
										children: draft.enableProxy ? t("pendingProxy", { proxyUrl: draft.proxyUrl }) : t("pendingDirect")
									}) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: fieldsetStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
												style: headingStyle,
												children: t("residencyHeading")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: formFieldStyle,
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: labelStyle,
														children: t("residencyLabel")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														style: {
															...controlStyle,
															width: 112,
															textAlign: "right",
															fontVariantNumeric: "tabular-nums"
														},
														type: "number",
														min: 0,
														max: 8,
														step: 1,
														value: draft.maxResidentWebSocketSessions,
														disabled: !editable,
														"aria-invalid": !validResidency,
														onChange: (event) => {
															update("maxResidentWebSocketSessions", event.currentTarget.valueAsNumber);
														}
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: bodyStyle$1,
														children: t("residencyHelp")
													})
												]
											}),
											validResidency ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												style: errorStyle$2,
												role: "alert",
												children: t("residencyInvalid", { max: 8 })
											})
										]
									})
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								id: `${panelPrefix}-capabilities`,
								role: "tabpanel",
								"aria-labelledby": `${panelPrefix}-capabilities-tab`,
								hidden: visibleModule !== "capabilities",
								style: {
									...fieldsetStyle,
									display: visibleModule === "capabilities" ? fieldsetStyle.display : "none"
								},
								children: [
									flush ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: { paddingTop: 4 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
											style: headingStyle,
											children: t("capabilitiesHeading")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											style: {
												...bodyStyle$1,
												marginTop: 4
											},
											children: t("capabilitiesIntro")
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: groupStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: toggleRowStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												type: "checkbox",
												checked: draft.enableSearch,
												onChange: (event) => {
													update("enableSearch", event.currentTarget.checked);
												}
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: toggleCopyStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("enableSearch")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: bodyStyle$1,
													children: t("enableSearchHelp")
												})]
											})]
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: formGridStyle,
											"aria-disabled": searchDisabled,
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													style: formFieldStyle,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: labelStyle,
														children: t("searchModel")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														style: controlStyle,
														value: draft.searchModel,
														disabled: searchDisabled,
														"aria-invalid": !validModel,
														onChange: (event) => {
															update("searchModel", event.currentTarget.value);
														}
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													style: formFieldStyle,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: labelStyle,
														children: t("searchMode")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
														style: controlStyle,
														value: draft.searchMode,
														disabled: searchDisabled,
														onChange: (event) => {
															update("searchMode", event.currentTarget.value);
														},
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "cached",
																children: t("modeCached")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "indexed",
																children: t("modeIndexed")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "live",
																children: t("modeLive")
															})
														]
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													style: formFieldStyle,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: labelStyle,
														children: t("searchContextSize")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
														style: controlStyle,
														value: draft.searchContextSize,
														disabled: searchDisabled,
														onChange: (event) => {
															update("searchContextSize", event.currentTarget.value);
														},
														children: [
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "low",
																children: t("contextLow")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "medium",
																children: t("contextMedium")
															}),
															/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
																value: "high",
																children: t("contextHigh")
															})
														]
													})]
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
													style: formFieldStyle,
													children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
														style: labelStyle,
														children: t("searchMaxOutputTokens")
													}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
														style: controlStyle,
														type: "number",
														min: 1,
														step: 1,
														value: draft.searchMaxOutputTokens,
														disabled: searchDisabled,
														"aria-invalid": !validTokens,
														onChange: (event) => {
															update("searchMaxOutputTokens", event.currentTarget.valueAsNumber);
														}
													})]
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableImageTool
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("enableImageTool")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("enableImageToolHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableImageGeneration,
											onChange: (event) => {
												update("enableImageGeneration", event.currentTarget.checked);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("enableImageGeneration")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("enableImageGenerationHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: formGridStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: toggleRowStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: draft.enableNewSessionFastMode,
													onChange: (e) => update("enableNewSessionFastMode", e.currentTarget.checked)
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("newSessionFastMode") })]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
												style: toggleRowStyle,
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
													type: "checkbox",
													checked: draft.enableNewSubagentFastMode,
													onChange: (e) => update("enableNewSubagentFastMode", e.currentTarget.checked)
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("newSubagentFastMode") })]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
												style: bodyStyle$1,
												children: t("fastDefaultsHelp")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: formGridStyle,
										children: [["newSessionSpeedMode", "newSubagentSpeedMode"].map((field) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: formFieldStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t(field)
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												style: controlStyle,
												value: draft[field] ?? "",
												onChange: (event) => {
													update(field, parseOpenAICodexSpeedDefault(event.currentTarget.value || void 0) ?? void 0);
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "",
														children: t("speedDefaultLegacy")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "standard",
														children: t("speedStandard")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "fast",
														children: t("speedFast")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "ultrafast",
														children: t("speedUltrafast")
													})
												]
											})]
										}, field)), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
											style: formFieldStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("reasoningDefault")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												style: controlStyle,
												value: draft.reasoningEffort ?? "",
												onChange: (event) => {
													update("reasoningEffort", parseOpenAICodexReasoningEffort(event.currentTarget.value || void 0) ?? void 0);
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: t("reasoningDefaultNone")
												}), OPENAI_CODEX_REASONING_EFFORTS.map((effort) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: effort,
													children: t({
														off: "reasoningOff",
														minimal: "reasoningMinimal",
														low: "reasoningLow",
														medium: "reasoningMedium",
														high: "reasoningHigh",
														xhigh: "reasoningXhigh",
														max: "reasoningMax"
													}[effort])
												}, effort))]
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										children: t("speedDefaultsHelp")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										children: t("reasoningDefaultsHelp")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										style: bodyStyle$1,
										children: t("ultrafastDisclosure")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: formFieldStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("imageModelHint")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
												style: controlStyle,
												value: draft.imageModelHint,
												placeholder: t("imageModelHintDefault"),
												"aria-invalid": !validImageModelHint,
												onChange: (event) => {
													update("imageModelHint", event.currentTarget.value);
												}
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("imageModelHintHelp")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.debugLogPayloadFields,
											onChange: (event) => {
												update("debugLogPayloadFields", event.currentTarget.checked);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("debugPayloadFields")
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("debugPayloadFieldsHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: toggleRowStyle,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: draft.enableAutoReview,
											onChange: (event) => {
												if (!event.currentTarget.checked) {
													update("enableAutoReview", false);
													return;
												}
												if (draft.autoReviewDisclosureAcknowledged) update("enableAutoReview", true);
												else setAutoReviewConfirmOpen(true);
											}
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
											style: toggleCopyStyle,
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													display: "flex",
													alignItems: "center",
													flexWrap: "wrap",
													gap: 6
												},
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: labelStyle,
													children: t("enableAutoReview")
												}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													style: badgeStyle,
													children: t("autoReviewOfficialBadge")
												})]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("enableAutoReviewHelp")
											})]
										})]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
										style: formFieldStyle,
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: labelStyle,
												children: t("autoReviewLocalPolicy")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
												style: controlStyle,
												"aria-label": t("autoReviewLocalPolicy"),
												value: draft.autoReviewLocalPolicy,
												onChange: (event) => {
													update("autoReviewLocalPolicy", parseAutoReviewLocalPolicy(event.currentTarget.value));
												},
												children: [
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "manual",
														children: t("autoReviewPolicyManual")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "workspace-read",
														children: t("autoReviewPolicyRead")
													}),
													/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
														value: "workspace-files",
														children: t("autoReviewPolicyFiles")
													})
												]
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												style: bodyStyle$1,
												children: t("autoReviewPolicyHelp")
											})
										]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
										style: { marginLeft: 26 },
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
											style: {
												...bodyStyle$1,
												cursor: "pointer",
												textDecoration: "underline",
												textUnderlineOffset: 3
											},
											children: t("autoReviewDetails")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
											style: {
												display: "flex",
												flexDirection: "column",
												gap: 6,
												marginTop: 6
											},
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													style: bodyStyle$1,
													children: t("autoReviewDisclosure")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
													style: bodyStyle$1,
													children: t("autoReviewFailureDisclosure")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
													href: "https://learn.chatgpt.com/docs/sandboxing/auto-review",
													target: "_blank",
													rel: "noopener noreferrer",
													style: {
														...bodyStyle$1,
														textDecoration: "underline",
														textUnderlineOffset: 3
													},
													children: t("autoReviewOfficialDocs")
												})
											]
										})]
									})
								]
							})
						]
					})] }),
					management && account && visibleModule === "models" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountModelCatalog, {
						account,
						t,
						active: true,
						refreshRevision: catalogRefreshRevision
					}) : null,
					autoReviewConfirmOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AutoReviewConsentDialog, {
						t,
						onCancel: () => {
							setAutoReviewConfirmOpen(false);
						},
						onConfirm: confirmAutoReview
					}) : null,
					visibleModule === "capabilities" && !validModel && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidSearchModel")
					}) : null,
					visibleModule === "capabilities" && !validTokens && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidSearchTokens")
					}) : null,
					visibleModule === "network" && !validProxy && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidProxyUrl")
					}) : null,
					visibleModule === "capabilities" && !validImageModelHint && draft !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$2,
						role: "alert",
						children: t("invalidImageModelHint")
					}) : null,
					visibleModule === "capabilities" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle$1,
						children: t("routingNote")
					}) : null,
					!management || dirty || manualProxyEdited || busy || feedback !== "idle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: management ? "cc-manage-actions" : void 0,
						style: {
							...actionsStyle,
							position: "sticky",
							bottom: 0,
							zIndex: 1,
							padding: "10px 0",
							background: "var(--dsw-alias-bg-layer-1)"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							"aria-live": "polite",
							children: [
								management && dirty && feedback === "idle" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: bodyStyle$1,
									children: t("managementUnsaved")
								}) : null,
								feedback === "saved" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: successStyle,
									children: t("settingsSaved")
								}) : null,
								feedback === "error" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: errorStyle$2,
									children: t("settingsSaveFailed")
								}) : null
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							style: buttonsStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...buttonStyle$2,
									minHeight: 44
								},
								disabled: !dirty && !manualProxyEdited || busy,
								onClick: discard,
								children: t("discard")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...primaryButtonStyle$1,
									minHeight: 44
								},
								disabled: !dirty || !valid || !snapshot.writable || busy,
								onClick: () => {
									save();
								},
								children: busy ? t("saving") : t("save")
							})]
						})]
					}) : null
				]
			});
		}
		//#endregion
		//#region src/client/OpenAICodexSettings.tsx
		/** Plugin-owned OpenAI Codex account controls used inside Plugin configuration. */
		const pageStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 18,
			maxWidth: 960
		};
		const bodyStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "22px",
			color: "var(--dsw-alias-label-secondary)"
		};
		({ ...pageStyle });
		const rowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12
		};
		const buttonStyle$1 = {
			boxSizing: "border-box",
			minHeight: 34,
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 18,
			background: "var(--dsw-alias-bg-layer-1)",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			fontSize: 14,
			cursor: "pointer"
		};
		const primaryButtonStyle = {
			...buttonStyle$1,
			borderColor: "var(--dsw-alias-button-primary-fill)",
			background: "var(--dsw-alias-button-primary-fill)",
			color: "var(--dsw-alias-label-primary-foreground)"
		};
		const errorStyle$1 = {
			...bodyStyle,
			color: "var(--dsw-alias-state-error-primary)"
		};
		const quotaListStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 18,
			paddingTop: 2
		};
		const quotaGroupStyle = {
			display: "flex",
			flexDirection: "column",
			gap: 10
		};
		const quotaTitleStyle = {
			margin: 0,
			fontSize: 14,
			lineHeight: "20px",
			fontWeight: 600,
			color: "var(--dsw-alias-label-primary)"
		};
		const quotaLabelStyle = {
			display: "flex",
			justifyContent: "space-between",
			gap: 12,
			fontSize: 13,
			lineHeight: "20px",
			color: "var(--dsw-alias-label-secondary)"
		};
		const progressTrackStyle = {
			height: 8,
			overflow: "hidden",
			borderRadius: 999,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.08))"
		};
		const commandStyle = {
			margin: 0,
			padding: "10px 12px",
			overflowX: "auto",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))",
			color: "var(--dsw-alias-label-primary)",
			fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
			fontSize: 13,
			lineHeight: "20px",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere"
		};
		const accountPanelStyle = {
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10
		};
		const accountRowStyle = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			flexWrap: "wrap",
			gap: 12,
			padding: "12px 14px",
			borderTop: "1px solid var(--dsw-alias-border-l2)"
		};
		const accountIdentityStyle = {
			minWidth: 0,
			flex: "1 1 180px",
			display: "flex",
			flexDirection: "column",
			gap: 2
		};
		const dangerButtonStyle = {
			...buttonStyle$1,
			color: "var(--dsw-alias-state-error-primary, #d92d20)"
		};
		({ ...buttonStyle$1 });
		function progressFillStyle(percent) {
			return {
				width: `${Math.max(0, Math.min(100, percent))}%`,
				height: "100%",
				borderRadius: "inherit",
				background: "var(--dsw-alias-brand-primary, #1677ff)"
			};
		}
		function windowLabel$1(seconds, t) {
			if (seconds === 300 * 60) return t("fiveHourLimit");
			if (seconds === 10080 * 60) return t("weeklyLimit");
			const hours = seconds / 3600;
			return Number.isInteger(hours) ? t("hourLimit", { count: hours }) : t("usageWindow");
		}
		/**
		* Format one percentage in the interface language.
		* @param locale - locale carried by the copy dictionary.
		* @param percent - percentage value.
		* @returns the localized number.
		*/
		function formatPercent(locale, percent) {
			return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(percent);
		}
		/**
		* Format one epoch-millisecond instant in the interface language.
		* @param locale - locale carried by the copy dictionary.
		* @param at - epoch milliseconds; an unrepresentable instant reports nothing.
		* @returns the localized date and time.
		*/
		function formatOpenAICodexTimestamp(locale, at) {
			if (at === void 0 || !Number.isFinite(at)) return void 0;
			const date = new Date(at);
			if (!Number.isFinite(date.getTime())) return void 0;
			return new Intl.DateTimeFormat(locale, {
				dateStyle: "medium",
				timeStyle: "short"
			}).format(date);
		}
		/**
		* Format a server-declared Unix-second reset in the user's local timezone and interface language.
		* @param locale - locale carried by the copy dictionary.
		* @param resetAt - server reset time in Unix seconds; absent or invalid reports nothing.
		* @returns the localized reset time.
		*/
		function formatOpenAICodexResetAt(locale, resetAt) {
			if (resetAt === void 0 || !Number.isSafeInteger(resetAt) || resetAt <= 0) return void 0;
			return formatOpenAICodexTimestamp(locale, resetAt * 1e3);
		}
		function QuotaBar({ label, percent, detail, t }) {
			const display = formatPercent(t("dateLocale"), percent);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: quotaGroupStyle,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: quotaLabelStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("percentRemaining", { percent: display }) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: progressTrackStyle,
						role: "progressbar",
						"aria-label": label,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": percent,
						"aria-valuetext": t("percentRemaining", { percent: display }),
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { style: progressFillStyle(percent) })
					}),
					detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: detail
					})
				]
			});
		}
		/** Quota rows shared by Models and Plugin settings. */
		function UsageLimits({ usage, quotaError, t, heading = true }) {
			const hasData = usage.rateLimits.length > 0 || usage.credits !== void 0 || usage.individualLimit !== void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: quotaListStyle,
				children: [
					heading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
						style: quotaTitleStyle,
						children: t("usageLimits")
					}) : null,
					usage.rateLimits.map((limit) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: quotaGroupStyle,
						children: limit.windows.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
							label: `${limit.name ?? limit.id} · ${windowLabel$1(window.windowSeconds, t)}`,
							percent: window.remainingPercent,
							detail: t("resetAt", { time: formatOpenAICodexResetAt(t("dateLocale"), window.resetAt) ?? t("resetUnavailable") }),
							t
						}, window.windowSeconds))
					}, limit.id)),
					usage.individualLimit === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaBar, {
						label: t("monthlyLimit"),
						percent: usage.individualLimit.remainingPercent,
						detail: t("exactRemaining", {
							remaining: usage.individualLimit.remaining,
							limit: usage.individualLimit.limit
						}),
						t
					}),
					usage.credits === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: quotaLabelStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("credits") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: usage.credits.unlimited ? t("unlimited") : usage.credits.balance === void 0 ? t("available") : usage.credits.balance })]
					}),
					!hasData && quotaError === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("quotaUnavailable")
					}) : null,
					quotaError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: errorStyle$1,
						children: t("quotaUnavailable")
					})
				]
			});
		}
		/** Account indicator colors shared by the compact row and expanded controls. */
		function dotStyle(status) {
			return {
				width: 9,
				height: 9,
				borderRadius: "50%",
				flex: "0 0 auto",
				background: status === "signed-in" ? "var(--dsw-alias-state-success-primary, #22a06b)" : status === "error" || status === "reauth-required" || status === "remote-web-origin-not-trusted" ? "var(--dsw-alias-state-error-primary, #d92d20)" : status === "signing-in" || status === "loading" ? "var(--dsw-alias-brand-primary, #1677ff)" : "var(--dsw-alias-label-dimmed, #9aa0a6)"
			};
		}
		/** Non-sensitive account state label for either settings presentation. */
		function accountStatusLabel(status, t) {
			return t({
				"signed-in": "signedIn",
				loading: "loadingAccount",
				"signing-in": "signingIn",
				"reauth-required": "reauthRequired",
				"remote-web-origin-not-trusted": "remoteOriginTitle",
				error: "requestFailed",
				"signed-out": "signedOut"
			}[status]);
		}
		/** Shared OAuth actions; Models uses shorter, task-oriented labels. */
		function AccountActions({ t, store, snapshot, compact = false }) {
			const { status, busy, operation } = snapshot;
			if (status.status === "loading" || status.status === "remote-web-origin-not-trusted") return null;
			if (operation.kind === "starting-authorization" || operation.kind === "waiting-authorization" || operation.kind === "cancelling-authorization" || status.status === "signing-in") return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: rowStyle,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: buttonStyle$1,
					disabled: busy,
					onClick: () => {
						store.signIn();
					},
					children: busy ? t("working") : t(compact ? "continueAuthorization" : "reopenAuthorization")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					style: buttonStyle$1,
					disabled: busy,
					onClick: () => {
						store.cancel();
					},
					children: t("cancelSignIn")
				})]
			});
			if (status.status === "signed-in") return null;
			const action = status.status === "error" || status.status === "reauth-required" ? t(compact ? "reauthorize" : "loginAgain") : t(compact ? "authorize" : "login");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: primaryButtonStyle,
				disabled: busy,
				onClick: () => {
					store.signIn();
				},
				children: busy ? t("working") : action
			});
		}
		/** Saved-account summary and explicit account-management actions. */
		function AccountManager({ t, store, snapshot, quotaExpanded, quotaControlsId, onToggleQuota, compact = false }) {
			const accountsPanelId = (0, react.useId)();
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [removeKey, setRemoveKey] = (0, react.useState)();
			const { accounts, busy, operation, status } = snapshot;
			const active = accounts.find((account) => account.active);
			const removeAccount = accounts.find((account) => account.accountKey === removeKey);
			const replacement = removeAccount?.active === true ? accounts.find((account) => account.accountKey !== removeAccount.accountKey) : void 0;
			const authorizing = operation.kind === "starting-authorization" || operation.kind === "waiting-authorization" || operation.kind === "cancelling-authorization" || status.status === "signing-in";
			(0, react.useEffect)(() => {
				if (removeKey !== void 0 && !accounts.some((account) => account.accountKey === removeKey)) setRemoveKey(void 0);
			}, [accounts, removeKey]);
			if (accounts.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountActions, {
				t,
				store,
				snapshot,
				compact
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					display: "flex",
					flexDirection: "column",
					gap: 12
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								alignItems: "center",
								minWidth: 0,
								gap: 10,
								flex: "1 1 220px"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									width: 38,
									height: 38,
									borderRadius: "50%",
									display: "grid",
									placeItems: "center",
									flex: "0 0 auto",
									background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06))",
									fontWeight: 600
								},
								children: (active?.displayName.trim()[0] ?? "C").toUpperCase()
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								style: accountIdentityStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
									style: {
										overflow: "hidden",
										textOverflow: "ellipsis"
									},
									children: active?.displayName ?? t("accountHeading")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: bodyStyle,
									children: active?.maskedEmail === void 0 ? t("defaultAccountDetail") : `${active.maskedEmail} · ${t("defaultAccountDetail")}`
								})]
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexWrap: "wrap",
								gap: 8,
								flex: "0 0 auto",
								marginLeft: "auto"
							},
							children: [
								status.status === "reauth-required" && !authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: primaryButtonStyle,
									disabled: busy,
									onClick: () => {
										store.signIn();
									},
									children: t("reauthorize")
								}) : null,
								authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountActions, {
									t,
									store,
									snapshot,
									compact: true
								}) : null,
								onToggleQuota === void 0 || status.status !== "signed-in" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle$1,
									"aria-expanded": quotaExpanded,
									"aria-controls": quotaControlsId,
									onClick: onToggleQuota,
									children: t(quotaExpanded === true ? "hideQuota" : "viewQuota")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle$1,
									"aria-expanded": expanded,
									"aria-controls": accountsPanelId,
									onClick: () => {
										setExpanded(!expanded);
									},
									children: t(expanded ? "hideAccounts" : "manageAccounts")
								})
							]
						})]
					}),
					authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("addingAccountKeepsCurrent")
					}) : null,
					expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						id: accountsPanelId,
						style: accountPanelStyle,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...rowStyle,
									padding: "10px 14px",
									background: "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.04))"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("strong", { children: [
									t("savedAccounts"),
									" · ",
									accounts.length
								] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: primaryButtonStyle,
									disabled: busy || authorizing,
									onClick: () => {
										store.signIn();
									},
									children: operation.kind === "starting-authorization" ? t("working") : t("addAccount")
								})]
							}),
							accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: accountRowStyle,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: accountIdentityStyle,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: account.displayName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										style: bodyStyle,
										children: account.maskedEmail === void 0 ? t("savedAccountDetail") : `${account.maskedEmail} · ${t("savedAccountDetail")}`
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										display: "flex",
										flexWrap: "wrap",
										gap: 8,
										flex: "0 0 auto",
										marginLeft: "auto"
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: buttonStyle$1,
										disabled: busy || account.active,
										onClick: () => {
											store.activate(account.accountKey);
										},
										children: operation.kind === "activating" && operation.accountKey === account.accountKey ? t("working") : t(account.active ? "usingAccount" : "useAccount")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										style: dangerButtonStyle,
										disabled: busy,
										onClick: () => {
											setRemoveKey(account.accountKey);
										},
										children: t("removeAccount")
									})]
								})]
							}, account.accountKey)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...rowStyle,
									padding: "10px 14px",
									borderTop: "1px solid var(--dsw-alias-border-l2)"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: bodyStyle,
									children: t("activeAccountHelp")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: dangerButtonStyle,
									disabled: busy,
									onClick: () => {
										store.signOut();
									},
									children: operation.kind === "signing-out" ? t("working") : t("signOutAll")
								})]
							})
						]
					}) : null,
					removeAccount === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						role: "region",
						"aria-live": "polite",
						"aria-label": t("removeAccountTitle", { name: removeAccount.displayName }),
						style: {
							padding: 14,
							border: "1px solid var(--dsw-alias-state-error-primary, #d92d20)",
							borderRadius: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("removeAccountTitle", { name: removeAccount.displayName }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								style: {
									...bodyStyle,
									marginTop: 5
								},
								children: accounts.length === 1 ? t("removeLastAccountCopy") : replacement === void 0 ? t("removeAccountCopy") : t("removeActiveAccountCopy", { name: replacement.displayName })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									...rowStyle,
									justifyContent: "flex-end"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: buttonStyle$1,
									onClick: () => {
										setRemoveKey(void 0);
									},
									children: t("cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: dangerButtonStyle,
									disabled: busy,
									onClick: () => {
										store.remove(removeAccount.accountKey, replacement?.accountKey);
									},
									children: operation.kind === "removing" ? t("working") : t("confirmRemove")
								})]
							})
						]
					})
				]
			});
		}
		/** Mounted only for an idle pending authorization; disclosure and secrets stay local. */
		function ManualCallbackForm({ t, store }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [callbackUrl, setCallbackUrl] = (0, react.useState)("");
			const id = (0, react.useId)();
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: buttonStyle$1,
				"aria-expanded": expanded,
				"aria-controls": id,
				onClick: () => {
					setCallbackUrl("");
					setExpanded(!expanded);
				},
				children: t("manualCallbackToggle")
			}), expanded ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				id,
				autoComplete: "off",
				style: {
					display: "flex",
					flexDirection: "column",
					flexBasis: "100%",
					minWidth: 0,
					gap: 10
				},
				onSubmit: (event) => {
					event.preventDefault();
					if (!callbackUrl.trim() || store.getSnapshot().busy) return;
					store.submitCallback(callbackUrl);
					setCallbackUrl("");
					setExpanded(false);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						id: `${id}-help`,
						style: bodyStyle,
						children: t("manualCallbackHelp")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: bodyStyle,
						children: t("manualCallbackPrivacy")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						htmlFor: `${id}-input`,
						style: bodyStyle,
						children: t("manualCallbackLabel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
						id: `${id}-input`,
						type: "text",
						value: callbackUrl,
						autoComplete: "off",
						spellCheck: false,
						autoCapitalize: "none",
						"aria-describedby": `${id}-help`,
						style: {
							...buttonStyle$1,
							width: "100%",
							borderRadius: 8,
							cursor: "text"
						},
						onChange: (event) => {
							setCallbackUrl(event.target.value);
						}
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: rowStyle,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							style: primaryButtonStyle,
							disabled: !callbackUrl.trim(),
							children: t("manualCallbackSubmit")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle$1,
							onClick: () => {
								setCallbackUrl("");
								setExpanded(false);
							},
							children: t("cancel")
						})]
					})
				]
			}) : null] });
		}
		/** Recovery links, errors and trusted-origin guidance in either account entry. */
		function AccountFeedback({ t, snapshot, store }) {
			const { status, loginUrl, operationError } = snapshot;
			const [copied, setCopied] = (0, react.useState)(false);
			const [copyFailed, setCopyFailed] = (0, react.useState)(false);
			const trustedOriginCommand = `dsh plugin --profile web exec dsh-codex-connect trust-origin ${window.location.origin}`;
			const copyTrustedOriginCommand = async () => {
				setCopyFailed(false);
				try {
					if (navigator.clipboard?.writeText === void 0) throw new Error("clipboard unavailable");
					await navigator.clipboard.writeText(trustedOriginCommand);
					setCopied(true);
				} catch {
					setCopyFailed(true);
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				loginUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: bodyStyle,
					children: t("authorizationHelp")
				}),
				loginUrl !== void 0 || snapshot.operation.kind === "waiting-authorization" && !snapshot.busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexWrap: "wrap",
						alignItems: "center",
						gap: 12
					},
					children: [loginUrl === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("a", {
						href: loginUrl,
						target: "_blank",
						rel: "noopener noreferrer",
						style: {
							...primaryButtonStyle,
							display: "inline-flex",
							alignItems: "center",
							textDecoration: "none"
						},
						children: t("openLoginInBrowser")
					}), snapshot.operation.kind === "waiting-authorization" && !snapshot.busy ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ManualCallbackForm, {
						t,
						store
					}, snapshot.authorizationRevision ?? 0) : null]
				}) : null,
				snapshot.callbackFeedback === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					role: "status",
					style: snapshot.callbackFeedback === "callbackAccepted" || snapshot.callbackFeedback === "callbackUnconfirmed" ? bodyStyle : errorStyle$1,
					children: t(snapshot.callbackFeedback)
				}),
				status.status === "error" || status.status === "reauth-required" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: errorStyle$1,
					children: status.message
				}) : null,
				operationError === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					style: errorStyle$1,
					children: operationError
				}),
				status.status === "remote-web-origin-not-trusted" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: errorStyle$1,
							children: t("remoteOriginDescription")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: bodyStyle,
							children: t("remoteOriginCommandHelp")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("code", {
							style: commandStyle,
							children: trustedOriginCommand
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: rowStyle,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: buttonStyle$1,
								onClick: () => {
									copyTrustedOriginCommand();
								},
								children: copied ? t("remoteOriginCopied") : t("remoteOriginCopy")
							}), copyFailed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: errorStyle$1,
								children: t("remoteOriginCopyFailed")
							}) : null]
						})
					]
				}) : null
			] });
		}
		//#endregion
		//#region src/client/usage-format.ts
		/** `fmt`: the k/M/B suffix style shared by bars/details/stats; `fmtTime`: local HH:MM:SS. */
		function fmt(n) {
			if (n === void 0 || n === null || isNaN(n)) return "—";
			const sign = n < 0 ? "-" : "";
			const a = Math.abs(n);
			if (a >= 1e9) return sign + (a / 1e9).toFixed(1) + "B";
			if (a >= 1e6) return sign + (a / 1e6).toFixed(1) + "M";
			if (a >= 1e3) return sign + (a / 1e3).toFixed(1) + "k";
			return sign + String(Math.round(a));
		}
		/**
		* Whole-session durations for the timing card, locale-free compact units: raw
		* ms under a second, one-decimal seconds under a minute, then m/s and h/m.
		* Non-finite or non-positive input shows the dash (callers render their empty
		* state anyway).
		*/
		function fmtDuration(ms) {
			if (!Number.isFinite(ms) || ms <= 0) return "—";
			if (ms < 1e3) return `${Math.round(ms)}ms`;
			if (ms < 6e4) return `${(ms / 1e3).toFixed(1)}s`;
			const totalSec = Math.floor(ms / 1e3);
			const m = Math.floor(totalSec / 60);
			const s = totalSec % 60;
			if (ms < 36e5) return `${m}m${s}s`;
			return `${Math.floor(m / 60)}h${m % 60}m`;
		}
		//#endregion
		//#region src/client/usage-ledger.ts
		/** The projection key this plugin registers; it never reads another plugin's values. */
		const USAGE_KEY = "codexConnectUsage";
		/** Stable fallback for hosts that have not supplied the local usage capability. */
		const unavailableUsage = Object.freeze({
			state: "unavailable",
			data: null
		});
		/** @returns A no-op disposer for an absent local usage capability. */
		const subscribeUnavailableUsage = () => () => {};
		/** @returns The stable unavailable snapshot. */
		const unavailableUsageSnapshot = () => unavailableUsage;
		/** @param value - JSON-like input. @returns Its fields, or null for non-records. */
		function asRecord(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
		}
		/** @param value - Counter from the projection. @returns Whether it is a nonnegative safe integer. */
		function isCount(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
		}
		/**
		* Merge the per-Session `codexConnectUsage` values without lifetime or inherited-prefix fallback.
		* A row this reader cannot represent is skipped; it never fails the remaining catalog.
		* @param snapshot - Root Session-list snapshot; duplicate ids and blank rows are excluded.
		* @returns Recorded daily totals and the producer calendar; unavailable data is never invented.
		*/
		function usageLedgerOf(snapshot) {
			const days = {};
			let timeZone;
			const state = asRecord(snapshot);
			if (state === null || !Array.isArray(state.ids)) return { days };
			const byId = asRecord(state.byId);
			const seen = /* @__PURE__ */ new Set();
			for (const id of state.ids) {
				if (typeof id !== "string" || seen.has(id)) continue;
				seen.add(id);
				try {
					const row = asRecord(byId?.[id]);
					if (row === null || row.blank === true) continue;
					const usage = asRecord(asRecord(row.projectionValues)?.[USAGE_KEY]);
					const entries = asRecord(usage?.days);
					if (entries === null || typeof usage?.timeZone !== "string") continue;
					new Intl.DateTimeFormat("en-CA", { timeZone: usage.timeZone }).format(0);
					timeZone ??= usage.timeZone;
					for (const [key, value] of Object.entries(entries)) {
						if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(key)) continue;
						const entry = asRecord(value);
						if (entry === null || !isCount(entry.tokens) || !isCount(entry.requests)) continue;
						if (entry.tokens === 0 && entry.requests === 0) continue;
						const before = days[key];
						days[key] = {
							tokens: (before?.tokens ?? 0) + entry.tokens,
							requests: (before?.requests ?? 0) + entry.requests,
							sessions: (before?.sessions ?? 0) + 1
						};
					}
				} catch (_error) {
					continue;
				}
			}
			return {
				days,
				...timeZone === void 0 ? {} : { timeZone }
			};
		}
		/** @param timeZone - Producer calendar. @param now - Epoch milliseconds. @returns Today's ledger key. */
		function usageToday(timeZone, now = Date.now()) {
			return new Intl.DateTimeFormat("en-CA", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				...timeZone ? { timeZone } : {}
			}).format(now);
		}
		//#endregion
		//#region src/client/balance.ts
		const BALANCE_ROUTE = "/api/dsh-codex-connect/balance";
		/** How long a settled answer (including a `null`) serves identical reads. */
		const TTL_MS = 6e4;
		/** One platform amount ('110.00', or an already-numeric producer variant), or null. */
		function amountOf(value) {
			const n = typeof value === "string" ? Number(value) : value;
			return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
		}
		/**
		* Narrow the delivered payload to a render-safe value (the same boundary
		* rigor as `timelineOf`): each entry's currency and amounts re-proved, an
		* entry failing the shape drops whole, and a payload with no valid entry is
		* no balance — the caller renders nothing rather than half a figure.
		*/
		function platformBalanceOf(value) {
			const data = asRecord(value);
			if (data === null) return null;
			const infos = Array.isArray(data.balances) ? data.balances : [];
			const balances = [];
			for (const info of infos) try {
				const entry = asRecord(info);
				if (entry === null) continue;
				const currency = entry.currency;
				const total = amountOf(entry.total);
				const granted = amountOf(entry.granted);
				const toppedUp = amountOf(entry.toppedUp);
				if (typeof currency !== "string" || currency === "" || total === null || granted === null || toppedUp === null) continue;
				balances.push({
					currency,
					total,
					granted,
					toppedUp
				});
			} catch (_error) {
				continue;
			}
			return balances.length > 0 ? {
				isAvailable: data.isAvailable === true,
				balances
			} : null;
		}
		/**
		* The entry matching the display currency (zh → CNY, en → USD), falling back
		* to the account's first entry when the platform reports none in it — a
		* number in the account's own currency beats no number.
		*/
		function balanceEntryOf(balance, currency) {
			if (balance === null || balance === void 0 || balance.balances.length === 0) return null;
			const want = currency === "cny" ? "CNY" : "USD";
			return balance.balances.find((entry) => entry.currency === want) ?? balance.balances[0] ?? null;
		}
		let cached = null;
		/**
		* The capsule's read: one route POST, narrowed through
		* `platformBalanceOf`, deduplicated in flight, TTL-cached. Never rejects.
		*/
		function fetchPlatformBalance(force = false) {
			if (!force && cached !== null && Date.now() - cached.at < TTL_MS) return cached.promise;
			const at = Date.now();
			const promise = (async () => {
				try {
					const { response, value } = await requestJson(BALANCE_ROUTE, {
						method: "POST",
						headers: { "content-type": "application/json" }
					});
					if (!response.ok) return null;
					const r = asRecord(value);
					if (r === null || r.ok !== true || r.value === null || r.value === void 0) return null;
					return platformBalanceOf(r.value);
				} catch (_error) {
					return null;
				}
			})();
			cached = {
				at,
				promise
			};
			return promise;
		}
		/** How often a mounted surface re-reads a figure its own mount already served. */
		const PLATFORM_BALANCE_REFRESH_MS = 6e4;
		/** The last live figure any read delivered; `null` until one lands. */
		let latest = null;
		/** Mounted surfaces awaiting a publish. */
		const listeners = /* @__PURE__ */ new Set();
		/** The one refresh interval; it runs while at least one surface is subscribed. */
		let timer = null;
		/**
		* Publish one settled read. A read that reports nothing keeps the last real
		* figure instead of blanking a pill between refreshes.
		* @param value - the settled read, or `null` when this attempt carried no figure.
		*/
		function publish(value) {
			if (value === null) return;
			latest = value;
			for (const listener of [...listeners]) listener();
		}
		/**
		* The mounted surfaces' figure: the last live read, or `null` before one lands.
		* @returns the published balance.
		*/
		function platformBalanceSnapshot() {
			return latest;
		}
		/**
		* Keep one mounted surface's figure live. The first subscriber primes a shared
		* read and starts the refresh interval; every later read is forced past the TTL
		* so a surface that stays mounted does not keep serving its mount's answer. The
		* last unsubscribe stops the interval.
		* @param listener - called after every publish; `useSyncExternalStore` supplies its own.
		* @returns the unsubscribe callback.
		*/
		function subscribePlatformBalance(listener) {
			listeners.add(listener);
			if (listeners.size === 1) {
				fetchPlatformBalance().then(publish);
				timer = setInterval(() => {
					fetchPlatformBalance(true).then(publish);
				}, PLATFORM_BALANCE_REFRESH_MS);
			}
			return () => {
				listeners.delete(listener);
				if (listeners.size > 0 || timer === null) return;
				clearInterval(timer);
				timer = null;
			};
		}
		//#endregion
		//#region src/client/UsageQuotaGrid.tsx
		/** DeepSeek balance, daily tokens and every Codex account quota, with cell drill-downs. */
		/** Preserve the two shortest distinct rolling windows in each compact account row. */
		const WINDOWS_PER_ACCOUNT = 2;
		/** Currency symbol for the balance cells the platform serves. */
		function symbolOf(currency) {
			if (currency === "CNY") return String.fromCharCode(165);
			if (currency === "USD") return String.fromCharCode(36);
			return currency + " ";
		}
		/** One rolling window length as a compact label (5h, 7d). */
		function windowLabel(seconds) {
			if (seconds % 86400 === 0) return String(seconds / 86400) + "d";
			if (seconds % 3600 === 0) return String(seconds / 3600) + "h";
			return String(Math.round(seconds / 60)) + "m";
		}
		/**
		* The windows one account shows, shortest first. The server reports one window
		* per bucket, so the same LENGTH can arrive from several buckets (the main Codex
		* bucket plus a model-specific one): keep the most constrained value per length,
		* so a row never hides the scarcer of two five-hour windows.
		* @param account - one signed-in account as the service publishes it.
		* @returns up to two windows, shortest first.
		*/
		function windowsOf(account) {
			const byLength = /* @__PURE__ */ new Map();
			for (const win of account.windows) {
				const current = byLength.get(win.windowSeconds);
				if (current === void 0 || win.remainingPercent < current.remainingPercent) byLength.set(win.windowSeconds, win);
			}
			return [...byLength.values()].sort((left, right) => left.windowSeconds - right.windowSeconds).slice(0, WINDOWS_PER_ACCOUNT);
		}
		/** The account rows to render: the service's list, or the active account alone. */
		function accountsOf(quota) {
			if (quota === null) return [];
			const listed = quota.accounts;
			if (listed !== void 0 && listed.length > 0) return [...listed];
			if (quota.windows.length === 0) return [];
			return [{
				accountKey: "active",
				label: "",
				active: true,
				windows: quota.windows,
				...quota.credits === void 0 ? {} : { credits: quota.credits }
			}];
		}
		/**
		* Build the grid occupant.
		* @param service - the shared account quota service.
		* @param kit - the slot kit (locale + duration formatting).
		* @returns the component both the sidebar widget and the panel render.
		*/
		function makeQuotaGrid(service, kit) {
			const { t, fmtDuration } = kit;
			/** Remaining time until one window resets, or null when unknown. */
			function resetInOf(win) {
				if (win.resetAt === void 0) return null;
				const left = win.resetAt * 1e3 - Date.now();
				return left > 0 ? fmtDuration(left) : null;
			}
			/** The exact reset instant in the reader's own locale and time zone. */
			function resetAtOf(win) {
				if (win.resetAt === void 0) return null;
				const at = /* @__PURE__ */ new Date(win.resetAt * 1e3);
				return Number.isNaN(at.getTime()) ? null : at.toLocaleString(kit.locale);
			}
			return function QuotaGrid(props) {
				const balance = (0, react.useSyncExternalStore)(subscribePlatformBalance, platformBalanceSnapshot);
				const [detail, setDetail] = (0, react.useState)(null);
				const quota = (0, react.useSyncExternalStore)(service.subscribe, service.snapshot);
				const entry = balanceEntryOf(balance, props.currency ?? "cny");
				const today = Object.hasOwn(props.days, props.today) ? props.days[props.today] : void 0;
				const accounts = accountsOf(quota);
				const named = accounts.length > 1;
				const toggle = (next) => {
					setDetail((current) => current !== null && current.kind === next.kind && current.key === next.key ? null : next);
				};
				const cell = (key, name, value, sub, target, chip) => {
					const open = detail !== null && detail.kind === target.kind && detail.key === target.key;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "cc-usage-quota-cell" + (open ? " cc-usage-quota-on" : ""),
						"aria-expanded": open,
						onClick: (event) => {
							event.stopPropagation();
							toggle(target);
						},
						onKeyDown: (event) => {
							event.stopPropagation();
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "cc-usage-quota-label",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-usage-quota-name",
									children: name
								}), chip ?? null]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-quota-value",
								children: value
							}),
							sub !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-quota-sub",
								children: sub
							})
						]
					}, key);
				};
				const summary = [];
				if (entry !== null) summary.push(cell("balance", t("ov.quota.balance"), symbolOf(entry.currency) + entry.total.toFixed(2), t("ov.quota.balanceSub", {
					granted: entry.granted.toFixed(2),
					topped: entry.toppedUp.toFixed(2)
				}), { kind: "balance" }));
				if (today !== void 0) summary.push(cell("today", t("ov.quota.today"), fmt(today.tokens), t("ov.kpi.tokens"), { kind: "today" }));
				const cells = [...summary];
				const rankOf = (accountKey) => {
					if (!named) return null;
					const rank = accounts.findIndex((candidate) => candidate.accountKey === accountKey) + 1;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-usage-quota-rank",
						children: "#" + String(rank)
					});
				};
				for (const account of accounts) {
					const windows = windowsOf(account);
					for (const win of windows) {
						const reset = resetInOf(win);
						const key = `${account.accountKey}:${win.windowSeconds}`;
						cells.push(cell(key, t("ov.quota.codexWindow", { w: windowLabel(win.windowSeconds) }), t("ov.quota.remaining", { p: Math.round(win.remainingPercent) }), reset === null ? null : t("ov.quota.resetIn", { d: reset }), {
							kind: "window",
							key
						}, rankOf(account.accountKey)));
					}
				}
				if (cells.length === 0) return null;
				const rows = [];
				let detailTitle = "";
				let action = null;
				if (detail !== null && detail.kind === "balance" && entry !== null) {
					detailTitle = t("ov.quota.balance");
					rows.push([t("ov.quota.detail.total"), symbolOf(entry.currency) + entry.total.toFixed(2)]);
					rows.push([t("ov.quota.detail.granted"), symbolOf(entry.currency) + entry.granted.toFixed(2)]);
					rows.push([t("ov.quota.detail.topped"), symbolOf(entry.currency) + entry.toppedUp.toFixed(2)]);
					rows.push([t("ov.quota.detail.currency"), entry.currency]);
				}
				if (detail !== null && detail.kind === "today" && today !== void 0) {
					detailTitle = t("ov.quota.today");
					rows.push([t("ov.kpi.tokens"), fmt(today.tokens)]);
					rows.push([t("ov.quota.detail.sessions"), String(today.sessions)]);
					rows.push([t("ov.quota.detail.requests"), fmt(today.requests)]);
					if (props.onSelectDay !== void 0) action = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "cc-usage-quota-detail-action",
						onClick: (event) => {
							event.stopPropagation();
							props.onSelectDay?.(props.today);
						},
						children: t("ov.quota.detail.filterDay")
					});
				}
				if (detail !== null && detail.kind === "window") {
					const [accountKey, seconds] = String(detail.key).split(":");
					const account = accounts.find((candidate) => candidate.accountKey === accountKey);
					const win = account === void 0 ? void 0 : windowsOf(account).find((candidate) => String(candidate.windowSeconds) === seconds);
					if (account !== void 0 && win !== void 0) {
						detailTitle = t("ov.quota.codexWindow", { w: windowLabel(win.windowSeconds) });
						if (named) rows.push([t("ov.quota.detail.account"), account.label === "" ? t("ov.quota.accountCurrent") : account.label]);
						rows.push([t("ov.quota.detail.length"), fmtDuration(win.windowSeconds * 1e3)]);
						rows.push([t("ov.quota.detail.remaining"), t("ov.quota.remaining", { p: Math.round(win.remainingPercent) })]);
						const at = resetAtOf(win);
						if (at !== null) rows.push([t("ov.quota.detail.resetAt"), at]);
						const refreshed = account.fetchedAt;
						if (refreshed !== void 0) rows.push([t("ov.quota.detail.refreshed"), fmtDuration(Date.now() - refreshed) + " " + t("ov.quota.detail.ago")]);
					}
				}
				if (detail !== null && detail.kind === "account") {
					const account = accounts.find((candidate) => candidate.accountKey === detail.key);
					if (account !== void 0) {
						detailTitle = account.label === "" ? t("ov.quota.accountCurrent") : account.label;
						for (const win of windowsOf(account)) {
							const reset = resetInOf(win);
							rows.push([t("ov.quota.codexWindow", { w: windowLabel(win.windowSeconds) }), t("ov.quota.remaining", { p: Math.round(win.remainingPercent) }) + (reset === null ? "" : " · " + t("ov.quota.resetIn", { d: reset }))]);
						}
						const refreshed = account.fetchedAt;
						if (refreshed !== void 0) rows.push([t("ov.quota.detail.refreshed"), fmtDuration(Date.now() - refreshed) + " " + t("ov.quota.detail.ago")]);
					}
				}
				const legend = !named ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cc-usage-quota-legend",
					role: "group",
					"aria-label": t("ov.quota.legend"),
					children: accounts.map((account, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "cc-usage-quota-legend-item",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-usage-quota-rank",
							children: "#" + String(index + 1)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-usage-quota-legend-label",
							children: account.label === "" ? t("ov.quota.accountCurrent") : account.label
						})]
					}, account.accountKey))
				});
				const panel = rows.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usage-quota-detail",
					role: "group",
					"aria-label": detailTitle,
					onClick: (event) => {
						event.stopPropagation();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cc-usage-quota-detail-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-quota-detail-title",
								children: detailTitle
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cc-usage-quota-detail-close",
								"aria-label": t("cmd.close"),
								onClick: (event) => {
									event.stopPropagation();
									setDetail(null);
								},
								children: String.fromCharCode(215)
							})]
						}),
						rows.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cc-usage-quota-detail-row",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-quota-detail-label",
								children: label
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-quota-detail-value",
								children: value
							})]
						}, label)),
						action
					]
				});
				if (props.compact === true) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usage-quota cc-usage-quota-compact",
					children: [
						summary,
						accounts.map((account) => {
							const accountOpen = detail !== null && detail.kind === "account" && detail.key === account.accountKey;
							const windows = windowsOf(account);
							const reset = windows.map((win) => resetInOf(win)).filter((value) => value !== null).join(" · ");
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "cc-usage-quota-account" + (accountOpen ? " cc-usage-quota-on" : ""),
								"aria-expanded": accountOpen,
								title: reset,
								onClick: (event) => {
									event.stopPropagation();
									setDetail(accountOpen ? null : {
										kind: "account",
										key: account.accountKey
									});
								},
								onKeyDown: (event) => {
									event.stopPropagation();
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "cc-usage-quota-account-head",
									children: [named ? rankOf(account.accountKey) : null, /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cc-usage-quota-account-name",
										children: account.label === "" ? t("ov.quota.accountCurrent") : account.label
									})]
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-usage-quota-account-windows",
									children: windows.map((win) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cc-usage-quota-window",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cc-usage-quota-window-label",
											children: windowLabel(win.windowSeconds)
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cc-usage-quota-window-value",
											children: String(Math.round(win.remainingPercent)) + "%"
										})]
									}, account.accountKey + ":" + String(win.windowSeconds)))
								})]
							}, account.accountKey);
						}),
						panel
					]
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usage-quota" + (cells.length >= 6 ? " cc-usage-quota-multi" : ""),
					children: [
						cells,
						legend,
						panel
					]
				});
			};
		}
		//#endregion
		//#region src/client/CodexAccountPanel.tsx
		/** Account tab: saved ChatGPT accounts with their Codex limits and immediate actions. */
		/**
		* Render every saved account as one row carrying its own Codex limits, so the
		* account name, active badge, and window progress appear exactly once.
		* @param props - localized copy, account store, its snapshot, and the quota service.
		* @returns the account management panel.
		*/
		function CodexAccountPanel({ t, store, snapshot, quota }) {
			const [removeKey, setRemoveKey] = (0, react.useState)();
			const figures = accountsOf((0, react.useSyncExternalStore)((0, react.useCallback)((listener) => quota?.subscribe(listener) ?? (() => void 0), [quota]), (0, react.useCallback)(() => quota?.snapshot() ?? null, [quota])));
			const { accounts, busy, operation, status } = snapshot;
			const removeAccount = accounts.find((account) => account.accountKey === removeKey);
			const replacement = removeAccount?.active === true ? accounts.find((account) => account.accountKey !== removeAccount.accountKey) : void 0;
			const authorizing = operation.kind === "starting-authorization" || operation.kind === "waiting-authorization" || operation.kind === "cancelling-authorization" || status.status === "signing-in";
			const resetIn = (resetAt) => {
				if (resetAt === void 0) return void 0;
				const left = resetAt * 1e3 - Date.now();
				return left > 0 ? fmtDuration(left) : void 0;
			};
			if (accounts.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-account-panel",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-account-empty",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("accountHeading") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("managementAccountDescription") }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountActions, {
							t,
							store,
							snapshot
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFeedback, {
					t,
					snapshot,
					store
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-account-panel",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-account-panel-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", { children: [
							t("savedAccounts"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-account-count",
								children: accounts.length
							})
						] }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cc-primary-button",
							disabled: busy || authorizing,
							onClick: () => {
								store.signIn();
							},
							children: operation.kind === "starting-authorization" ? t("working") : t("addAccount")
						})]
					}),
					authorizing ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-account-auth",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountActions, {
							t,
							store,
							snapshot,
							compact: true
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("addingAccountKeepsCurrent") })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "cc-account-list",
						children: accounts.map((account) => {
							const figure = figures.find((candidate) => candidate.accountKey === account.accountKey);
							const windows = figure === void 0 ? [] : windowsOf(figure);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
								className: "cc-account-row",
								"data-active": account.active ? "true" : void 0,
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cc-account-row-avatar",
										"aria-hidden": "true",
										children: (account.displayName.trim()[0] ?? "C").toUpperCase()
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cc-account-row-copy",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: account.displayName }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: account.maskedEmail === void 0 ? t("savedAccountDetail") : account.maskedEmail })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cc-account-row-actions",
										children: [account.active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cc-account-badge",
											children: t("usingAccount")
										}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "cc-row-button",
											disabled: busy,
											onClick: () => {
												store.activate(account.accountKey);
											},
											children: operation.kind === "activating" && operation.accountKey === account.accountKey ? t("working") : t("useAccount")
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
											type: "button",
											className: "cc-row-button cc-row-button-danger",
											disabled: busy,
											onClick: () => {
												setRemoveKey(account.accountKey);
											},
											children: t("removeAccount")
										})]
									}),
									quota === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										className: "cc-account-quota",
										"aria-label": t("ov.quota.limits"),
										children: [figure?.errorCode === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "cc-codex-empty",
											children: t("ov.quota.readFailed")
										}), windows.length === 0 ? figure?.errorCode === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
											className: "cc-codex-empty",
											children: figure?.unavailable === true ? t("ov.quota.readFailed") : t("quotaUnavailable")
										}) : null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											className: "cc-codex-windows",
											children: windows.map((win) => {
												const reset = resetIn(win.resetAt);
												const remaining = Math.max(0, Math.min(100, Math.round(win.remainingPercent)));
												return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
													className: "cc-codex-window",
													children: [
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "cc-codex-window-label",
															children: t("ov.quota.window", { w: windowLabel(win.windowSeconds) })
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "cc-codex-window-value",
															children: t("ov.quota.remaining", { p: remaining })
														}),
														reset === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "cc-codex-window-reset",
															children: t("ov.quota.resetIn", { d: reset })
														}),
														/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
															className: "cc-codex-meter",
															"data-low": remaining <= 20 ? "true" : void 0,
															"aria-hidden": "true",
															children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { width: remaining + "%" } })
														})
													]
												}, win.windowSeconds);
											})
										})]
									})
								]
							}, account.accountKey);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-account-footer",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("activeAccountHelp") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cc-row-button cc-row-button-danger",
							disabled: busy,
							onClick: () => {
								store.signOut();
							},
							children: operation.kind === "signing-out" ? t("working") : t("signOutAll")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFeedback, {
						t,
						snapshot,
						store
					}),
					removeAccount === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "cc-account-remove",
						role: "region",
						"aria-live": "polite",
						"aria-label": t("removeAccountTitle", { name: removeAccount.displayName }),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("removeAccountTitle", { name: removeAccount.displayName }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: accounts.length === 1 ? t("removeLastAccountCopy") : replacement === void 0 ? t("removeAccountCopy") : t("removeActiveAccountCopy", { name: replacement.displayName }) }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cc-account-remove-actions",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "cc-row-button",
									onClick: () => {
										setRemoveKey(void 0);
									},
									children: t("cancel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "cc-row-button cc-row-button-danger",
									disabled: busy,
									onClick: () => {
										store.remove(removeAccount.accountKey, replacement?.accountKey);
									},
									children: operation.kind === "removing" ? t("working") : t("confirmRemove")
								})]
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/OpenAICodexPluginCard.tsx
		/** Codex Connect management page: account header, module rail, and per-module content. */
		const MODULES = [
			"account",
			"models",
			"capabilities",
			"network"
		];
		const LABELS = {
			account: "managementAccounts",
			models: "modelsModule",
			capabilities: "capabilitiesModule",
			network: "networkModule"
		};
		const TITLES = {
			account: "managementAccountsTitle",
			models: "modelsModule",
			capabilities: "capabilitiesModule",
			network: "networkModule"
		};
		const DESCRIPTIONS = {
			account: "managementAccountDescription",
			models: "managementModelsDescription",
			capabilities: "managementCapabilitiesDescription",
			network: "managementNetworkDescription"
		};
		/** Stable fallback for hosts that render the page before the account store is injected. */
		const EMPTY_ACCOUNT_SNAPSHOT = {
			status: { status: "loading" },
			busy: false,
			accounts: [],
			operation: { kind: "idle" }
		};
		/** Keep one configuration editor mounted so unsaved drafts survive module switches. */
		function OpenAICodexPluginCard(props) {
			const { t, account, quota, configScope } = props;
			const [selected, setSelected] = (0, react.useState)("account");
			const prefix = (0, react.useId)();
			const snapshot = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => account?.subscribe(listener) ?? (() => void 0), [account]), (0, react.useCallback)(() => account?.getSnapshot() ?? EMPTY_ACCOUNT_SNAPSHOT, [account]));
			const config = (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => configScope?.subscribe(listener) ?? (() => void 0), [configScope]), (0, react.useCallback)(() => configScope?.getSnapshot(), [configScope]))?.value;
			const active = snapshot.accounts.find((candidate) => candidate.active);
			const accountName = active?.displayName ?? t("accountHeading");
			const accountMeta = active?.maskedEmail ?? (snapshot.accounts.length === 0 ? void 0 : t("defaultAccountDetail"));
			const statusLabel = accountStatusLabel(snapshot.status.status, t);
			const openAccounts = () => {
				setSelected("account");
				document.getElementById(prefix + "-account-tab")?.focus();
			};
			const capabilityCount = config === void 0 ? 0 : [
				config.enableSearch,
				config.enableImageTool,
				config.enableImageGeneration,
				config.enableAutoReview
			].filter(Boolean).length;
			const summary = (module) => {
				if (module === "account") return t("savedAccounts") + " · " + String(snapshot.accounts.length);
				if (module === "models") return config?.models === void 0 ? t("modelsModuleDefault") : t("modelsModuleSelected", { count: config.models.length });
				if (module === "network") return t(config?.enableProxy === true ? "networkModuleProxy" : "networkModuleDirect");
				return t("capabilitiesModuleEnabled", { count: capabilityCount });
			};
			const tabCount = (module) => {
				if (module === "account") return String(snapshot.accounts.length);
				if (module === "models") return config?.models === void 0 ? void 0 : String(config.models.length);
				if (module === "capabilities") return config === void 0 ? void 0 : String(capabilityCount);
			};
			const selectModule = (module) => {
				setSelected(module);
				document.getElementById(prefix + "-" + module + "-tab")?.focus();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cc-page cc-manage",
				"aria-label": t("managementTitle"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "cc-page-header",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cc-page-account",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-page-avatar",
								"aria-hidden": "true",
								children: (active?.displayName.trim()[0] ?? "C").toUpperCase()
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
								className: "cc-page-account-copy",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: "cc-page-account-title",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: accountName }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "cc-page-account-status",
										role: "status",
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											"aria-hidden": "true",
											style: dotStyle(snapshot.status.status)
										}), statusLabel]
									})]
								}), accountMeta === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-page-account-meta",
									title: accountMeta,
									children: accountMeta
								})]
							})]
						}), selected === "account" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cc-page-action",
							onClick: openAccounts,
							children: t("manageAccounts")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cc-tabs",
						role: "tablist",
						"aria-label": t("settingsModules"),
						children: MODULES.map((module, index) => {
							const count = tabCount(module);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								role: "tab",
								id: prefix + "-" + module + "-tab",
								"aria-label": t(LABELS[module]),
								"aria-controls": prefix + "-" + module,
								"aria-selected": selected === module,
								tabIndex: selected === module ? 0 : -1,
								title: summary(module),
								className: "cc-tab",
								onClick: () => {
									setSelected(module);
								},
								onKeyDown: (event) => {
									if (![
										"ArrowDown",
										"ArrowUp",
										"ArrowLeft",
										"ArrowRight",
										"Home",
										"End"
									].includes(event.key)) return;
									event.preventDefault();
									selectModule(MODULES[event.key === "Home" ? 0 : event.key === "End" ? MODULES.length - 1 : (index + (event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : -1) + MODULES.length) % MODULES.length]);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(LABELS[module]) }), count === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-tab-count",
									"aria-hidden": "true",
									children: count
								})]
							}, module);
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
						className: "cc-content",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
								className: "cc-content-header",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
									className: "cc-content-title",
									children: t(TITLES[selected])
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "cc-content-subtitle",
									children: t(DESCRIPTIONS[selected])
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								id: prefix + "-account",
								role: "tabpanel",
								"aria-labelledby": prefix + "-account-tab",
								hidden: selected !== "account",
								children: selected === "account" ? account === void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									role: "status",
									children: t("usageNoData")
								}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexAccountPanel, {
									t,
									store: account,
									snapshot,
									...quota === void 0 ? {} : { quota }
								}), quota === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountReadiness, {
									t,
									account,
									quota
								})] }) : null
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cc-content-config",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexConfiguration, {
									t,
									scope: configScope,
									...account === void 0 ? {} : { account },
									activeModule: selected === "account" ? "account" : selected,
									panelIdPrefix: prefix,
									management: true,
									flush: true
								})
							})
						]
					})
				]
			});
		}
		//#endregion
		//#region src/client/CodexSettingsIcon.tsx
		/**
		* Render the Codex Connect navigation glyph.
		* @param props - shell-provided icon size; the glyph keeps the row's text color in both states.
		* @returns the section glyph.
		*/
		function CodexSettingsIcon({ size = 16 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
				width: size,
				height: size,
				viewBox: "0 0 16 16",
				fill: "none",
				"aria-hidden": "true",
				focusable: "false",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 1.75 3.25 4.5v7L8 14.25l4.75-2.75v-7L8 1.75Z",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinejoin: "round"
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
					d: "M8 5.1a2.9 2.9 0 1 0 0 5.8",
					stroke: "currentColor",
					strokeWidth: "1.2",
					strokeLinecap: "round"
				})]
			});
		}
		//#endregion
		//#region src/fast-mode-paths.ts
		/** Node-free Fast Mode route constants shared by Host and browser halves. */
		/** GET/POST endpoint for one conversation's process-local Fast Mode state. */
		const OPENAI_CODEX_FAST_MODE_PATH = "/plugins/dsh-openai-codex/fast-mode";
		//#endregion
		//#region src/client/OpenAICodexSpeedControl.tsx
		/** Revisioned nonpersistent speed selection; no optimistic success or automatic POST replay. */
		const MODES = [
			"standard",
			"fast",
			"ultrafast"
		];
		const ACTIVE_COLOR = "var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-label-primary))";
		/** Render the compact speed menu in the existing Composer control position. */
		function OpenAICodexSpeedControl({ sessionId, provider, model, t, refreshKey = "", available = true }) {
			const [selection, setSelection] = (0, react.useState)();
			const [status, setStatus] = (0, react.useState)("loading");
			const [readAttempt, setReadAttempt] = (0, react.useState)(0);
			const [menuOpen, setMenuOpen] = (0, react.useState)(false);
			const [detailsOpen, setDetailsOpen] = (0, react.useState)(false);
			const controller = (0, react.useRef)(void 0);
			const button = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				controller.current?.abort();
				const abort = new AbortController();
				controller.current = abort;
				setStatus("loading");
				setMenuOpen(false);
				requestJson("/plugins/dsh-openai-codex/speed-mode?" + new URLSearchParams({
					sessionId,
					provider,
					model
				}).toString(), {
					method: "GET",
					credentials: "same-origin",
					headers: { accept: "application/json" },
					signal: abort.signal
				}).then(({ response, value }) => {
					if (abort.signal.aborted) return;
					const next = response.ok ? readConversationSpeed(value, provider, model) : void 0;
					setSelection(next);
					setStatus(next === void 0 ? "unconfirmed" : "ready");
				}).catch((_error) => {
					if (!abort.signal.aborted) setStatus("unconfirmed");
				}).finally(() => {
					if (controller.current === abort) controller.current = void 0;
				});
				return () => {
					abort.abort();
					if (controller.current === abort) controller.current = void 0;
				};
			}, [
				sessionId,
				provider,
				model,
				refreshKey,
				readAttempt
			]);
			(0, react.useEffect)(() => () => {
				controller.current?.abort();
			}, []);
			const close = () => {
				setMenuOpen(false);
				setDetailsOpen(false);
			};
			const select = (mode) => {
				if (status !== "ready" || selection === void 0 || controller.current !== void 0) return;
				close();
				button.current?.focus();
				const abort = new AbortController();
				controller.current = abort;
				setStatus("loading");
				requestJson(OPENAI_CODEX_SPEED_MODE_PATH, {
					method: "POST",
					credentials: "same-origin",
					headers: {
						accept: "application/json",
						"content-type": "application/json"
					},
					body: JSON.stringify({
						sessionId,
						provider,
						model,
						generation: selection.generation,
						revision: selection.revision,
						mode
					}),
					signal: abort.signal
				}).then(({ response, value }) => {
					if (abort.signal.aborted) return;
					const next = response.ok ? readConversationSpeed(value, provider, model) : void 0;
					if (next !== void 0 && next.mode === mode && !next.selectionExpired) {
						setSelection(next);
						setStatus("ready");
					} else setStatus("unconfirmed");
				}).catch((_error) => {
					if (!abort.signal.aborted) setStatus("unconfirmed");
				}).finally(() => {
					if (controller.current === abort) controller.current = void 0;
				});
			};
			const currentMode = status === "ready" ? selection?.mode : void 0;
			const expired = status === "ready" && selection?.selectionExpired === true;
			const active = !expired && (currentMode === "fast" || currentMode === "ultrafast");
			const label = status === "loading" ? t("speedLoading") : status === "unconfirmed" ? t("speedRecover") : expired ? t("speedSelectionExpired") : currentMode === "ultrafast" ? t("speedMenuUltrafastTitle") : currentMode === "fast" ? t("speedMenuFastTitle") : t("speedMenuStandardTitle");
			const canUltra = available && selection?.modelSupported === true && selection.hasAccount && selection.selectionAvailable;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				style: {
					display: "inline-flex",
					alignItems: "center",
					position: "relative"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)(_deepseek_ai_dsh_client_ui_primitives.Menu, {
					open: menuOpen && status === "ready",
					onClose: close,
					portal: true,
					align: "end",
					side: "top",
					autoFocus: true,
					compact: true,
					anchorRef: button,
					anchor: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Tooltip, {
						label,
						side: "top",
						align: "end",
						portal: true,
						disabled: menuOpen,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							ref: button,
							type: "button",
							"aria-label": label,
							"aria-busy": status === "loading",
							"aria-pressed": active,
							"aria-haspopup": "menu",
							"aria-expanded": menuOpen,
							disabled: status === "loading",
							"data-openai-codex-speed-menu": expired ? "expired" : currentMode ?? status,
							onClick: () => {
								if (status === "unconfirmed") {
									setReadAttempt((attempt) => attempt + 1);
									return;
								}
								if (menuOpen) close();
								else setMenuOpen(true);
							},
							onKeyDown: (event) => {
								if ((event.key === "ArrowUp" || event.key === "ArrowDown") && status === "ready") {
									event.preventDefault();
									setMenuOpen(true);
								}
							},
							style: {
								display: "inline-flex",
								alignItems: "center",
								justifyContent: "center",
								width: 30,
								height: 30,
								padding: 0,
								border: 0,
								borderRadius: 8,
								background: "transparent",
								color: active || expired ? ACTIVE_COLOR : "var(--dsw-alias-label-secondary)",
								cursor: status === "loading" ? "default" : "pointer",
								opacity: status === "loading" ? .6 : 1
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
								width: "16",
								height: "16",
								viewBox: "0 0 24 24",
								"aria-hidden": "true",
								focusable: "false",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
									d: "M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z",
									fill: active ? "currentColor" : "none",
									stroke: "currentColor",
									strokeWidth: "1.8",
									strokeLinejoin: "round"
								})
							}), expired ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								children: "!"
							}) : null]
						})
					}),
					children: [
						expired ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							role: "alert",
							style: {
								maxWidth: 240,
								whiteSpace: "normal",
								margin: "4px 8px",
								fontSize: 12
							},
							children: t("speedSelectionExpired")
						}) : null,
						MODES.map((mode) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							role: "menuitemradio",
							"aria-checked": !expired && selection?.mode === mode,
							"data-speed-mode": mode,
							disabled: mode === "ultrafast" && !canUltra,
							onClick: () => {
								select(mode);
							},
							onKeyDown: (event) => {
								if (event.key === "Tab") {
									event.preventDefault();
									event.stopPropagation();
									close();
									button.current?.focus();
								}
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									select(mode);
								}
							},
							style: {
								display: "flex",
								gap: 8,
								width: "100%",
								padding: "6px 8px",
								border: 0,
								borderRadius: 6,
								background: "transparent",
								color: "var(--dsw-alias-label-primary)",
								fontSize: 12,
								textAlign: "left"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: { width: 14 },
								children: !expired && selection?.mode === mode ? "✓" : ""
							}), t(mode === "standard" ? "speedStandard" : mode === "fast" ? "speedFast" : "speedUltrafast")]
						}, mode)),
						!canUltra ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								maxWidth: 240,
								whiteSpace: "normal",
								margin: "4px 8px",
								fontSize: 12
							},
							children: t("ultrafastUnavailable")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "menuitem",
							"aria-expanded": detailsOpen,
							onClick: () => {
								setDetailsOpen((open) => !open);
							},
							onKeyDown: (event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									setDetailsOpen((open) => !open);
								}
							},
							style: {
								display: "block",
								border: 0,
								background: "transparent",
								color: "inherit",
								padding: "6px 8px",
								fontSize: 12
							},
							children: t("speedDetails")
						}),
						detailsOpen ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								maxWidth: 240,
								whiteSpace: "normal",
								margin: "4px 8px",
								fontSize: 12,
								lineHeight: "18px"
							},
							children: t("ultrafastDisclosure")
						}) : null
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					role: "status",
					"data-openai-codex-speed-status": status,
					style: {
						position: "absolute",
						width: 1,
						height: 1,
						overflow: "hidden",
						clipPath: "inset(50%)",
						whiteSpace: "nowrap"
					},
					children: label
				})]
			});
		}
		//#endregion
		//#region src/client/OpenAICodexFastModeToggle.tsx
		/** Per-conversation OpenAI Codex Fast Mode control for the Composer row. */
		const FAST_MODE_ACTIVE_COLOR = "var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-label-primary))";
		function isRecord(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value);
		}
		function readEnabled(value) {
			if (!isRecord(value) || typeof value["enabled"] !== "boolean") return void 0;
			return value["enabled"];
		}
		function isEligible(state) {
			const current = state.current;
			return state.status === "ready" && current !== null && isOpenAICodexRouteId(current.provider) && typeof current.model === "string" && current.model.startsWith("gpt-");
		}
		function subscribeDirectory(directory, listener) {
			return directory.subscribe(listener);
		}
		function requestUrl(sessionId) {
			return `${OPENAI_CODEX_FAST_MODE_PATH}?sessionId=${encodeURIComponent(sessionId)}`;
		}
		/**
		* Render the lightning button for GPT models on every Codex account route.
		* Host state is read and written through the session-addressed
		* route; no global model slot or persistent settings are changed.
		*/
		function LegacyOpenAICodexFastModeToggle({ directory, account, sessionId, t }) {
			const directoryState = (0, react.useSyncExternalStore)((listener) => subscribeDirectory(directory, listener), () => directory.getSnapshot(), () => directory.getSnapshot());
			const eligible = isEligible(directoryState);
			const [state, setState] = (0, react.useState)({
				status: "loading",
				enabled: false
			});
			const [extended, setExtended] = (0, react.useState)(false);
			const [tooltipVisible, setTooltipVisible] = (0, react.useState)(false);
			const controllerRef = (0, react.useRef)(void 0);
			const tooltipId = (0, react.useId)();
			(0, react.useEffect)(() => () => {
				controllerRef.current?.abort();
			}, []);
			(0, react.useEffect)(() => {
				controllerRef.current?.abort();
				controllerRef.current = void 0;
				setExtended(false);
				if (!eligible) {
					setState({
						status: "loading",
						enabled: false
					});
					return;
				}
				const controller = new AbortController();
				controllerRef.current = controller;
				let disposed = false;
				setState({
					status: "loading",
					enabled: false
				});
				(async () => {
					try {
						const { response, value } = await requestJson(requestUrl(sessionId), {
							method: "GET",
							credentials: "same-origin",
							headers: { accept: "application/json" },
							signal: controller.signal
						});
						if (response.status === 409) {
							if (!disposed && !controller.signal.aborted) setExtended(true);
							return;
						}
						const enabled = response.ok ? readEnabled(value) : void 0;
						if (!disposed && !controller.signal.aborted) setState(enabled === void 0 ? {
							status: "error",
							enabled: false
						} : {
							status: "ready",
							enabled
						});
					} catch {
						if (!disposed && !controller.signal.aborted) setState({
							status: "error",
							enabled: false
						});
					} finally {
						if (controllerRef.current === controller) controllerRef.current = void 0;
					}
				})();
				return () => {
					disposed = true;
					controller.abort();
					if (controllerRef.current === controller) controllerRef.current = void 0;
				};
			}, [
				eligible,
				sessionId,
				directoryState.current?.provider,
				directoryState.current?.model
			]);
			if (!eligible) return null;
			if (extended && directoryState.current !== null) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountScopedSpeedControl, {
				directory,
				...account === void 0 ? {} : { account },
				sessionId,
				t,
				provider: directoryState.current.provider,
				model: directoryState.current.model
			});
			const busy = state.status !== "ready";
			const title = state.status === "loading" ? t("fastModeLoadingTitle") : state.status === "error" ? t("fastModeUnavailableTitle") : state.enabled ? t("fastModeEnabledTitle") : t("fastModeDisabledTitle");
			const toggle = () => {
				if (state.status !== "ready" || busy) return;
				controllerRef.current?.abort();
				const controller = new AbortController();
				controllerRef.current = controller;
				const next = !state.enabled;
				setState((current) => ({
					...current,
					status: "loading"
				}));
				(async () => {
					try {
						const { response, value } = await requestJson(OPENAI_CODEX_FAST_MODE_PATH, {
							method: "POST",
							credentials: "same-origin",
							headers: {
								accept: "application/json",
								"content-type": "application/json"
							},
							body: JSON.stringify({
								sessionId,
								enabled: next
							}),
							signal: controller.signal
						});
						const enabled = response.ok ? readEnabled(value) : void 0;
						if (!controller.signal.aborted) setState(enabled === void 0 ? {
							status: "error",
							enabled: state.enabled
						} : {
							status: "ready",
							enabled
						});
					} catch {
						if (!controller.signal.aborted) setState({
							status: "error",
							enabled: state.enabled
						});
					} finally {
						if (controllerRef.current === controller) controllerRef.current = void 0;
					}
				})();
			};
			const active = state.enabled;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				onMouseEnter: () => {
					setTooltipVisible(true);
				},
				onMouseLeave: () => {
					setTooltipVisible(false);
				},
				onFocus: () => {
					setTooltipVisible(true);
				},
				onBlur: () => {
					setTooltipVisible(false);
				},
				style: {
					display: "inline-flex",
					position: "relative",
					width: 30,
					height: 30
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					"data-openai-codex-fast-mode": active ? "on" : "off",
					"aria-label": title,
					"aria-describedby": tooltipVisible ? tooltipId : void 0,
					"aria-pressed": active,
					"aria-busy": busy,
					disabled: busy,
					onClick: toggle,
					style: {
						display: "inline-flex",
						alignItems: "center",
						justifyContent: "center",
						width: 30,
						height: 30,
						padding: 0,
						border: 0,
						borderRadius: 8,
						background: "transparent",
						color: active ? FAST_MODE_ACTIVE_COLOR : "var(--dsw-alias-label-secondary)",
						cursor: busy ? "default" : "pointer",
						opacity: busy ? .6 : 1
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 24 24",
						"aria-hidden": "true",
						focusable: "false",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
							"data-openai-codex-fast-mode-bolt": active ? "filled" : "outline",
							d: "M13.1 2.75 5.35 13.1h5.8l-.95 8.15 8.45-11.2h-5.9l.35-7.3Z",
							fill: active ? "currentColor" : "none",
							stroke: "currentColor",
							strokeWidth: "1.8",
							strokeLinejoin: "round"
						})
					})
				}), tooltipVisible && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					id: tooltipId,
					role: "tooltip",
					style: {
						position: "absolute",
						left: "50%",
						bottom: "calc(100% + 8px)",
						zIndex: 1e3,
						transform: "translateX(-50%)",
						padding: "4px 8px",
						borderRadius: 6,
						background: "var(--dsw-specific-tip, #1f2329)",
						boxShadow: "var(--dsw-shadow-lv2)",
						color: "var(--dsw-alias-label-primary, #fff)",
						fontSize: 12,
						lineHeight: "18px",
						whiteSpace: "nowrap",
						pointerEvents: "none"
					},
					children: title
				})]
			});
		}
		/** Keep legacy Fast behavior on other models; exact supported models receive the three-mode menu. */
		function OpenAICodexFastModeToggle(props) {
			const directory = (0, react.useSyncExternalStore)((listener) => props.directory.subscribe(listener), () => props.directory.getSnapshot(), () => props.directory.getSnapshot());
			if (!isEligible(directory) || directory.current === null) return null;
			const { provider, model } = directory.current;
			if (!supportsOpenAICodexUltrafast(provider, model)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LegacyOpenAICodexFastModeToggle, { ...props });
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountScopedSpeedControl, {
				...props,
				provider,
				model
			}, props.sessionId + ":" + provider + ":" + model);
		}
		function AccountScopedSpeedControl(props) {
			const subscribe = (0, react.useCallback)((listener) => props.account?.subscribe(listener) ?? (() => void 0), [props.account]);
			const getSnapshot = (0, react.useCallback)(() => props.account?.getSnapshot(), [props.account]);
			const account = (0, react.useSyncExternalStore)(subscribe, getSnapshot, getSnapshot);
			const identity = account === void 0 ? "" : [
				account.accounts.map((row) => row.accountKey + ":" + row.active).join(","),
				account.status.status,
				account.operation.kind,
				account.authorizationRevision ?? 0
			].join(":");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexSpeedControl, {
				sessionId: props.sessionId,
				provider: props.provider,
				model: props.model,
				t: props.t,
				refreshKey: identity,
				available: account === void 0 || !account.busy
			});
		}
		//#endregion
		//#region src/client/feature-locales.ts
		/** Copy for bounded local review, requested service tiers, and request defaults. */
		const featureEn = {
			speedLoading: "Loading requested speed…",
			speedRecover: "Reload speed choices",
			speedMenuStandardTitle: "Standard — no priority hint",
			speedMenuFastTitle: "Fast — request priority service",
			speedMenuUltrafastTitle: "Ultrafast — request ultrafast service",
			speedSelectionExpired: "The model or account changed. Explicitly select a speed again; this request was not downgraded.",
			speedStandard: "Standard",
			speedFast: "Fast",
			speedUltrafast: "Ultrafast",
			ultrafastUnavailable: "Ultrafast requires a signed-in account and a supported model. Eligibility and actual service remain unknown.",
			ultrafastDisclosure: "Ultrafast is a requested service tier, not a measured speed guarantee. It may use quota differently or be rejected; rejection does not trigger a downgrade or replay.",
			speedDetails: "Requested speed details",
			newSessionSpeedMode: "New conversation speed",
			newSubagentSpeedMode: "New subagent conversation speed",
			speedDefaultLegacy: "Use the corresponding legacy Fast default",
			speedDefaultsHelp: "Only new conversations use these defaults. Explicit Standard overrides legacy Fast; manual choices and resumed conversations are not reset. Conversation choices are not restored after a plugin or server restart.",
			reasoningDefault: "Reasoning effort fallback",
			reasoningDefaultNone: "No plugin fallback",
			reasoningDefaultsHelp: "Used only when a request omits reasoning effort. Explicit request effort wins. Unsupported levels fail before sending the request; Sol Off and Minimal remain unavailable.",
			reasoningOff: "Off",
			reasoningMinimal: "Minimal",
			reasoningLow: "Low",
			reasoningMedium: "Medium",
			reasoningHigh: "High",
			reasoningXhigh: "Extra high",
			reasoningMax: "Maximum",
			autoReviewLocalPolicy: "Auto-review local authorization scope",
			autoReviewPolicyManual: "Manual — no standing file authorization",
			autoReviewPolicyRead: "Ordinary workspace files — read only",
			autoReviewPolicyFiles: "Ordinary workspace files — read and write",
			autoReviewPolicyHelp: "Enabling the reviewer alone grants no file authority. An explicit scope allows only eligible ordinary files within the original workspace; sensitive files, shell, ambiguous paths, and higher-priority restrictions remain human-reviewed. File checks reduce risk but cannot remove concurrent filesystem races."
		};
		const featureZh = {
			speedLoading: "正在读取请求速度档位…",
			speedRecover: "重新读取速度选项",
			speedMenuStandardTitle: "Standard — 不请求优先服务",
			speedMenuFastTitle: "Fast — 请求优先服务",
			speedMenuUltrafastTitle: "Ultrafast — 请求 ultrafast 服务",
			speedSelectionExpired: "模型或账号已变化，请重新明确选择速度档位；本次请求没有降档。",
			speedStandard: "Standard",
			speedFast: "Fast",
			speedUltrafast: "Ultrafast",
			ultrafastUnavailable: "Ultrafast 需要已登录账号和支持的模型；账号资格与实际服务档位仍未知。",
			ultrafastDisclosure: "Ultrafast 只是请求档位，不保证实测倍速；可能采用不同额度规则或被服务端拒绝。拒绝后不会自动降档或重放。",
			speedDetails: "请求速度说明",
			newSessionSpeedMode: "新主会话默认速度",
			newSubagentSpeedMode: "新子代理会话默认速度",
			speedDefaultLegacy: "沿用对应的旧版 Fast 默认值",
			speedDefaultsHelp: "仅在新会话启动时使用。明确选择 Standard 会覆盖旧版 Fast；手动选择和恢复会话不会被重置。会话内选择不会在插件或服务重启后恢复。",
			reasoningDefault: "推理强度回退值",
			reasoningDefaultNone: "不设置插件回退值",
			reasoningDefaultsHelp: "仅在请求未指定推理强度时使用，请求显式值优先。不支持的档位在发出请求前失败；Sol 的 Off 和 Minimal 仍不可用。",
			reasoningOff: "关闭",
			reasoningMinimal: "最低",
			reasoningLow: "低",
			reasoningMedium: "中",
			reasoningHigh: "高",
			reasoningXhigh: "极高",
			reasoningMax: "最大",
			autoReviewLocalPolicy: "Auto-review 本地授权范围",
			autoReviewPolicyManual: "人工确认 — 不授予常驻文件权限",
			autoReviewPolicyRead: "普通工作区文件 — 只读",
			autoReviewPolicyFiles: "普通工作区文件 — 读写",
			autoReviewPolicyHelp: "仅启用审核模型不会授予文件权限。明确选择的范围只允许原工作区内符合条件的普通文件；敏感文件、Shell、歧义路径和更高优先级限制仍交人工确认。文件预检能降低风险，但无法消除并发文件系统竞态。"
		};
		//#endregion
		//#region src/client/usage-locales.ts
		/** Copy for the migrated quota and usage grid. */
		const usageZh = {
			"cmd.close": "关闭",
			"ov.entry": "Codex Connect",
			"ov.recent.title": "最近请求",
			"ov.recent.limit": "最近 5 条",
			"ov.recent.loading": "正在读取最近请求…",
			"ov.recent.failed": "最近请求读取失败",
			"ov.recent.retry": "重试",
			"ov.recent.empty": "还没有最近请求",
			"ov.recent.emptyHint": "本进程启动后完成的 Codex 请求会出现在这里。",
			"ov.recent.note": "本进程内所有 Codex 账号的模型请求（含辅助调用）；不含其他提供商、搜索和图片接口。",
			"ov.recent.key": "账号",
			"ov.recent.kind.conversation": "对话",
			"ov.recent.kind.title": "标题",
			"ov.recent.kind.compaction": "压缩",
			"ov.recent.kind.subagent": "子智能体",
			"ov.recent.kind.autoReview": "审查",
			"ov.recent.metrics": "Token 用量",
			"ov.recent.in": "Input",
			"ov.recent.out": "Output",
			"ov.recent.cacheW": "Cache W",
			"ov.recent.cacheR": "Cache R",
			"ov.recent.reasoning": "思考",
			"ov.recent.body": "请求体",
			"ov.recent.bodyDelta": "仅增量",
			"ov.recent.transport.ws": "WS",
			"ov.recent.continuation.delta": "增量",
			"ov.recent.continuation.full": "全量",
			"ov.recent.transport.sse": "Stream",
			"ov.recent.outcome.error": "失败",
			"ov.recent.outcome.aborted": "已取消",
			"ov.dash.resetDetails": "重置卡详情",
			"ov.dash.nearest": "最近 {date}",
			"ov.dash.account": "账号",
			"ov.dash.resetCards": "重置卡",
			"ov.dash.cards": "{count} 张",
			"ov.local.failed": "用量更新失败",
			"ov.local.unavailable": "用量暂不可用",
			"ov.local.retry": "重试",
			"ov.kpi.tokens": "累计消耗",
			"ov.kpi.cacheHit": "总体缓存命中率",
			"ov.kpi.cacheScope": "本进程 · 全部 Codex 账号",
			"ov.kpi.concurrency": "当前并发",
			"ov.kpi.concurrencyScope": "进行中的模型请求",
			"ov.quota.balance": "账户余额",
			"ov.quota.platform": "平台与本机",
			"ov.quota.platformBalance": "平台余额",
			"ov.quota.limits": "Codex 额度",
			"ov.quota.window": "{w} 额度",
			"ov.quota.active": "当前账号",
			"ov.quota.readFailed": "额度读取失败",
			"ov.quota.balanceSub": "赠金 {granted} · 充值 {topped}",
			"ov.quota.codex5h": "Codex 5 小时额度",
			"ov.quota.codexWeek": "Codex 周额度",
			"ov.quota.resetIn": "{d} 后重置",
			"ov.quota.codexWindow": "Codex {w} 额度",
			"ov.quota.remaining": "剩余 {p}%",
			"ov.quota.today": "今日用量",
			"ov.quota.accountCurrent": "当前",
			"ov.quota.legend": "账号对照",
			"ov.quota.detail.total": "总额",
			"ov.quota.detail.granted": "赠金",
			"ov.quota.detail.topped": "充值",
			"ov.quota.detail.currency": "币种",
			"ov.quota.detail.sessions": "活跃会话",
			"ov.quota.detail.requests": "请求数",
			"ov.quota.detail.account": "账号",
			"ov.quota.detail.length": "窗口长度",
			"ov.quota.detail.remaining": "剩余额度",
			"ov.quota.detail.resetAt": "重置时刻",
			"ov.quota.detail.refreshed": "上次刷新",
			"ov.quota.detail.ago": "前",
			"ov.quota.detail.filterDay": "在会话列表里只看今天"
		};
		const usageEn = {
			"cmd.close": "Close",
			"ov.entry": "Codex Connect",
			"ov.recent.title": "Recent requests",
			"ov.recent.limit": "Last 5",
			"ov.recent.loading": "Loading recent requests…",
			"ov.recent.failed": "Could not read recent requests",
			"ov.recent.retry": "Retry",
			"ov.recent.empty": "No recent requests yet",
			"ov.recent.emptyHint": "Codex requests completed since this process started appear here.",
			"ov.recent.note": "All Codex accounts' model requests in this process, including auxiliary calls; other providers, search and image endpoints are excluded.",
			"ov.recent.key": "Account",
			"ov.recent.kind.conversation": "Conversation",
			"ov.recent.kind.title": "Title",
			"ov.recent.kind.compaction": "Compaction",
			"ov.recent.kind.subagent": "Subagent",
			"ov.recent.kind.autoReview": "Review",
			"ov.recent.metrics": "Token usage",
			"ov.recent.in": "Input",
			"ov.recent.out": "Output",
			"ov.recent.cacheW": "Cache W",
			"ov.recent.cacheR": "Cache R",
			"ov.recent.reasoning": "Reasoning",
			"ov.recent.body": "Request body",
			"ov.recent.bodyDelta": "Delta only",
			"ov.recent.transport.ws": "WS",
			"ov.recent.continuation.delta": "Delta",
			"ov.recent.continuation.full": "Full",
			"ov.recent.transport.sse": "Stream",
			"ov.recent.outcome.error": "Failed",
			"ov.recent.outcome.aborted": "Cancelled",
			"ov.dash.resetDetails": "Reset card details",
			"ov.dash.nearest": "next {date}",
			"ov.dash.account": "Account",
			"ov.dash.resetCards": "Reset cards",
			"ov.dash.cards": "{count}",
			"ov.local.failed": "Could not update usage",
			"ov.local.unavailable": "Usage is unavailable",
			"ov.local.retry": "Retry",
			"ov.kpi.tokens": "Tokens Used",
			"ov.kpi.cacheHit": "Overall cache hit rate",
			"ov.kpi.cacheScope": "All Codex accounts in this process",
			"ov.kpi.concurrency": "Current concurrency",
			"ov.kpi.concurrencyScope": "Model requests in progress",
			"ov.quota.balance": "Balance",
			"ov.quota.platform": "Platform & this device",
			"ov.quota.platformBalance": "Platform balance",
			"ov.quota.limits": "Codex limits",
			"ov.quota.window": "{w} quota",
			"ov.quota.active": "Active",
			"ov.quota.readFailed": "Quota read failed",
			"ov.quota.balanceSub": "granted {granted} · topped up {topped}",
			"ov.quota.codex5h": "Codex 5-hour quota",
			"ov.quota.codexWeek": "Codex weekly quota",
			"ov.quota.resetIn": "resets in {d}",
			"ov.quota.codexWindow": "Codex {w} quota",
			"ov.quota.remaining": "{p}% left",
			"ov.quota.today": "Today",
			"ov.quota.accountCurrent": "current",
			"ov.quota.legend": "Accounts",
			"ov.quota.detail.total": "Total",
			"ov.quota.detail.granted": "Granted",
			"ov.quota.detail.topped": "Topped up",
			"ov.quota.detail.currency": "Currency",
			"ov.quota.detail.sessions": "Active sessions",
			"ov.quota.detail.requests": "Requests",
			"ov.quota.detail.account": "Account",
			"ov.quota.detail.length": "Window",
			"ov.quota.detail.remaining": "Remaining",
			"ov.quota.detail.resetAt": "Resets at",
			"ov.quota.detail.refreshed": "Last refreshed",
			"ov.quota.detail.ago": "ago",
			"ov.quota.detail.filterDay": "Show only today in the list"
		};
		//#endregion
		//#region src/client/management-locales.ts
		/** Copy for the management center and account-scoped catalog preview. */
		const managementEn = {
			accountReadiness: "Account readiness",
			readinessReauth: "Sign in again",
			readinessLimited: "Temporarily rate-limited (HTTP 429); quota exhaustion is not established",
			readinessUnavailable: "Current quota read failed",
			readinessStale: "Reset time has passed; refresh is needed",
			readinessUnknown: "No current quota evidence",
			readinessExhausted: "A reported quota window has no remaining allowance",
			readinessObserved: "Allowance remains in the last reported windows",
			readinessChecked: "Last successful read",
			readinessRetained: "(retained figures; not a successful current read)",
			readinessReset: "Reported reset",
			readinessManage: "Manage accounts manually",
			managementCatalogAuthRequired: "Sign in to this Harness browser again, then retry.",
			managementCatalogForbidden: "This browser origin is not trusted. Check connection trust settings.",
			managementCatalogAccountRemoved: "This saved account is unavailable. Refresh the account list.",
			managementCatalogUnavailable: "The Host connection is not ready. Retry after reconnecting.",
			managementCatalogTimeout: "The catalog request timed out. Retry without switching accounts.",
			managementCatalogInvalid: "The catalog response could not be validated. Retry or check plugin compatibility.",
			managementCatalogRetained: "Showing the last successful catalog; the current refresh is incomplete.",
			newSessionFastMode: "Enable Fast Mode for new main conversations",
			newSubagentFastMode: "Enable Fast Mode for new subagent conversations",
			fastDefaultsHelp: "Only new starts are affected. Existing or resumed conversations and explicit manual choices are unchanged. Speed and quota consumption depend on the service.",
			managementTitle: "Codex Connect management",
			imageReference: "Reference image {index}",
			imageReferencePurpose: "Reference purpose",
			addImageReference: "Add reference image",
			removeImageReference: "Remove reference image",
			imageSourceOriginal: "Original image",
			imageSourceUpload: "Uploaded image",
			imageSourcePreview: "Preview image",
			imageInventoryFailed: "Cannot load images from this conversation. Retry without changing the selected target.",
			imageInventoryLoading: "Loading conversation images…",
			imageEditing: "Editing image",
			imageEdited: "Image edited",
			editTarget: "Edit target",
			selectEditTarget: "Select an image to edit",
			editInstructions: "Edit instructions",
			previewEditNotice: "The exact original is unavailable. Editing the displayed preview can reduce quality.",
			choosePreviewEdit: "Explicitly use the preview",
			submitImageEdit: "Request image edit",
			cancelImageEdit: "Cancel edit",
			editFrom: "Edit {source} with {count} reference images",
			retryImageEdit: "Review and try again",
			imageRequestUncertain: "The request outcome is unknown. Check the conversation before submitting again.",
			imageInputRecovery: "Re-select an accessible image from this conversation and try again.",
			imageStorageRecovery: "The image could not be stored. Check local storage before trying again.",
			imageUnknownFailure: "The image operation failed. Review the conversation before retrying.",
			managementIntro: "View usage, manage accounts and configure models, connectivity and optional capabilities.",
			managementBadge: "Management center",
			managementUnsaved: "Unsaved settings — account and connection actions are applied separately.",
			managementOverview: "Usage overview",
			managementOverviewDescription: "Platform balance, this device’s usage, and each account’s Codex limits.",
			managementAccounts: "Accounts",
			managementAccountsTitle: "Accounts and limits",
			managementAccountDescription: "Switch the active account and review the Codex limits of every saved account.",
			managementModelsDescription: "Choose which Codex models appear and set their context budgets.",
			managementNetworkDescription: "Review the current connection and configure automatic detection or a manual proxy.",
			managementCapabilitiesDescription: "Enable search, image, auto-review, and other optional capabilities.",
			managementGlobalModels: "Global model settings",
			managementModelScope: "These settings control model visibility and budgets across Codex routes. They do not select or switch the model in your current conversation. Different accounts may have different access and limits.",
			managementAccountCatalog: "Models by account",
			managementAccountCatalogHelp: "Preview an account without changing the default account or sending an inference request. This preview does not change your settings draft.",
			managementPreviewAccount: "Preview account",
			managementCatalogLogin: "Sign in on the Accounts tab to inspect account-specific model access.",
			managementCatalogEmpty: "No models are available in this catalog.",
			managementCatalogFailed: "This account catalog could not be loaded. Retry without changing accounts.",
			managementCatalogRetry: "Retry catalog",
			managementModelAvailable: "Advertised",
			managementModelUnavailable: "Unavailable",
			managementModelUnavailableReason: "This account no longer advertises this model. Its last metadata is retained; inference requests are blocked locally. Refresh the catalog or choose another model/account."
		};
		const managementZh = {
			accountReadiness: "账号就绪状态",
			readinessReauth: "需要重新登录",
			readinessLimited: "暂时限流（HTTP 429），不能据此判定额度耗尽",
			readinessUnavailable: "本次额度读取失败",
			readinessStale: "已过重置时间，需要刷新",
			readinessUnknown: "暂无当前额度依据",
			readinessExhausted: "最近一次读取中，有额度窗口的余额为零",
			readinessObserved: "最近一次读取的额度窗口仍有余额",
			readinessChecked: "最近成功读取",
			readinessRetained: "（保留的旧数据，不代表本次读取成功）",
			readinessReset: "服务端报告的重置时间",
			readinessManage: "前往账号管理，手动处理",
			managementCatalogAuthRequired: "请重新登录当前 Harness 网页后重试。",
			managementCatalogForbidden: "当前网页来源未获信任，请检查连接信任设置。",
			managementCatalogAccountRemoved: "此账号已不可用，请刷新账号列表。",
			managementCatalogUnavailable: "宿主连接尚未就绪，请重新连接后重试。",
			managementCatalogTimeout: "目录请求超时，可直接重试，无需切换账号。",
			managementCatalogInvalid: "目录响应格式无效，请重试或检查插件兼容性。",
			managementCatalogRetained: "正在显示上次成功读取的目录；本次刷新尚未完成。",
			newSessionFastMode: "新主会话默认启用 Fast Mode",
			newSubagentFastMode: "新子会话默认启用 Fast Mode",
			fastDefaultsHelp: "仅影响新启动会话，不改变已有、恢复会话或手动选择；速度和额度消耗由服务端决定。",
			managementTitle: "Codex Connect 管理中心",
			imageReference: "参考图 {index}",
			imageReferencePurpose: "参考用途",
			addImageReference: "添加参考图",
			removeImageReference: "移除参考图",
			imageSourceOriginal: "原图",
			imageSourceUpload: "上传图片",
			imageSourcePreview: "预览图",
			imageInventoryFailed: "无法读取会话图片，可重试；不会替换已选目标。",
			imageInventoryLoading: "正在读取会话图片…",
			imageEditing: "正在编辑图片",
			imageEdited: "图片已编辑",
			editTarget: "编辑目标",
			selectEditTarget: "选择要编辑的图片",
			editInstructions: "编辑要求",
			previewEditNotice: "无法取得原图。使用当前预览图编辑可能降低画质。",
			choosePreviewEdit: "明确使用预览图",
			submitImageEdit: "提交图片编辑请求",
			cancelImageEdit: "取消编辑",
			editFrom: "编辑 {source}，使用 {count} 张参考图",
			retryImageEdit: "检查后重试",
			imageRequestUncertain: "请求结果尚未确认。请先检查会话，避免重复提交。",
			imageInputRecovery: "请重新选择当前会话中可访问的图片后重试。",
			imageStorageRecovery: "图片保存失败，请先检查本地存储后再试。",
			imageUnknownFailure: "图片操作失败，请先查看会话记录再决定是否重试。",
			managementIntro: "查看用量、管理账号，并配置模型、网络与可选能力。",
			managementBadge: "管理中心",
			managementUnsaved: "设置尚未保存；账号和连接操作会单独立即执行。",
			managementOverview: "用量概览",
			managementOverviewDescription: "查看平台余额、本机用量，以及每个账号的 Codex 额度。",
			managementAccounts: "账号管理",
			managementAccountsTitle: "账号与额度",
			managementAccountDescription: "切换当前账号，并查看每个已保存账号的 Codex 额度。",
			managementModelsDescription: "选择要显示的 Codex 模型，并设置上下文预算。",
			managementNetworkDescription: "查看当前连接，并配置自动检测或手动代理。",
			managementCapabilitiesDescription: "按需启用搜索、图片、自动评审等扩展能力。",
			managementGlobalModels: "全局模型设置",
			managementModelScope: "以下设置控制 Codex 路由的模型显示范围与预算，不会选择或切换当前对话使用的模型。各账号的访问权限和上限可能不同。",
			managementAccountCatalog: "按账号查看模型",
			managementAccountCatalogHelp: "预览不会切换默认账号，也不会发送推理请求；不影响下方的设置草稿。",
			managementPreviewAccount: "预览账号",
			managementCatalogLogin: "请先在“账号管理”中登录，再查看各账号的模型权限。",
			managementCatalogEmpty: "此目录暂无可用模型。",
			managementCatalogFailed: "无法读取此账号的模型目录。可直接重试，无需切换账号。",
			managementCatalogRetry: "重试读取",
			managementModelAvailable: "已列出",
			managementModelUnavailable: "不可用",
			managementModelUnavailableReason: "此账号已不再列出该模型。保留最后的模型信息，但推理请求会在本地阻止。请刷新目录，或选择其他模型、账号。"
		};
		//#endregion
		//#region src/client/locales.ts
		/** English copy for the OpenAI Codex Plugin configuration card. */
		const en = {
			...usageEn,
			...managementEn,
			...featureEn,
			title: "Codex Connect",
			modelsProviderName: "Openai-Codex",
			modelsProviderSupport: "Powered by the Codex Connect plugin.",
			intro: "Use your ChatGPT subscription in dsh, with optional GPT Image generation and no API key.",
			accountHeading: "ChatGPT account",
			manageAccount: "Manage",
			manageAccounts: "Manage accounts",
			hideAccounts: "Hide accounts",
			addAccount: "Add account",
			savedAccounts: "Saved accounts",
			defaultAccountDetail: "Default account (image generation, search and auto review)",
			savedAccountDetail: "Saved account",
			useAccount: "Make default",
			usingAccount: "Default",
			removeAccount: "Remove",
			signOutAll: "Sign out all accounts",
			activeAccountHelp: "Chat requests use the account of the model route you pick. This default account serves image generation, search and auto review.",
			addingAccountKeepsCurrent: "Browser authorization is still pending. The default account remains selected for new requests.",
			removeAccountTitle: "Remove “{name}”?",
			removeAccountCopy: "Its local authorization credential will be deleted. Other accounts are not signed out.",
			removeActiveAccountCopy: "Its local authorization credential will be deleted and “{name}” will become the current account.",
			removeLastAccountCopy: "This is the last saved account. Removing it signs Codex Connect out.",
			cancel: "Cancel",
			confirmRemove: "Confirm removal",
			authorize: "Authorize",
			continueAuthorization: "Continue authorization",
			reauthorize: "Reauthorize",
			viewQuota: "View quota",
			hideQuota: "Hide quota",
			moreSettings: "More settings",
			moreSettingsTitle: "Codex Connect settings",
			closeSettings: "Close",
			settingsSaveHint: "Save applies changes to both settings entries. Closing discards unsaved changes.",
			reopenAuthorization: "Reopen authorization",
			cancelSignIn: "Cancel sign-in",
			authorizationHelp: "You can reopen the authorization page or cancel and start again. Cancelling does not sign out an existing account.",
			manualCallbackToggle: "Finish authorization with a callback URL",
			manualCallbackHelp: "Using a browser on another device? After ChatGPT authorization, a localhost connection error is expected because DSH runs elsewhere. Copy the full URL from that browser’s address bar and paste it here, including the entire query string. If you returned to this page, use Continue authorization (or Reopen authorization) to rejoin the pending sign-in.",
			manualCallbackPrivacy: "This URL contains temporary sign-in secrets. Submit it only here; do not share it in chat, logs, or screenshots. The input is cleared after submission and is not saved.",
			manualCallbackLabel: "Full callback URL",
			manualCallbackSubmit: "Submit callback URL",
			callbackAccepted: "Callback accepted. Waiting for authorization to finish…",
			callbackInvalid: "The callback URL or authorization state is invalid. Copy the full URL from the current authorization and try again.",
			callbackNoPending: "No authorization is pending. Continue authorization or start sign-in again.",
			callbackFailed: "The callback could not be submitted. Try again or continue authorization.",
			callbackUnconfirmed: "The submission timed out and may have been accepted. Continuing to check authorization status…",
			modelsAccountHelp: "Proxy, model visibility, search and image options remain in Settings → Codex Connect, or open them here:",
			expand: "Expand settings",
			collapse: "Collapse settings",
			loadingAccount: "Loading account…",
			signedOut: "Not signed in",
			signingIn: "Waiting for browser authorization…",
			signedIn: "Signed in",
			reauthRequired: "Sign in again",
			login: "Sign in with ChatGPT",
			loginAgain: "Sign in again",
			logout: "Sign out",
			working: "Working…",
			retry: "Retry",
			popupBlocked: "The browser blocked the sign-in window. Allow pop-ups for this dsh page and retry.",
			popupBlockedFallback: "The sign-in window could not be opened automatically. Use the link below to continue in your browser.",
			openLoginInBrowser: "Open ChatGPT sign-in page",
			usageLimits: "Usage limits",
			fiveHourLimit: "5-hour limit",
			weeklyLimit: "Weekly limit",
			hourLimit: "{count}-hour limit",
			usageWindow: "Usage window",
			percentRemaining: "{percent}% remaining",
			resetAt: "Resets {time}",
			resetUnavailable: "Reset time unavailable",
			resetCardsHeading: "Reset cards",
			resetCardsAvailable: "{count} reset card(s) available",
			accountUsageHeading: "Account usage",
			usageNoData: "No figure reported",
			resetCardUnnamed: "Reset card",
			resetCardExpiry: "Expires {time}",
			resetCardNoExpiry: "No expiry",
			usageUpdatedAt: "Updated {time}",
			usagePanelTitle: "Quota & usage",
			close: "Close",
			/** Locale handed to `Intl`, so dates follow the interface language, not the browser's. */
			dateLocale: "en",
			fastModeEnabledTitle: "Current: 1.5× speed, with faster quota consumption. Click to switch to Standard speed.",
			fastModeDisabledTitle: "Current: Standard speed. Click to enable 1.5× speed.",
			fastModeLoadingTitle: "Fast Mode state is loading for this conversation.",
			fastModeUnavailableTitle: "Fast Mode is unavailable for this conversation.",
			monthlyLimit: "Monthly credit limit",
			exactRemaining: "{remaining} of {limit} credits remaining",
			credits: "Credits",
			unlimited: "Unlimited",
			available: "Available",
			quotaUnavailable: "Usage limits are temporarily unavailable.",
			usageOpenPanel: "View in Quota & Usage",
			requestFailed: "The OpenAI Codex account request failed.",
			remoteOriginTitle: "Remote browser origin is not trusted",
			remoteOriginDescription: "Codex Connect accepts browser OAuth requests only from trusted local pages or origins explicitly approved by the device owner.",
			remoteOriginCommandHelp: "Run this command manually on the device that runs DSH, then reload this page. This page never runs it:",
			remoteOriginCopy: "Copy trust command",
			remoteOriginCopied: "Copied",
			remoteOriginCopyFailed: "Copy was unavailable. Copy the command manually.",
			configurationHeading: "Codex Connect configuration",
			settingsModules: "Settings modules",
			accountModule: "Account & quota",
			accountModuleSummary: "Status: {status}",
			modelsModule: "Models",
			networkModule: "Network",
			capabilitiesModule: "Capabilities",
			modelsModuleDefault: "All catalog models",
			modelsModuleSelected: "{count} model(s) shown",
			networkModuleDirect: "Direct connection",
			networkModuleProxy: "Proxy enabled",
			capabilitiesModuleEnabled: "{count} enabled",
			modelCatalog: "Models shown in the selector",
			modelCatalogIntro: "Choose which Codex models appear in model selectors. Existing conversations can continue using a hidden model.",
			modelCatalogLoading: "Loading available models…",
			modelCatalogFailed: "Available models could not be loaded.",
			catalogSourceLive: "Live from ChatGPT",
			catalogSourceCache: "ChatGPT cache",
			catalogSourceCliCache: "Codex CLI cache",
			catalogSourceBundled: "Bundled catalog",
			catalogUpdatedAt: "Updated {time}",
			catalogUpdatedNever: "Never updated from ChatGPT",
			catalogRefresh: "Refresh from ChatGPT",
			catalogRefreshing: "Refreshing…",
			catalogRefreshFailed: "The refresh failed. The current catalog is unchanged.",
			catalogUnavailableModels: "Reported but not enabled: {models}",
			contextModeLabel: "Context window",
			contextModeDefault: "Default",
			contextModeExtended: "Extended (maximum)",
			contextModeHelp: "Default advertises the server default budget; Extended advertises the server maximum. A per-model override still wins.",
			debugPayloadFields: "Log payload field names",
			debugPayloadFieldsHelp: "Development only: writes the field names of each Codex request to the plugin log. It never records request or response content.",
			modelContext: "Context",
			contextDefault: "Catalog default",
			contextCustom: "Custom",
			contextAdjust: "Adjust",
			contextHide: "Hide adjustment",
			contextTokens: "Context length",
			contextReset: "Restore default",
			contextSlider: "Adjust context budget",
			contextMaximum: "Configuration limit",
			contextLimitSource: "Source: official Codex configuration catalog (2026-09-05)",
			contextLimitFallback: "No higher configuration limit confirmed; capped at the installed catalog default.",
			contextAboveDefault: "Above the catalog default: larger requests may consume more quota or be rejected by your account or route. This plugin has not capacity-tested this range.",
			contextWarning: "Context overrides change client budgeting, not server capacity. An excessive value can cause requests to fail. Hiding a model keeps its budget. Changes apply after Save.",
			contextInvalid: "Enter a whole-number budget within the model’s configuration range, or choose Restore default.",
			maxTokensLabel: "Maximum output tokens",
			maxTokensDefault: "Catalog default",
			maxTokensHelp: "Output caps set the request default DSH reports for the model. They do not change the context length or the server’s actual capability. Changes apply after Save.",
			maxTokensInvalid: "Enter a whole-number output cap within the model’s configuration range, or choose Restore default.",
			capabilitiesHeading: "Optional capabilities",
			capabilitiesIntro: "Choose which extra Codex capabilities this dsh profile may register.",
			networkHeading: "Network connection",
			networkIntro: "Codex Connect uses a direct connection by default. When needed, detect a local proxy or enter one manually.",
			currentConnection: "Current connection",
			proxyEnabled: "Proxy enabled",
			directConnection: "Direct connection",
			directConnectionDescription: "Codex Connect does not use a dedicated proxy.",
			checkCurrentConnection: "Check current connection",
			checkingCurrentConnectionButton: "Checking…",
			checkingCurrentConnection: "Checking the saved proxy…",
			currentConnectionHealthy: "Connection is available.",
			currentConnectionFailed: "The saved proxy could not reach the Codex endpoint.",
			changeConnection: "Change connection",
			proxyConfigurationMethod: "Proxy configuration method",
			automaticDetection: "Automatic detection",
			manualEntry: "Manual entry",
			automaticDetectionHelp: "Checks common local proxy ports and environment variables without changing the saved connection.",
			scanLocalProxy: "Scan local proxies",
			manualProxyHelp: "Enter an HTTP(S) proxy address without credentials, a path, query, or fragment.",
			proxyCandidateHealthy: "Connection available",
			currentProxy: "Currently used",
			selectedProxy: "Selected",
			proxyDetectionFailedTitle: "No available proxy found",
			pendingProxy: "After saving, Codex Connect will use {proxyUrl}.",
			pendingDirect: "After saving, Codex Connect will stop using the proxy and connect directly.",
			customProxyActive: "Custom proxy selected: {proxyUrl}",
			detectProxy: "Detect proxy",
			detectingProxy: "Detecting…",
			configureProxyManually: "Configure manually",
			disableProxy: "Disable proxy",
			proxyCandidatesFound: "Working proxy candidates found. Choose one to stage it for activation.",
			keepDirectConnection: "Keep direct connection",
			useThisProxy: "Use this proxy",
			proxyDetectionFailed: "No working proxy candidate was found. Check DNS, connection refused, timeout, TLS, or proxy authentication errors, then try again.",
			proxyAddress: "Custom proxy address",
			testProxy: "Test proxy",
			testingProxy: "Testing…",
			proxyTestSucceeded: "Proxy reached the Codex endpoint (HTTP {status}).",
			proxyTestFailed: "Proxy test failed: {reason}.",
			proxyTestRequired: "Test this exact proxy address successfully before activation.",
			invalidProxyUrl: "Enter an HTTP(S) proxy origin without credentials or a path.",
			enableSearch: "Enable Codex search provider",
			enableSearchHelp: "Registers OpenAI Codex without changing the search route. Choose OpenAI Codex under Settings → Web search and fetch.",
			searchModel: "Search model",
			searchMode: "Web access",
			modeCached: "Cached",
			modeIndexed: "Indexed",
			modeLive: "Live web",
			searchContextSize: "Search context",
			contextLow: "Low",
			contextMedium: "Medium",
			contextHigh: "High",
			searchMaxOutputTokens: "Maximum search output tokens",
			residencyHeading: "Model transport",
			residencyLabel: "Resident WebSocket connections",
			residencyHelp: "Keep one Codex WebSocket per active conversation so later turns continue on the same connection. 0 sends every model request as a finite stream. Title, compaction, auto-review, and subagent requests always stream and never hold a connection.",
			residencyInvalid: "Enter a whole number from 0 to {max}.",
			enableImageTool: "Enable view_image tool",
			enableImageToolHelp: "Allows approved local reads and public-network image fetches for vision-capable models.",
			enableImageGeneration: "Enable GPT Image generation",
			enableImageGenerationHelp: "Let GPT models use GPT Image to generate images in conversations.",
			imageModelHint: "Image route model hint",
			imageModelHintDefault: "Default: gpt-image-2; clear to restore",
			imageModelHintHelp: "Optional unverified route hint; it may be ignored or rejected and does not guarantee the returned model.",
			invalidImageModelHint: "Use an empty value or 1–128 ASCII letters, digits, dots, underscores, or hyphens, starting with a letter or digit.",
			enableAutoReview: "Codex Auto-review (Approve for me)",
			enableAutoReviewHelp: "Send eligible approval requests from OpenAI-Codex sessions to a separate Codex reviewer. This changes who reviews; it does not expand DSH file, network, or tool permissions.",
			autoReviewOfficialBadge: "Official Codex capability",
			autoReviewDetails: "What is sent and how failures are handled",
			autoReviewDisclosure: "Review requests send recent conversation text, relevant tool calls and results, tool arguments, the working directory, and the planned action to chatgpt.com. Hidden reasoning and stored credentials are not sent.",
			autoReviewFailureDisclosure: "If the reviewer cannot complete, DSH keeps human approval. An explicit denial blocks the action.",
			autoReviewOfficialDocs: "OpenAI Auto-review documentation",
			autoReviewConfirmTitle: "Enable Codex Auto-review?",
			autoReviewCancel: "Cancel",
			autoReviewConfirm: "Confirm",
			generating: "Generating image",
			generatingDetail: "Image generation is in progress. Stopping cancels the current turn.",
			cancelGeneration: "Stop this turn",
			cancelingGeneration: "Stopping…",
			promptLabel: "Prompt used for image generation",
			copyPrompt: "Copy prompt",
			promptCopied: "Copied",
			promptCopyFailed: "Copy unavailable",
			completed: "Image generated",
			retryGeneration: "Try again",
			regenerate: "Generate another",
			editImage: "Modify this image",
			retryRequest: "Retry the previous image generation.",
			regenerateRequest: "Generate another image with the previous image prompt unchanged.",
			editRequest: "Continue from the previous image. Ask me what I want to change before generating a new image.",
			actionSending: "Sending…",
			actionFailed: "The follow-up request could not be sent.",
			failed: "Image generation failed",
			canceled: "Image generation canceled",
			canceledDetail: "Local waiting stopped. The request may still be processing.",
			unknownResult: "The image result could not be displayed safely.",
			imagePreviewUnavailable: "Preview unavailable; the original was saved. Download it or continue editing without generating again just to restore the preview.",
			imageDetails: "Image details",
			imageDetail: "{name}: {format} · {width} × {height} · {size}",
			originalImageDetail: "Original {name}: {format} · {width} × {height} · {size}",
			previewImageDetail: "Conversation preview: {format} · {width} × {height} · {size}",
			download: "Download",
			downloadNamed: "Download {name}",
			downloadOriginal: "Download original",
			downloadOriginalNamed: "Download original {name}",
			downloadPreview: "Download preview",
			downloadPreviewNamed: "Download preview {name}",
			downloading: "Downloading…",
			downloadFailed: "Download failed. Retry",
			image: "Generated image",
			open: "Open image preview",
			openNamed: "Open {name}",
			loading: "Loading image",
			loadFailed: "Image could not be loaded. Retry",
			lightboxDialog: "Image preview",
			lightboxClose: "Close image preview",
			lightboxZoomIn: "Zoom in",
			lightboxZoomOut: "Zoom out",
			lightboxReset: "Fit image",
			routingNote: "These settings never change the default model. Codex Search temporarily owns the profile-wide search route while enabled.",
			settingsLoading: "Loading plugin settings…",
			settingsUnavailable: "Plugin settings are unavailable in this dsh profile.",
			settingsReadOnly: "This profile exposes plugin settings as read-only.",
			invalidSearchModel: "Enter a search model.",
			invalidSearchTokens: "Maximum search output tokens must be a positive whole number.",
			save: "Save changes",
			saving: "Saving…",
			discard: "Discard",
			settingsSaved: "Saved",
			settingsSaveFailed: "The settings could not be saved. Your unsaved changes are still available; retry or discard them.",
			updateHeading: "Codex Connect updates",
			compatibilityPluginUpdateTitle: "Update Codex Connect first",
			compatibilityPluginUpdateBody: "Your installed plugin is not verified with this DSH version, but the latest plugin is. Update the plugin before DSH.",
			compatibilityPluginSame: "Codex Connect: {version} · Up to date",
			compatibilityPluginDifferent: "Codex Connect: Current {current} · Latest {latest}",
			compatibilityPluginCurrentOnly: "Codex Connect: Current {current} · Latest version unavailable",
			currentVersion: "Current version: {version}",
			checkForUpdates: "Check for updates",
			updateLastChecked: "Last checked: {time}",
			checkingForUpdates: "Checking for updates…",
			upToDate: "You are using the latest available version ({version}).",
			updateCheckUnavailable: "Update information is unavailable right now. Check again later.",
			newVersionAvailable: "New version available: {version}",
			whatMatters: "What matters for you",
			versionSummary: "Current {current} · {count} published release(s) behind",
			versionSummaryUnknown: "Current {current} · release gap unavailable",
			versionsBehind: "{count} published release(s) behind your current version.",
			versionsBehindUnknown: "The number of releases between these versions is unavailable.",
			noCuratedHighlights: "No user-facing highlights were provided. See the full release notes for technical details.",
			updateHighlightTrustedOrigins: "Remote browser access can now be explicitly trusted for a LAN setup.",
			updateHighlightRuntimeCompatibility: "Added a compatibility check and diagnostics so you can see whether the DSH and Node versions are supported.",
			updateHighlightQuotaFastMode: "Added per-conversation Fast Mode and GPT quota/reset indicators in the Composer.",
			updateHighlightDshRc7: "Added compatibility with DSH rc.7 plugin slots and a clearer runtime compatibility check.",
			updateHighlightSearchStability: "Improved search-session stability so new search records remain readable after restarts.",
			updateHighlightImageGeneration: "Added optional GPT Image generation in the Codex Connect settings and a preview card in the conversation.",
			updateHighlightOauthHistory: "Added safer session-history migration and a sign-in fallback when the account needs to reconnect.",
			updateHighlightModelVisibility: "You can now choose which Codex models appear in model selectors.",
			updateHighlightProxyConnection: "Added opt-in Codex proxy detection with explicit confirmation and a visible direct-connection fallback.",
			updateHighlightModelsAccount: "Added an Openai-Codex account card in Models settings for authorization, quota, and shared plugin settings.",
			updateHighlightContextBudget: "Added bounded per-model context budget controls while preserving each catalog default until you save an override.",
			updateHighlightAutoReviewProbe: "Added an explicit, synthetic probe for checking whether the hidden Codex approval reviewer is available without enabling it.",
			updateHighlightAutoReview: "Added optional Codex Auto-review for eligible Harness approvals, with first-use disclosure, fail-closed human fallback, and an exact-retry override.",
			updateHighlightAstraCompatibility: "Added GPT-6-Astra compatibility metadata when the installed upstream catalog does not provide the model.",
			updateHighlightMultiAccount: "Added management for multiple ChatGPT accounts; starting or cancelling authorization preserves existing accounts.",
			updateHighlightSearchRoute: "Codex Search registers a provider. The profile-wide search route is selected in Web Search settings.",
			updateHighlightImageModelHint: "Added an optional profile-scoped image route model hint. It is unverified, may be ignored or rejected, and does not guarantee the returned model.",
			viewTechnicalDetails: "View technical details",
			hideTechnicalDetails: "Hide technical details",
			technicalDetailsHeading: "Technical changes",
			viewGithubLink: "View GitHub link",
			viewFullChangelog: "View full changelog",
			viewReleaseNotes: "View update notes",
			hideReleaseNotes: "Hide update notes",
			releaseNotesUnavailable: "Release notes are available on the release page.",
			openReleasePage: "Open release page",
			copyForAgent: "Copy for Agent",
			agentPromptCopied: "Agent prompt copied",
			agentPromptCopyFailed: "Copy was unavailable. Copy the Agent prompt manually.",
			agentUpgradePrompt: "Please open this project, check its latest version, and install or update the corresponding plugin in the current DSH Web profile: {repository}",
			agentUpgradeHelp: "Copy this short request to your Agent. It can inspect the project instructions and choose the appropriate install or update method.",
			agentUpgradeFinish: "After the Agent reports completion, return here and check the installed version again.",
			upgradeStepsHeading: "How to upgrade",
			recheckAfterUpgrade: "Done — check again",
			recheckingAfterUpgrade: "Checking after upgrade…",
			upgradeStillAvailable: "The running DSH Web process still reports {version}. Restart it, then check again.",
			upgradeCheckSuccess: "The plugin is up to date. Refresh this page if the interface does not reload.",
			dismissUpdate: "Later"
		};
		/** Chinese copy for the OpenAI Codex Plugin configuration card. */
		const zh = {
			...usageZh,
			...managementZh,
			...featureZh,
			title: "Codex Connect",
			modelsProviderName: "Openai-Codex",
			modelsProviderSupport: "由 Codex Connect 插件提供支持。",
			intro: "使用 ChatGPT 订阅在 dsh 中调用模型，并可使用 GPT Image 生成图片，无需 API Key。",
			accountHeading: "ChatGPT 账户",
			manageAccount: "管理",
			manageAccounts: "管理账户",
			hideAccounts: "收起账户",
			addAccount: "添加账户",
			savedAccounts: "已保存账户",
			defaultAccountDetail: "默认账户（图片生成、搜索与自动评审使用）",
			savedAccountDetail: "已保存账户",
			useAccount: "设为默认账户",
			usingAccount: "默认账户",
			removeAccount: "移除",
			signOutAll: "退出所有账户",
			activeAccountHelp: "对话用哪个账号，由你在模型选择器里选中的路由决定；这里的默认账户用于图片生成、网页搜索与自动评审。",
			addingAccountKeepsCurrent: "浏览器授权尚未完成。新请求仍会继续使用默认账户。",
			removeAccountTitle: "移除“{name}”？",
			removeAccountCopy: "该账户的本地授权凭据将被删除，不会退出其他账户。",
			removeActiveAccountCopy: "该账户的本地授权凭据将被删除，并切换到“{name}”。",
			removeLastAccountCopy: "这是最后一个已保存账户；移除后 Codex Connect 将退出登录。",
			cancel: "取消",
			confirmRemove: "确认移除",
			authorize: "授权",
			continueAuthorization: "继续授权",
			reauthorize: "重新授权",
			viewQuota: "查看额度",
			hideQuota: "收起额度",
			moreSettings: "更多设置",
			moreSettingsTitle: "Codex Connect 设置",
			closeSettings: "关闭",
			settingsSaveHint: "保存后两处设置同步生效；关闭将放弃未保存的修改。",
			reopenAuthorization: "重新打开授权",
			cancelSignIn: "取消登录",
			authorizationHelp: "可以重新打开授权页，或取消后重试。取消登录不会退出已有账户。",
			manualCallbackToggle: "使用回调 URL 完成授权",
			manualCallbackHelp: "浏览器与 DSH 不在同一台设备上？完成 ChatGPT 授权后，浏览器可能提示 localhost 连接失败，这是因为 DSH 在另一台设备上运行。请复制该浏览器地址栏中的完整 URL（包括全部查询参数），并粘贴到这里。如果重新回到此页面，可点击“继续授权”或“重新打开授权”接续待完成的登录。",
			manualCallbackPrivacy: "此 URL 包含临时登录机密，只应提交到这里，请勿分享到聊天、日志或截图中。输入会在提交后清空，不会保存。",
			manualCallbackLabel: "完整回调 URL",
			manualCallbackSubmit: "提交回调 URL",
			callbackAccepted: "已接受回调，正在等待授权完成…",
			callbackInvalid: "回调 URL 或授权状态无效。请复制当前授权的完整 URL 后重试。",
			callbackNoPending: "当前没有待完成的授权，请继续授权或重新登录。",
			callbackFailed: "无法提交回调，请重试或继续授权。",
			callbackUnconfirmed: "提交超时，但可能已被接受。正在继续检查授权状态…",
			modelsAccountHelp: "代理、模型显示、搜索和图片选项仍可在“设置 → Codex Connect”中管理，也可直接打开：",
			expand: "展开设置",
			collapse: "折叠设置",
			loadingAccount: "正在加载账户信息…",
			signedOut: "尚未登录",
			signingIn: "正在等待浏览器授权…",
			signedIn: "已登录",
			reauthRequired: "需要重新登录",
			login: "使用 ChatGPT 登录",
			loginAgain: "重新登录",
			logout: "退出登录",
			working: "处理中…",
			retry: "重试",
			popupBlocked: "浏览器阻止了登录窗口。请允许此 dsh 页面弹出窗口后重试。",
			popupBlockedFallback: "无法自动打开登录窗口。请使用下面的链接在浏览器中继续登录。",
			openLoginInBrowser: "打开 ChatGPT 登录页面",
			usageLimits: "使用额度",
			fiveHourLimit: "5 小时额度",
			weeklyLimit: "每周额度",
			hourLimit: "{count} 小时额度",
			usageWindow: "使用额度",
			percentRemaining: "剩余 {percent}%",
			resetAt: "{time} 重置",
			resetUnavailable: "重置时间不可用",
			resetCardsHeading: "重置卡",
			resetCardsAvailable: "可用 {count} 张重置卡",
			accountUsageHeading: "账号用量",
			usageNoData: "暂无数据",
			resetCardUnnamed: "重置卡",
			resetCardExpiry: "{time} 到期",
			resetCardNoExpiry: "无到期时间",
			usageUpdatedAt: "更新于 {time}",
			usagePanelTitle: "额度与用量",
			close: "关闭",
			/** Locale handed to `Intl`, so dates follow the interface language, not the browser's. */
			dateLocale: "zh-CN",
			fastModeEnabledTitle: "当前：1.5 倍速度，额度消耗更快。点击切换到标准速度",
			fastModeDisabledTitle: "当前：标准速度。点击开启 1.5 倍速度",
			fastModeLoadingTitle: "正在加载此对话的 Fast Mode 状态。",
			fastModeUnavailableTitle: "此对话暂时无法使用 Fast Mode。",
			monthlyLimit: "每月信用额度",
			exactRemaining: "剩余 {remaining} / {limit} credits",
			credits: "Credits",
			unlimited: "无限",
			available: "可用",
			quotaUnavailable: "暂时无法获取使用额度。",
			usageOpenPanel: "在额度与用量里查看",
			requestFailed: "OpenAI Codex 账户请求失败。",
			remoteOriginTitle: "未信任远程浏览器 origin",
			remoteOriginDescription: "Codex Connect 只接受来自本机页面或设备所有者明确批准的 origin 的浏览器 OAuth 请求。",
			remoteOriginCommandHelp: "请在运行 DSH 的设备上手动执行下面的服务器命令，然后重新加载此页面。本页面不会自动执行：",
			remoteOriginCopy: "复制授权命令",
			remoteOriginCopied: "已复制",
			remoteOriginCopyFailed: "当前无法访问剪贴板，请手动复制命令。",
			configurationHeading: "Codex Connect 配置",
			settingsModules: "设置模块",
			accountModule: "账户与额度",
			accountModuleSummary: "状态：{status}",
			modelsModule: "模型",
			networkModule: "网络",
			capabilitiesModule: "能力",
			modelsModuleDefault: "显示全部目录模型",
			modelsModuleSelected: "已显示 {count} 个模型",
			networkModuleDirect: "当前直连",
			networkModuleProxy: "已启用代理",
			capabilitiesModuleEnabled: "已启用 {count} 项",
			modelCatalog: "模型选择器中显示的模型",
			modelCatalogIntro: "选择要在模型选择器中显示的 Codex 模型；隐藏模型后，已有会话仍可继续使用。",
			modelCatalogLoading: "正在加载可用模型…",
			modelCatalogFailed: "无法加载可用模型。",
			catalogSourceLive: "来自 ChatGPT 实时",
			catalogSourceCache: "ChatGPT 缓存",
			catalogSourceCliCache: "Codex CLI 缓存",
			catalogSourceBundled: "插件内置目录",
			catalogUpdatedAt: "更新于 {time}",
			catalogUpdatedNever: "尚未从 ChatGPT 更新",
			catalogRefresh: "从 ChatGPT 刷新",
			catalogRefreshing: "正在刷新…",
			catalogRefreshFailed: "刷新失败，当前目录保持不变。",
			catalogUnavailableModels: "服务端已公布但未启用：{models}",
			contextModeLabel: "上下文窗口",
			contextModeDefault: "默认",
			contextModeExtended: "扩展（最大值）",
			contextModeHelp: "“默认”使用服务端默认预算，“扩展”使用服务端最大值；逐模型覆盖仍优先。",
			debugPayloadFields: "记录请求字段名",
			debugPayloadFieldsHelp: "仅用于开发：把每次 Codex 请求的字段名写入插件日志，不记录请求或响应内容。",
			modelContext: "上下文",
			contextDefault: "目录默认",
			contextCustom: "自定义",
			contextAdjust: "调整",
			contextHide: "收起调整",
			contextTokens: "上下文长度",
			contextReset: "恢复默认",
			contextSlider: "调整上下文预算",
			contextMaximum: "配置上限",
			contextLimitSource: "依据：Codex 官方配置目录（2026-09-05）",
			contextLimitFallback: "尚未确认更高配置上限，暂以已安装目录的默认值为上限。",
			contextAboveDefault: "已超过目录默认值：请求可能消耗更多额度，或被当前账号、通道拒绝。本插件未对该范围进行容量实测。",
			contextWarning: "调整的是本地上下文预算，不会扩大服务端容量；设置过高可能导致请求失败。隐藏模型会保留其预算，修改在保存后生效。",
			contextInvalid: "请输入模型配置范围内的整数预算，或点击“恢复默认”。",
			maxTokensLabel: "最大输出 Tokens",
			maxTokensDefault: "目录默认",
			maxTokensHelp: "输出上限会设置 DSH 为该模型上报的请求默认输出上限，不会改变上下文长度或服务端实际能力。修改在保存后生效。",
			maxTokensInvalid: "请输入模型配置范围内的整数输出上限，或点击“恢复默认”。",
			capabilitiesHeading: "可选能力",
			capabilitiesIntro: "选择允许此 dsh profile 注册哪些额外的 Codex 能力。",
			networkHeading: "网络连接",
			networkIntro: "Codex Connect 默认直连。需要代理时，可以自动检测或手动输入地址。",
			currentConnection: "当前连接",
			proxyEnabled: "代理已启用",
			directConnection: "直连",
			directConnectionDescription: "不经过 Codex Connect 专用代理。",
			checkCurrentConnection: "检查当前连接",
			checkingCurrentConnectionButton: "检查中…",
			checkingCurrentConnection: "正在检查已保存的代理…",
			currentConnectionHealthy: "连接正常。",
			currentConnectionFailed: "已保存的代理无法到达 Codex 端点。",
			changeConnection: "更改连接",
			proxyConfigurationMethod: "代理配置方式",
			automaticDetection: "自动检测",
			manualEntry: "手动输入",
			automaticDetectionHelp: "检测本机常见代理端口和环境变量，不会修改当前设置。",
			scanLocalProxy: "扫描本机代理",
			manualProxyHelp: "输入不含账号、密码、路径、查询参数或片段的 HTTP(S) 代理地址。",
			proxyCandidateHealthy: "连接正常",
			currentProxy: "当前使用",
			selectedProxy: "已选择",
			proxyDetectionFailedTitle: "未发现可用代理",
			pendingProxy: "保存后将使用代理 {proxyUrl}。",
			pendingDirect: "保存后将停用代理并改为直连。",
			customProxyActive: "已选择自定义代理：{proxyUrl}",
			detectProxy: "检测代理",
			detectingProxy: "正在检测…",
			configureProxyManually: "手动配置",
			disableProxy: "停用代理",
			proxyCandidatesFound: "找到了可用的代理候选地址。请选择一个，将其暂存以便启用。",
			keepDirectConnection: "保持直连",
			useThisProxy: "使用此代理",
			proxyDetectionFailed: "没有找到可用代理。请检查 DNS、连接被拒绝、超时、TLS 或代理认证错误后重试。",
			proxyAddress: "自定义代理地址",
			testProxy: "测试代理",
			testingProxy: "正在测试…",
			proxyTestSucceeded: "代理已到达 Codex 端点（HTTP {status}）。",
			proxyTestFailed: "代理测试失败：{reason}。",
			proxyTestRequired: "启用前必须先成功测试当前这个代理地址。",
			invalidProxyUrl: "请输入不含凭据或路径的 HTTP(S) 代理 origin。",
			enableSearch: "启用 Codex 搜索提供方",
			enableSearchHelp: "注册 OpenAI Codex，不改变当前搜索路由。请在“设置 → 网页搜索与获取”中选择 OpenAI Codex。",
			searchModel: "搜索模型",
			searchMode: "联网方式",
			modeCached: "缓存",
			modeIndexed: "索引",
			modeLive: "实时联网",
			searchContextSize: "搜索上下文",
			contextLow: "低",
			contextMedium: "中",
			contextHigh: "高",
			searchMaxOutputTokens: "搜索最大输出 Tokens",
			residencyHeading: "模型传输",
			residencyLabel: "WebSocket 续接连接数",
			residencyHelp: "为每个活跃会话保留一条 Codex WebSocket，让后续轮次在同一条连接上续接。填 0 时每个模型请求都使用流式响应；标题、压缩、自动审查和子代理请求始终使用流式响应，不占用连接。",
			residencyInvalid: "请输入 0 到 {max} 之间的整数。",
			enableImageTool: "启用 view_image 工具",
			enableImageToolHelp: "允许具备视觉能力的模型在审批后读取本地图片或获取公网图片。",
			enableImageGeneration: "启用 GPT Image 图片生成",
			enableImageGenerationHelp: "启用后，GPT 模型可以在对话中调用 GPT Image 生成图片。",
			imageModelHint: "图片路由模型提示",
			imageModelHintDefault: "默认：gpt-image-2；清空可恢复",
			imageModelHintHelp: "可选的未验证路由提示；服务端可能忽略或拒绝，不能保证返回的模型。",
			invalidImageModelHint: "请输入空值，或输入 1–128 个 ASCII 字母、数字、点、下划线或连字符，且必须以字母或数字开头。",
			enableAutoReview: "Codex 自动审查（代我审批）",
			enableAutoReviewHelp: "将 OpenAI-Codex 会话中原本需要你确认的部分操作交给独立的 Codex 审查器。它只更换审批者，不会扩大 DSH 的文件、网络或工具权限。",
			autoReviewOfficialBadge: "Codex 官方能力",
			autoReviewDetails: "了解发送内容与失败处理",
			autoReviewDisclosure: "审查时，近期对话、相关工具调用与结果、工具参数、工作目录和待执行动作会发送到 chatgpt.com；隐藏推理和已保存凭据不会发送。",
			autoReviewFailureDisclosure: "审查器无法完成时仍由你审批；明确拒绝的操作不会执行。",
			autoReviewOfficialDocs: "查看 OpenAI Auto-review 官方文档",
			autoReviewConfirmTitle: "启用 Codex 自动审查？",
			autoReviewCancel: "取消",
			autoReviewConfirm: "确认",
			generating: "正在生成图片",
			generatingDetail: "图片生成正在进行中。停止操作会取消当前回合。",
			cancelGeneration: "停止当前回合",
			cancelingGeneration: "正在停止…",
			promptLabel: "用于生成图片的提示词",
			copyPrompt: "复制提示词",
			promptCopied: "已复制",
			promptCopyFailed: "无法复制",
			completed: "图片已生成",
			retryGeneration: "再次尝试",
			regenerate: "再生成一张",
			editImage: "基于此图修改",
			retryRequest: "重试上一张图片生成。",
			regenerateRequest: "再生成一张，保持上一张图片的提示词不变。",
			editRequest: "基于上一张图片继续修改。请先询问我需要修改什么，再生成新图片。",
			actionSending: "正在发送…",
			actionFailed: "无法发送后续请求。",
			failed: "图片生成失败",
			canceled: "图片生成已取消",
			canceledDetail: "本地等待已停止，请求可能仍在处理中。",
			unknownResult: "无法安全显示这次图片结果。",
			imagePreviewUnavailable: "预览不可用，原图已保存。可下载原图或继续编辑，无需为恢复预览重新生成。",
			imageDetails: "图片详情",
			imageDetail: "{name}：{format} · {width} × {height} · {size}",
			originalImageDetail: "原图 {name}：{format} · {width} × {height} · {size}",
			previewImageDetail: "对话预览：{format} · {width} × {height} · {size}",
			download: "下载",
			downloadNamed: "下载 {name}",
			downloadOriginal: "下载原图",
			downloadOriginalNamed: "下载原图 {name}",
			downloadPreview: "下载预览图",
			downloadPreviewNamed: "下载预览图 {name}",
			downloading: "正在下载…",
			downloadFailed: "下载失败，重试",
			image: "生成的图片",
			open: "打开图片预览",
			openNamed: "打开 {name}",
			loading: "正在加载图片",
			loadFailed: "图片加载失败，重试",
			lightboxDialog: "图片预览",
			lightboxClose: "关闭图片预览",
			lightboxZoomIn: "放大",
			lightboxZoomOut: "缩小",
			lightboxReset: "适合窗口",
			routingNote: "这些设置绝不会改动默认模型。Codex 搜索启用期间会暂时接管整个 profile 的搜索路由。",
			settingsLoading: "正在加载插件设置…",
			settingsUnavailable: "此 dsh profile 无法使用插件设置。",
			settingsReadOnly: "此 profile 的插件设置为只读。",
			invalidSearchModel: "请输入搜索模型。",
			invalidSearchTokens: "搜索最大输出 Tokens 必须是正整数。",
			save: "保存更改",
			saving: "正在保存…",
			discard: "放弃更改",
			settingsSaved: "已保存",
			settingsSaveFailed: "无法保存设置。未保存的修改仍然保留，可以重试或放弃。",
			updateHeading: "Codex Connect 更新",
			compatibilityPluginUpdateTitle: "请先升级 Codex Connect",
			compatibilityPluginUpdateBody: "当前插件尚未通过该 DSH 版本的验证，但最新插件已经通过。请先升级插件，再升级 DSH。",
			compatibilityPluginSame: "Codex Connect：{version} · 已是最新",
			compatibilityPluginDifferent: "Codex Connect：当前 {current} · 最新 {latest}",
			compatibilityPluginCurrentOnly: "Codex Connect：当前 {current} · 无法取得最新版本",
			currentVersion: "当前版本：{version}",
			checkForUpdates: "检查更新",
			updateLastChecked: "上次检查：{time}",
			checkingForUpdates: "正在检查更新…",
			upToDate: "当前已经是最新可用版本（{version}）。",
			updateCheckUnavailable: "暂时无法取得更新信息，请稍后重新检查。",
			newVersionAvailable: "发现新版本：{version}",
			whatMatters: "这次更新对你有什么用",
			versionSummary: "当前版本 {current} · 相差 {count} 个已发布版本",
			versionSummaryUnknown: "当前版本 {current} · 暂时无法确定相差几个版本",
			versionsBehind: "你的当前版本落后 {count} 个已发布版本。",
			versionsBehindUnknown: "暂时无法确定这两个版本之间相差几个已发布版本。",
			noCuratedHighlights: "暂时没有整理好的用户功能摘要，可以打开完整技术说明查看发布内容。",
			updateHighlightTrustedOrigins: "局域网浏览器访问现在可以明确设置信任来源。",
			updateHighlightRuntimeCompatibility: "增加兼容性检查和诊断信息，方便确认当前 DSH 与 Node 版本是否受支持。",
			updateHighlightQuotaFastMode: "Composer 增加了按对话生效的 Fast Mode，以及 GPT 模型额度和重置时间提示。",
			updateHighlightDshRc7: "支持 DSH rc.7 的插件槽位，并提供更清楚的运行环境兼容性检查。",
			updateHighlightSearchStability: "改进搜索会话稳定性，重启后新写入的搜索记录仍能正常读取。",
			updateHighlightImageGeneration: "在 Codex Connect 设置中加入可选的 GPT Image 生图，并在对话里展示生成结果卡片。",
			updateHighlightOauthHistory: "增加更安全的会话历史迁移，并在账号需要重新登录时提供备用登录路径。",
			updateHighlightModelVisibility: "现在可以选择哪些 Codex 模型显示在模型选择菜单中。",
			updateHighlightProxyConnection: "增加可选的 Codex 代理检测，启用前需要明确确认，并始终保留直连回退入口。",
			updateHighlightModelsAccount: "在模型设置中增加 Openai-Codex 账户卡，用于授权、查看额度和打开共享插件设置。",
			updateHighlightContextBudget: "增加有范围限制的逐模型上下文预算设置；保存覆盖值前继续使用各模型的目录默认值。",
			updateHighlightAutoReviewProbe: "增加显式的合成探针，用于检查隐藏的 Codex 审批 reviewer 是否可用，但不会启用该能力。",
			updateHighlightAutoReview: "增加可选的 Codex 自动审查，用于符合条件的 Harness 审批；首次启用需确认告知，失败会回到人工审批，并支持一次完全相同的人工覆盖重试。",
			updateHighlightAstraCompatibility: "当已安装的上游模型目录尚未提供 GPT-6-Astra 时，补充该模型的兼容元数据。",
			updateHighlightMultiAccount: "增加多个 ChatGPT 账户的管理能力；开始或取消授权时会保留已有账户。",
			updateHighlightSearchRoute: "Codex 搜索会注册一个提供方。整个 profile 的搜索路由由网页搜索设置选择。",
			updateHighlightImageModelHint: "增加可选的 profile 图片路由模型提示。该提示未经验证，服务端可能忽略或拒绝，也不保证返回指定模型。",
			viewTechnicalDetails: "查看完整技术说明",
			hideTechnicalDetails: "收起技术说明",
			technicalDetailsHeading: "技术变更",
			viewGithubLink: "查看 GitHub 链接",
			viewFullChangelog: "查看完整变更记录",
			viewReleaseNotes: "查看更新说明",
			hideReleaseNotes: "收起更新说明",
			releaseNotesUnavailable: "完整更新说明可在发布页面查看。",
			openReleasePage: "打开发布页面",
			copyForAgent: "复制给 Agent",
			agentPromptCopied: "Agent 提示已复制",
			agentPromptCopyFailed: "当前无法访问剪贴板，请手动复制上面的 Agent 提示。",
			agentUpgradePrompt: "请到这个项目查看最新版本，并把对应插件安装或更新到当前 DSH Web profile：{repository}",
			agentUpgradeHelp: "把下面这段简短请求发给你的 Agent。它会查看项目说明，自行判断合适的安装或更新方式。",
			agentUpgradeFinish: "Agent 报告完成后，回到这里重新检查实际安装版本。",
			upgradeStepsHeading: "如何升级",
			recheckAfterUpgrade: "已完成，重新检查",
			recheckingAfterUpgrade: "正在检查升级结果…",
			upgradeStillAvailable: "当前运行中的 DSH Web 仍显示版本 {version}。请先重启它，再重新检查。",
			upgradeCheckSuccess: "插件已是最新版本。如果界面没有自动更新，请刷新页面。",
			dismissUpdate: "稍后提醒"
		};
		//#endregion
		//#region src/image-assets-contract.ts
		/** Same-origin endpoint serving one session-owned original generated image. */
		const OPENAI_CODEX_ORIGINAL_IMAGE_PATH = "/plugins/dsh-codex-connect/images/original";
		/** Opaque identifier format for one plugin-owned original image. */
		const OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN = /^img_[0-9a-f]{32}$/u;
		function positiveSafeInteger$1(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		/** Decode session-log metadata without trusting an asset id, filename, or media type. */
		function decodeOpenAICodexOriginalImageRef(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const candidate = value;
			if (typeof candidate.assetId !== "string" || !OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(candidate.assetId) || candidate.mediaType !== "image/png" && candidate.mediaType !== "image/jpeg" && candidate.mediaType !== "image/webp" || !positiveSafeInteger$1(candidate.width) || !positiveSafeInteger$1(candidate.height) || !positiveSafeInteger$1(candidate.bytes) || candidate.bytes > 48 * 1024 * 1024 || typeof candidate.name !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(candidate.name) || typeof candidate.sha256 !== "string" || !/^[0-9a-f]{64}$/u.test(candidate.sha256)) return void 0;
			return {
				assetId: candidate.assetId,
				mediaType: candidate.mediaType,
				width: candidate.width,
				height: candidate.height,
				bytes: candidate.bytes,
				name: candidate.name,
				sha256: candidate.sha256
			};
		}
		/** Build a same-origin URL without allowing either opaque id to become a path segment. */
		function openAICodexOriginalImageUrl(sessionId, assetId) {
			return `${OPENAI_CODEX_ORIGINAL_IMAGE_PATH}?${new URLSearchParams({
				sessionId,
				assetId
			}).toString()}`;
		}
		/** Decode an authenticated inventory response before offering its selections. */
		function decodeImageInventory(value) {
			const document = imageInputObject(value);
			if (document?.version !== 1 || !Array.isArray(document.items) || document.items.length > 256) return void 0;
			const items = [];
			for (const candidate of document.items) {
				const item = imageInputObject(candidate);
				const input = decodeImageInputRef(item?.input);
				if (item === void 0 || input === void 0 || typeof item.name !== "string" || item.name.length > 512 || !positive(item.width) || !positive(item.height) || item.source !== "original" && item.source !== "attachment" && item.source !== "preview") return void 0;
				if (item.source === "original" !== "assetId" in input) return void 0;
				if (item.source === "preview" && (!("usePreview" in input) || input.usePreview !== true)) return void 0;
				items.push({
					input,
					source: item.source,
					name: item.name,
					width: item.width,
					height: item.height
				});
			}
			return items;
		}
		function imageInputObject(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function positive(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		function identifier(value) {
			return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9:._-]{0,255}$/u.test(value);
		}
		function only(value, keys) {
			return Object.keys(value).every((key) => keys.includes(key));
		}
		/** Copy the exact published host reference vocabulary, including normalization metadata. */
		function decodeImageInputAttachment(value) {
			const ref = imageInputObject(value);
			if (ref === void 0 || !only(ref, [
				"attachmentId",
				"mediaType",
				"width",
				"height",
				"bytes",
				"name",
				"originalDimensions"
			]) || !identifier(ref.attachmentId) || ![
				"image/png",
				"image/jpeg",
				"image/webp"
			].includes(String(ref.mediaType)) || !positive(ref.width) || !positive(ref.height) || !positive(ref.bytes) || ref.name !== void 0 && (typeof ref.name !== "string" || ref.name.length < 1 || ref.name.length > 512)) return void 0;
			const dimensions = ref.originalDimensions === void 0 ? void 0 : imageInputObject(ref.originalDimensions);
			if (ref.originalDimensions !== void 0 && (dimensions === void 0 || !only(dimensions, ["width", "height"]) || !positive(dimensions.width) || !positive(dimensions.height))) return void 0;
			return {
				attachmentId: ref.attachmentId,
				mediaType: ref.mediaType,
				width: ref.width,
				height: ref.height,
				bytes: ref.bytes,
				...ref.name === void 0 ? {} : { name: ref.name },
				...dimensions === void 0 ? {} : { originalDimensions: {
					width: dimensions.width,
					height: dimensions.height
				} }
			};
		}
		/** Exactly one selector; a guessed ID or caller-provided metadata is not an authorization proof. */
		function decodeImageInputRef(value) {
			const ref = imageInputObject(value);
			if (ref === void 0) return void 0;
			if (typeof ref.assetId === "string" && OPENAI_CODEX_IMAGE_ASSET_ID_PATTERN.test(ref.assetId) && only(ref, ["assetId"])) return { assetId: ref.assetId };
			const preview = ref.usePreview === true ? { usePreview: true } : {};
			if (ref.usePreview !== void 0 && ref.usePreview !== true) return void 0;
			if (identifier(ref.attachmentId) && only(ref, ["attachmentId", "usePreview"])) return {
				attachmentId: ref.attachmentId,
				...preview
			};
			const attachment = decodeImageInputAttachment(ref.attachment);
			if (attachment !== void 0 && only(ref, ["attachment", "usePreview"])) return {
				attachment,
				...preview
			};
		}
		function decodeImageEditSources(value) {
			const candidate = imageInputObject(value);
			if (candidate === void 0 || !only(candidate, ["target", "references"])) return void 0;
			const target = decodeImageInputRef(candidate.target);
			if (target === void 0 || !Array.isArray(candidate.references) || candidate.references.length >= 5) return void 0;
			const references = [];
			for (const item of candidate.references) {
				const ref = imageInputObject(item);
				if (ref === void 0 || !only(ref, ["image", "purpose"]) || typeof ref.purpose !== "string" || ref.purpose.trim().length === 0 || ref.purpose.length > 512) return void 0;
				const image = decodeImageInputRef(ref.image);
				if (image === void 0) return void 0;
				references.push({
					image,
					purpose: ref.purpose.trim()
				});
			}
			return {
				target,
				references
			};
		}
		/** Preserve prompt-only calls; edit intent can never degrade to generation on invalid inputs. */
		function decodeImageToolRequest(value) {
			const request = imageInputObject(value);
			if (request === void 0 || typeof request.prompt !== "string") return void 0;
			const prompt = request.prompt.trim();
			if (prompt.length < 1 || prompt.length > 32e3) return void 0;
			if ((request.operation === void 0 || request.operation === "generate") && only(request, ["prompt", "operation"])) return {
				operation: "generate",
				prompt
			};
			if (request.operation !== "edit" || !only(request, [
				"operation",
				"prompt",
				"target",
				"references"
			])) return void 0;
			const edit = decodeImageEditSources({
				target: request.target,
				references: request.references === void 0 ? [] : request.references
			});
			return edit === void 0 ? void 0 : {
				operation: "edit",
				prompt,
				edit
			};
		}
		const IMAGE_INPUT_SCHEMA = {
			type: "object",
			additionalProperties: false,
			description: "Select exactly one: assetId for an original result, attachmentId from this session, or a complete attachment reference. For uploaded copies, including first/second attached image, copy the complete attachment reference from the adjacent handle line. A bare attachmentId shared with a generated result is ambiguous; assetId explicitly selects a stored original. usePreview=true is only for an explicitly chosen lower-resolution preview.",
			properties: {
				assetId: { type: "string" },
				attachmentId: { type: "string" },
				attachment: {
					type: "object",
					additionalProperties: false,
					properties: {
						attachmentId: {
							type: "string",
							required: true
						},
						mediaType: {
							type: "string",
							required: true,
							enum: [
								"image/png",
								"image/jpeg",
								"image/webp"
							]
						},
						width: {
							type: "integer",
							required: true
						},
						height: {
							type: "integer",
							required: true
						},
						bytes: {
							type: "integer",
							required: true
						},
						name: { type: "string" },
						originalDimensions: {
							type: "object",
							additionalProperties: false,
							properties: {
								width: {
									type: "integer",
									required: true
								},
								height: {
									type: "integer",
									required: true
								}
							}
						}
					}
				},
				usePreview: { type: "boolean" }
			}
		};
		const IMAGE_REFERENCES_SCHEMA = {
			type: "array",
			description: "Reference images only, kept in the same order the user specified; never place the edit target here.",
			items: {
				type: "object",
				additionalProperties: false,
				properties: {
					image: {
						...IMAGE_INPUT_SCHEMA,
						required: true
					},
					purpose: {
						type: "string",
						required: true,
						description: "What to borrow, such as colors or texture, without replacing the target."
					}
				}
			}
		};
		({ ...IMAGE_INPUT_SCHEMA }), { ...IMAGE_REFERENCES_SCHEMA };
		//#endregion
		//#region src/image-presentation.ts
		/** Stable metadata marker for generated image result views. */
		const IMAGE_PRESENTATION_KIND = "codex-connect-images";
		const IMAGE_EDIT_RESULT_PREFIX = "codex-connect-image-result-v2:";
		/** Original-only recovery when preview persistence failed, including nested PTC results. */
		const IMAGE_RECOVERY_RESULT_PREFIX = "codex-connect-image-result-v3:";
		function positiveSafeInteger(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
		}
		function mediaType(value) {
			return value === "image/png" || value === "image/jpeg" || value === "image/webp";
		}
		function imageRef(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const candidate = value;
			if (typeof candidate.attachmentId !== "string" || candidate.attachmentId.length === 0 || !mediaType(candidate.mediaType) || !positiveSafeInteger(candidate.bytes) || !positiveSafeInteger(candidate.width) || !positiveSafeInteger(candidate.height) || candidate.name !== void 0 && (typeof candidate.name !== "string" || candidate.name.length === 0)) return void 0;
			return {
				attachmentId: candidate.attachmentId,
				mediaType: candidate.mediaType,
				bytes: candidate.bytes,
				width: candidate.width,
				height: candidate.height,
				...candidate.name === void 0 ? {} : { name: candidate.name }
			};
		}
		/** Decode durable tool-result metadata without trusting arbitrary session JSON. */
		function decodeImagePresentationMeta(value) {
			if (typeof value !== "object" || value === null) return void 0;
			const candidate = value;
			if (candidate.kind !== "codex-connect-images" || typeof candidate.prompt !== "string" || candidate.prompt.length < 1 || candidate.prompt.length > 32e3 || !Array.isArray(candidate.images) || candidate.images.length < 1 || candidate.images.length > 4) return void 0;
			if (candidate.schemaVersion === void 0) {
				const previews = candidate.images.map(imageRef);
				if (previews.some((image) => image === void 0)) return void 0;
				return {
					kind: IMAGE_PRESENTATION_KIND,
					schemaVersion: 1,
					prompt: candidate.prompt,
					images: previews.map((preview) => ({ preview }))
				};
			}
			if (candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2 && candidate.schemaVersion !== 3) return void 0;
			const editing = candidate.schemaVersion === 2 || candidate.schemaVersion === 3 && candidate.operation === "edit";
			const edit = editing ? decodeImageEditSources(candidate.edit) : void 0;
			if (editing && (candidate.operation !== "edit" || edit === void 0)) return void 0;
			if (candidate.schemaVersion === 3 && !editing && (candidate.operation !== void 0 || candidate.edit !== void 0)) return void 0;
			const images = [];
			for (const value of candidate.images) {
				if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
				const entry = value;
				const preview = imageRef(entry.preview);
				const original = decodeOpenAICodexOriginalImageRef(entry.original);
				if (original === void 0) return void 0;
				if (candidate.schemaVersion === 3) {
					if (entry.preview !== void 0 || entry.previewStatus !== "unavailable") return void 0;
					images.push({
						original,
						previewStatus: "unavailable"
					});
				} else {
					if (preview === void 0 || entry.previewStatus !== void 0) return void 0;
					images.push({
						preview,
						original
					});
				}
			}
			return {
				kind: IMAGE_PRESENTATION_KIND,
				schemaVersion: candidate.schemaVersion,
				prompt: candidate.prompt,
				images,
				...edit === void 0 ? {} : {
					operation: "edit",
					edit
				}
			};
		}
		/** Recover PTC results without interpreting arbitrary prose or granting asset access. */
		function decodeImageResultContent(content, prompt) {
			if (prompt.length < 1 || prompt.length > 32e3) return void 0;
			const previews = [];
			const envelopes = [];
			for (const value of content) {
				if (typeof value !== "object" || value === null) continue;
				const block = value;
				if (block.type === "image") {
					const ref = imageRef(block.attachment);
					if (ref === void 0) return void 0;
					previews.push(ref);
				}
				if (block.type === "text" && typeof block.text === "string" && (block.text.startsWith("codex-connect-image-result-v1:") || block.text.startsWith("codex-connect-image-result-v2:") || block.text.startsWith("codex-connect-image-result-v3:"))) envelopes.push(block.text);
			}
			if (previews.length > 4 || envelopes.length > 1) return void 0;
			const envelope = envelopes[0];
			if (envelope !== void 0) {
				const recovery = envelope.startsWith(IMAGE_RECOVERY_RESULT_PREFIX);
				if (envelope.length > (envelope.startsWith("codex-connect-image-result-v2:") || recovery ? 256e3 : 16e3)) return void 0;
				try {
					const isEdit = envelope.startsWith(IMAGE_EDIT_RESULT_PREFIX);
					const payload = JSON.parse(envelope.slice(recovery ? 30 : isEdit ? 30 : 30));
					const decoded = decodeImagePresentationMeta(isEdit || recovery ? payload : {
						kind: IMAGE_PRESENTATION_KIND,
						schemaVersion: 1,
						prompt,
						images: payload
					});
					if (recovery) return decoded?.schemaVersion === 3 && decoded.prompt === prompt && previews.length === 0 ? decoded : void 0;
					if (decoded === void 0 || decoded.schemaVersion === 3 || decoded.prompt !== prompt || decoded.images.length !== previews.length || decoded.images.some((image, index) => JSON.stringify(image.preview) !== JSON.stringify(previews[index]))) return void 0;
					return decoded;
				} catch {
					return;
				}
			}
			if (previews.length < 1) return void 0;
			return {
				kind: IMAGE_PRESENTATION_KIND,
				schemaVersion: 1,
				prompt,
				images: previews.map((preview) => ({ preview }))
			};
		}
		//#endregion
		//#region src/client/image-result-presentation.ts
		const IMAGE_TOOL = "codex_connect_image_generate";
		function promptFromArgs(raw) {
			try {
				const value = JSON.parse(raw);
				if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
				const prompt = value.prompt;
				if (typeof prompt !== "string") return void 0;
				const trimmed = prompt.trim();
				return trimmed.length > 0 && trimmed.length <= 32e3 ? trimmed : void 0;
			} catch {
				return;
			}
		}
		/** Return the bounded prompt that belongs to this image Tool row. */
		function promptForImageToolBlock(block) {
			if (!("kind" in block)) return block.phase === "start" ? promptFromArgs(block.argsRaw) : void 0;
			const decoded = decodeImagePresentationMeta(block.meta);
			if (decoded !== void 0) return decoded.prompt;
			return block.call === null ? void 0 : promptFromArgs(block.call.argsRaw);
		}
		/** Recover the exact operation and selections for an explicit user retry. */
		function imageRequestForToolBlock(block) {
			const raw = !("kind" in block) ? block.phase === "start" ? block.argsRaw : void 0 : block.call?.argsRaw;
			if (raw !== void 0) try {
				return decodeImageToolRequest(JSON.parse(raw));
			} catch {
				return;
			}
			if (!("kind" in block) || block.isError) return void 0;
			const decoded = imagePresentationForResult(block);
			if (decoded === void 0) return void 0;
			return decoded.edit === void 0 ? {
				operation: "generate",
				prompt: decoded.prompt
			} : {
				operation: "edit",
				prompt: decoded.prompt,
				edit: decoded.edit
			};
		}
		/** Host-supported text submission with explicit source handles, not forged attachment admission. */
		function imageRequestFollowUp(request) {
			if (request.operation === "generate") return request.prompt;
			const args = {
				operation: "edit",
				prompt: request.prompt,
				target: request.edit.target,
				references: request.edit.references
			};
			return `Edit the explicitly selected image in this conversation using codex_connect_image_generate. Use these exact inputs; if unavailable, report the problem rather than generating a replacement.\n${JSON.stringify(args)}`;
		}
		/** Only a successful image Tool result can enter the visible answer gallery. */
		function imagePresentationForResult(block) {
			if (block.isError || block.call !== null && block.call.name !== IMAGE_TOOL) return void 0;
			if (block.meta !== void 0) return decodeImagePresentationMeta(block.meta);
			const prompt = promptForImageToolBlock(block);
			return prompt === void 0 ? void 0 : decodeImageResultContent(block.content, prompt);
		}
		//#endregion
		//#region src/client/CodexImageEditForm.tsx
		/** Explicit, session-owned target and ordered reference selection in the existing result card. */
		const field = {
			boxSizing: "border-box",
			display: "block",
			width: "100%",
			maxWidth: "100%",
			minWidth: 0,
			minHeight: 32,
			color: "var(--dsw-alias-label-primary)",
			background: "var(--dsw-alias-bg-base)",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			font: "inherit",
			padding: 6
		};
		const detail$1 = {
			color: "var(--dsw-alias-label-secondary)",
			fontSize: 13,
			lineHeight: "18px"
		};
		const button = {
			minHeight: 28,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			padding: "3px 10px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			cursor: "pointer"
		};
		/** Render result choices immediately, then merge authenticated history without changing a selection. */
		function CodexImageEditForm({ decoded, sessionId, pending, followUp, onClose, t }) {
			const initial = (0, react.useMemo)(() => decoded.images.map((image) => {
				if (image.previewStatus === "unavailable" || image.original !== void 0) {
					const original = image.original;
					return {
						input: { assetId: original.assetId },
						source: "original",
						name: original.name,
						width: original.width,
						height: original.height
					};
				}
				const preview = image.preview;
				return {
					input: {
						attachmentId: String(preview.attachmentId),
						usePreview: true
					},
					source: "preview",
					name: preview.name ?? String(preview.attachmentId),
					width: preview.width,
					height: preview.height
				};
			}), [decoded]);
			const [inventory, setInventory] = (0, react.useState)([]);
			const [failed, setFailed] = (0, react.useState)(false);
			const [attempt, setAttempt] = (0, react.useState)(0);
			const [selected, setSelected] = (0, react.useState)(initial.length === 1 ? JSON.stringify(initial[0].input) : "");
			const [instructions, setInstructions] = (0, react.useState)("");
			const [references, setReferences] = (0, react.useState)([]);
			const [allowPreview, setAllowPreview] = (0, react.useState)(false);
			const mounted = (0, react.useRef)(true);
			const sending = (0, react.useRef)(false);
			(0, react.useEffect)(() => {
				mounted.current = true;
				return () => {
					mounted.current = false;
				};
			}, []);
			(0, react.useEffect)(() => {
				const controller = new AbortController();
				setFailed(false);
				requestBody("/plugins/dsh-codex-connect/images/inputs?sessionId=" + encodeURIComponent(sessionId), {
					method: "GET",
					credentials: "same-origin",
					headers: { accept: "application/json" },
					signal: controller.signal
				}, async (response) => {
					if (!response.ok) throw new Error("Image inventory unavailable");
					const items = decodeImageInventory(await response.json());
					if (items === void 0) throw new Error("Invalid image inventory");
					return items;
				}).then(({ value }) => {
					if (!controller.signal.aborted) setInventory(value);
				}).catch(() => {
					if (!controller.signal.aborted) setFailed(true);
				});
				return () => {
					controller.abort();
				};
			}, [sessionId, attempt]);
			const choices = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const item of [...initial, ...inventory]) map.set(JSON.stringify(item.input), item);
				return map;
			}, [initial, inventory]);
			const target = choices.get(selected);
			const refs = references.map((reference) => ({
				item: choices.get(reference.selection),
				purpose: reference.purpose.trim()
			}));
			const preview = [target, ...refs.map((reference) => reference.item)].some((item) => item?.source === "preview");
			const ready = target !== void 0 && instructions.trim().length > 0 && (!preview || allowPreview) && refs.every((ref, index) => ref.item !== void 0 && references[index].selection !== selected && ref.purpose.length > 0);
			const optionLabel = (item) => {
				const id = "assetId" in item.input ? item.input.assetId : "attachment" in item.input ? String(item.input.attachment.attachmentId) : item.input.attachmentId;
				return t(item.source === "original" ? "imageSourceOriginal" : item.source === "preview" ? "imageSourcePreview" : "imageSourceUpload") + " · " + item.name + " · " + item.width + " × " + item.height + " · " + id;
			};
			async function send() {
				if (!ready || target === void 0 || pending || sending.current) return;
				sending.current = true;
				try {
					if (await followUp(imageRequestFollowUp({
						operation: "edit",
						prompt: instructions.trim(),
						edit: {
							target: target.input,
							references: refs.map((reference) => ({
								image: reference.item.input,
								purpose: reference.purpose
							}))
						}
					})) && mounted.current) onClose();
				} finally {
					sending.current = false;
				}
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("form", {
				"aria-label": t("editImage"),
				style: {
					display: "grid",
					gap: 8,
					minWidth: 0
				},
				onSubmit: (event) => {
					event.preventDefault();
					send();
				},
				children: [
					failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "status",
						style: detail$1,
						children: [
							t("imageInventoryFailed"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: button,
								onClick: () => {
									setAttempt((value) => value + 1);
								},
								children: t("loadFailed")
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: detail$1,
						children: [t("editTarget"), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
							"aria-label": t("editTarget"),
							value: selected,
							disabled: pending,
							style: field,
							onChange: (event) => {
								setSelected(event.currentTarget.value);
								setAllowPreview(false);
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: "",
								children: t("selectEditTarget")
							}), [...choices].map(([key, item]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
								value: key,
								children: optionLabel(item)
							}, key))]
						})]
					}),
					references.map((reference, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "grid",
							gap: 6,
							minWidth: 0
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: detail$1,
								children: [t("imageReference", { index: index + 1 }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
									"aria-label": t("imageReference", { index: index + 1 }),
									style: field,
									value: reference.selection,
									disabled: pending,
									onChange: (event) => {
										const selection = event.currentTarget.value;
										setReferences((rows) => rows.map((row, at) => at === index ? {
											...row,
											selection
										} : row));
										setAllowPreview(false);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("selectEditTarget")
									}), [...choices].map(([key, item]) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: key,
										disabled: key === selected,
										children: optionLabel(item)
									}, key))]
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
								style: detail$1,
								children: [t("imageReferencePurpose"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									"aria-label": t("imageReferencePurpose"),
									style: field,
									value: reference.purpose,
									maxLength: 512,
									disabled: pending,
									onChange: (event) => {
										const purpose = event.currentTarget.value;
										setReferences((rows) => rows.map((row, at) => at === index ? {
											...row,
											purpose
										} : row));
									}
								})]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: button,
								disabled: pending,
								onClick: () => {
									setReferences((rows) => rows.filter((_row, at) => at !== index));
								},
								children: t("removeImageReference")
							})
						]
					}, index)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						style: button,
						disabled: pending || references.length >= 4,
						onClick: () => {
							setReferences((rows) => [...rows, {
								selection: "",
								purpose: ""
							}]);
						},
						children: t("addImageReference")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: detail$1,
						children: [t("editInstructions"), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							"aria-label": t("editInstructions"),
							value: instructions,
							maxLength: 28e3,
							rows: 3,
							style: {
								...field,
								resize: "vertical"
							},
							disabled: pending,
							onChange: (event) => {
								setInstructions(event.currentTarget.value);
							}
						})]
					}),
					preview ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						style: detail$1,
						children: t("previewEditNotice")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						style: detail$1,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: allowPreview,
							disabled: pending,
							onChange: (event) => {
								setAllowPreview(event.currentTarget.checked);
							}
						}), t("choosePreviewEdit")]
					})] }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "submit",
							style: button,
							disabled: !ready || pending,
							children: pending ? t("actionSending") : t("submitImageEdit")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: button,
							disabled: pending,
							onClick: onClose,
							children: t("cancelImageEdit")
						})]
					})
				]
			});
		}
		//#endregion
		//#region src/image-error-contract.ts
		/** Node-free, fixed public image failures. Unknown provider/host text is never rendered. */
		const IMAGE_INPUT_FAILURE_REASONS = [
			"shorten the instructions or reference descriptions.",
			"requires valid, bounded image selections.",
			"requires the current session and its image history.",
			"requires complete host image limits.",
			"too many inputs for this deployment.",
			"is unavailable in this session. Select or attach the image again.",
			"is unavailable or does not match a reference in this session. Select or attach the image again.",
			"identifies both an upload and a generated result. Select the uploaded attachment explicitly or choose an exact original image.",
			"matches several original results. Select one exact original image.",
			"only a preview is available. Explicitly choose that preview or attach an original.",
			"has unsupported attachment metadata.",
			"exceeds this deployment's image limits or uses an unsupported format.",
			"exceeds this deployment's total input limit.",
			"the original is unavailable or failed integrity checks; no preview was substituted.",
			"the stored bytes do not match the image reference.",
			"cannot be read or validated. No image request was sent.",
			"is required."
		];
		function imageInputFailureMessage(label, reason) {
			return `${label}: ${reason}`;
		}
		const TRANSPORT_MESSAGES = {
			OPENAI_CODEX_SIGNED_OUT: "Sign in to OpenAI Codex before generating images.",
			OPENAI_CODEX_REAUTH_REQUIRED: "Renew OpenAI Codex authorization before generating images.",
			OPENAI_CODEX_RATE_LIMITED: "Image generation is temporarily unavailable. Try again later.",
			OPENAI_CODEX_TIMEOUT: "Image generation timed out. The request may still be processing.",
			OPENAI_CODEX_CANCELED: "Image generation was canceled. The request may still be processing.",
			OPENAI_CODEX_NETWORK_ERROR: "The image generation request lost its network connection. The request may still be processing.",
			OPENAI_CODEX_UPSTREAM_REJECTED: "The image generation request was rejected.",
			OPENAI_CODEX_UPSTREAM_UNAVAILABLE: "Image generation is temporarily unavailable.",
			OPENAI_CODEX_RESPONSE_TOO_LARGE: "The image generation response exceeded the safe size limit.",
			OPENAI_CODEX_MALFORMED_RESPONSE: "The image generation response was unreadable."
		};
		const UNKNOWN_TRANSPORT_MESSAGE = "Image generation failed without exposing private response details.";
		const failures = /* @__PURE__ */ new Map();
		function register(message, retryable, recovery) {
			for (const prefix of ["", "Error: "]) {
				const text = prefix + message;
				failures.set(text, {
					message: text,
					retryable,
					...recovery === void 0 ? {} : { recovery }
				});
			}
		}
		for (const label of [
			"Edit instructions",
			"Image editing",
			"Image batch",
			"Target image",
			"Reference image 1",
			"Reference image 2",
			"Reference image 3",
			"Reference image 4"
		]) for (const reason of IMAGE_INPUT_FAILURE_REASONS) register(imageInputFailureMessage(label, reason), false, "input");
		for (const [code, message] of Object.entries(TRANSPORT_MESSAGES)) {
			const account = code === "OPENAI_CODEX_SIGNED_OUT" || code === "OPENAI_CODEX_REAUTH_REQUIRED";
			const uncertain = [
				"OPENAI_CODEX_TIMEOUT",
				"OPENAI_CODEX_CANCELED",
				"OPENAI_CODEX_NETWORK_ERROR",
				"OPENAI_CODEX_MALFORMED_RESPONSE",
				"OPENAI_CODEX_RESPONSE_TOO_LARGE"
			].includes(code);
			register(message, !account && !uncertain, account ? "account" : void 0);
		}
		register(UNKNOWN_TRANSPORT_MESSAGE, false);
		register("Invalid image request. Editing requires operation=edit, one explicit target and valid references; no generation was attempted.", false, "input");
		register("This Codex Connect transport does not support editing. No generation was attempted.", false, "input");
		register("The Codex Connect image transport is unavailable.", false, "input");
		register("The selected Codex image account is unavailable. No request was sent.", false, "account");
		for (const message of [
			"The generated original images could not be saved.",
			"The generated images could not be saved; no attachment references were returned.",
			"The image stores returned an incomplete image batch."
		]) register(message, false, "storage");
		/** Match complete fixed strings, not prefixes or arbitrary text that merely looks safe. */
		function safeImageFailure(content) {
			for (const block of content.slice(0, 8)) {
				if (typeof block !== "object" || block === null) continue;
				const value = block;
				if (value.type !== "text" || typeof value.text !== "string" || value.text.length > 1500) continue;
				const safe = failures.get(value.text);
				if (safe !== void 0) return { ...safe };
			}
		}
		//#endregion
		//#region src/client/CodexImageGallery.tsx
		/** Self-contained result-image gallery for the tool-call view.
		*
		* DSH keeps the attachment package's React atoms behind its
		* conversation slots. A tool-call view cannot render those slots, so this
		* gallery owns only the durable-image presentation it needs and receives all
		* stateful work through props.
		*/
		const galleryStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "flex-start",
			gap: 8
		};
		const imageFrameStyle = {
			display: "grid",
			placeItems: "center",
			padding: 0,
			overflow: "hidden",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)",
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer"
		};
		const loadingStyle = {
			padding: 10,
			fontSize: 12
		};
		const errorStyle = {
			minHeight: 32,
			padding: "6px 10px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			background: "transparent",
			color: "var(--dsw-alias-label-secondary)",
			cursor: "pointer"
		};
		const lightboxStyle = {
			position: "relative",
			width: "100%",
			height: "92vh",
			minWidth: 0,
			minHeight: 0,
			overflow: "hidden",
			background: "var(--dsw-alias-bg-base, #111)"
		};
		const lightboxViewportStyle = {
			width: "100%",
			height: "100%",
			overflow: "auto",
			touchAction: "none",
			overscrollBehavior: "contain"
		};
		const lightboxImageStyle = {
			display: "block",
			width: "100%",
			height: "100%",
			objectFit: "contain",
			userSelect: "none",
			pointerEvents: "none"
		};
		const lightboxControlsStyle = {
			position: "absolute",
			top: 8,
			left: 8,
			zIndex: 1,
			display: "flex",
			alignItems: "center",
			gap: 6,
			padding: 4,
			borderRadius: 9,
			background: "rgba(0,0,0,0.55)",
			color: "#fff"
		};
		const lightboxButtonStyle = {
			minWidth: 32,
			height: 32,
			padding: "0 8px",
			border: "1px solid rgba(255,255,255,0.35)",
			borderRadius: 7,
			background: "rgba(0,0,0,0.35)",
			color: "#fff",
			font: "inherit",
			cursor: "pointer"
		};
		const closeStyle = {
			...lightboxButtonStyle,
			position: "absolute",
			top: 8,
			right: 8,
			zIndex: 1,
			width: 32,
			padding: 0
		};
		const MIN_ZOOM = 1;
		const MAX_ZOOM = 4;
		const ZOOM_STEP = .5;
		function singleFit(attachment) {
			const natural = attachment.width / attachment.height;
			const ratio = Math.min(4, Math.max(.25, natural));
			const box = ratio >= 1 ? {
				width: 240,
				height: 240 / ratio
			} : {
				width: 240 * ratio,
				height: 240
			};
			const scale = Math.min(1, attachment.width / box.width, attachment.height / box.height);
			return {
				width: Math.max(1, Math.round(box.width * scale)),
				height: Math.max(1, Math.round(box.height * scale)),
				objectPosition: natural < .25 ? "center top" : natural > 4 ? "left center" : "center"
			};
		}
		function CodexImageLightbox({ src, alt, labels, opener, onClose }) {
			const lightbox = (0, react.useRef)(null);
			const closeButton = (0, react.useRef)(null);
			const viewport = (0, react.useRef)(null);
			const dragStart = (0, react.useRef)(null);
			const [zoom, setZoom] = (0, react.useState)(MIN_ZOOM);
			const [dragging, setDragging] = (0, react.useState)(false);
			(0, react.useEffect)(() => {
				closeButton.current?.focus();
				return () => {
					opener?.focus();
				};
			}, [opener]);
			(0, react.useLayoutEffect)(() => {
				const dialog = lightbox.current?.closest("[role=\"dialog\"]");
				if (dialog === null || dialog === void 0) return;
				const previousWidth = dialog.style.width;
				const previousMaxWidth = dialog.style.maxWidth;
				dialog.style.width = "96vw";
				dialog.style.maxWidth = "1200px";
				return () => {
					dialog.style.width = previousWidth;
					dialog.style.maxWidth = previousMaxWidth;
				};
			}, []);
			(0, react.useEffect)(() => {
				if (zoom !== MIN_ZOOM || viewport.current === null) return;
				viewport.current.scrollLeft = 0;
				viewport.current.scrollTop = 0;
			}, [zoom]);
			const beginDrag = (event) => {
				if (zoom === MIN_ZOOM || event.button !== 0) return;
				dragStart.current = {
					pointerId: event.pointerId,
					clientX: event.clientX,
					clientY: event.clientY,
					scrollLeft: event.currentTarget.scrollLeft,
					scrollTop: event.currentTarget.scrollTop
				};
				event.currentTarget.setPointerCapture?.(event.pointerId);
				setDragging(true);
			};
			const drag = (event) => {
				const start = dragStart.current;
				if (start === null || start.pointerId !== event.pointerId) return;
				event.currentTarget.scrollLeft = start.scrollLeft - (event.clientX - start.clientX);
				event.currentTarget.scrollTop = start.scrollTop - (event.clientY - start.clientY);
				event.preventDefault();
			};
			const endDrag = (event) => {
				if (dragStart.current?.pointerId !== event.pointerId) return;
				dragStart.current = null;
				if (event.currentTarget.hasPointerCapture?.(event.pointerId) === true) event.currentTarget.releasePointerCapture(event.pointerId);
				setDragging(false);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open: true,
				onClose,
				title: labels.dialog,
				headless: true,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: lightbox,
					style: lightboxStyle,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: lightboxControlsStyle,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": labels.zoomOut,
									title: labels.zoomOut,
									style: lightboxButtonStyle,
									disabled: zoom === MIN_ZOOM,
									onClick: () => {
										setZoom((value) => Math.max(MIN_ZOOM, value - ZOOM_STEP));
									},
									children: "−"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [Math.round(zoom * 100), "%"] }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": labels.zoomIn,
									title: labels.zoomIn,
									style: lightboxButtonStyle,
									disabled: zoom === MAX_ZOOM,
									onClick: () => {
										setZoom((value) => Math.min(MAX_ZOOM, value + ZOOM_STEP));
									},
									children: "+"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-label": labels.reset,
									title: labels.reset,
									style: lightboxButtonStyle,
									disabled: zoom === MIN_ZOOM,
									onClick: () => {
										setZoom(MIN_ZOOM);
									},
									children: labels.reset
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							ref: closeButton,
							type: "button",
							"aria-label": labels.close,
							title: labels.close,
							style: closeStyle,
							onClick: onClose,
							children: "×"
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							ref: viewport,
							"data-testid": "codex-image-lightbox-viewport",
							"data-zoom": String(zoom),
							style: {
								...lightboxViewportStyle,
								cursor: zoom === MIN_ZOOM ? "default" : dragging ? "grabbing" : "grab"
							},
							onPointerDown: beginDrag,
							onPointerMove: drag,
							onPointerUp: endDrag,
							onPointerCancel: endDrag,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								style: {
									width: `${zoom * 100}%`,
									height: `${zoom * 100}%`
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
									src,
									alt,
									draggable: false,
									style: lightboxImageStyle
								})
							})
						})
					]
				})
			});
		}
		function CodexMessageImage({ attachment, load, variant, labels }) {
			const [src, setSrc] = (0, react.useState)(null);
			const [error, setError] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [attempt, setAttempt] = (0, react.useState)(0);
			const opener = (0, react.useRef)(null);
			const retry = (0, react.useCallback)(() => {
				setAttempt((value) => value + 1);
			}, []);
			const closeLightbox = (0, react.useCallback)(() => {
				setOpen(false);
			}, []);
			const fit = (0, react.useMemo)(() => variant === "single" ? singleFit(attachment) : void 0, [
				attachment.attachmentId,
				attachment.height,
				attachment.width,
				variant
			]);
			(0, react.useEffect)(() => {
				let live = true;
				setError(false);
				setSrc(null);
				load(attachment).then((url) => {
					if (live) setSrc(url);
				}).catch(() => {
					if (live) setError(true);
				});
				return () => {
					live = false;
				};
			}, [
				attachment.attachmentId,
				attachment.bytes,
				attachment.height,
				attachment.mediaType,
				attachment.name,
				attachment.width,
				attempt,
				load
			]);
			const label = attachment.name ?? labels.image;
			if (error) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: errorStyle,
				"data-variant": variant,
				onClick: retry,
				children: labels.loadFailed
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				ref: opener,
				style: fit === void 0 ? {
					...imageFrameStyle,
					width: 64,
					height: 64
				} : {
					...imageFrameStyle,
					width: fit.width,
					height: fit.height
				},
				"data-variant": variant,
				title: labels.open,
				"aria-label": labels.openNamed(label),
				onClick: () => {
					if (src !== null) setOpen(true);
				},
				children: src === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: loadingStyle,
					children: labels.loading
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
					src,
					alt: label,
					style: {
						display: "block",
						width: "100%",
						height: "100%",
						objectFit: "cover",
						objectPosition: fit?.objectPosition
					}
				})
			}), open && src !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageLightbox, {
				src,
				alt: label,
				labels: labels.lightbox,
				opener: opener.current,
				onClose: closeLightbox
			}) : null] });
		}
		/** Render durable generated images without relying on rc.2 private React atoms. */
		function CodexImageGallery({ images, load, align, labels }) {
			if (images.length === 0) return null;
			const variant = images.length === 1 ? "single" : "tile";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				"data-testid": "codex-image-gallery",
				"data-align": align,
				style: {
					...galleryStyle,
					justifyContent: align === "end" ? "flex-end" : "flex-start"
				},
				children: images.map((image, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexMessageImage, {
					...image,
					load,
					variant,
					labels
				}, `${image.attachment.attachmentId}:${index}`))
			});
		}
		//#endregion
		//#region src/client/CodexImageToolView.tsx
		/** Native browser view for Codex image-generation tool results. */
		const shell = {
			containerType: "inline-size",
			padding: 12,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 10,
			background: "var(--dsw-alias-bg-module-platform)",
			color: "var(--dsw-alias-label-primary)"
		};
		const header = {
			display: "flex",
			alignItems: "center",
			justifyContent: "space-between",
			gap: 12
		};
		const detail = {
			color: "var(--dsw-alias-label-tertiary)",
			fontSize: 13,
			lineHeight: "18px"
		};
		const progress = {
			width: "100%",
			height: 4,
			accentColor: "var(--dsw-alias-brand-primary)"
		};
		const action = {
			justifySelf: "start",
			minHeight: 28,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			padding: "3px 10px",
			background: "transparent",
			color: "var(--dsw-alias-label-primary)",
			font: "inherit",
			cursor: "pointer"
		};
		const actionRow = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "center",
			gap: 8
		};
		const promptText = {
			boxSizing: "border-box",
			width: "100%",
			maxHeight: 96,
			margin: 0,
			overflowY: "auto",
			padding: "10px 42px 10px 12px",
			color: "var(--dsw-alias-label-secondary)",
			fontFamily: "var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)",
			fontSize: 12,
			lineHeight: "18px",
			whiteSpace: "pre-wrap",
			overflowWrap: "anywhere",
			userSelect: "text"
		};
		const layoutStyle = {
			display: "flex",
			flexWrap: "wrap",
			alignItems: "flex-start",
			gap: 14,
			minWidth: 0
		};
		const visualStyle = {
			display: "grid",
			alignContent: "start",
			flex: "1 1 240px",
			maxWidth: 320,
			gap: 10,
			minWidth: 0
		};
		const sideStyle = {
			display: "grid",
			alignContent: "start",
			flex: "2 1 280px",
			gap: 10,
			minWidth: 0
		};
		const promptPanelStyle = {
			display: "grid",
			alignContent: "start",
			gap: 10,
			minWidth: 0
		};
		const promptLabelStyle = {
			fontSize: 13,
			fontWeight: 500,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-primary)"
		};
		const promptBlockStyle = {
			position: "relative",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 8,
			background: "var(--dsw-alias-bg-base)"
		};
		const copyButtonStyle = {
			position: "absolute",
			zIndex: 1,
			top: 7,
			right: 7,
			display: "grid",
			placeItems: "center",
			width: 28,
			height: 28,
			padding: 0,
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 7,
			color: "var(--dsw-alias-label-secondary)",
			background: "var(--dsw-alias-bg-layer-1)",
			cursor: "pointer",
			transition: "opacity 120ms ease"
		};
		const tooltipStyle = {
			position: "absolute",
			zIndex: 100,
			top: -8,
			right: 0,
			transform: "translateY(-100%)",
			width: "max-content",
			maxWidth: "min(260px, 50vw)",
			padding: "3px 7px",
			borderRadius: 8,
			background: "var(--dsw-alias-tooltip-bg)",
			color: "var(--dsw-static-neutral-bluish-00)",
			fontSize: 13,
			lineHeight: "20px",
			whiteSpace: "pre-line",
			overflowWrap: "break-word",
			pointerEvents: "none"
		};
		const visuallyHidden = {
			position: "absolute",
			width: 1,
			height: 1,
			padding: 0,
			margin: -1,
			overflow: "hidden",
			clip: "rect(0 0 0 0)",
			whiteSpace: "nowrap",
			border: 0
		};
		function contentText(content) {
			for (const block of content) if (typeof block === "object" && block !== null && block.type === "text" && typeof block.text === "string") return block.text;
		}
		function imageActionsEnabled(scope) {
			return scope === void 0 || scope.getSnapshot().value?.enableImageGeneration === true;
		}
		function useImageActionsEnabled(scope) {
			const source = (0, react.useMemo)(() => ({
				subscribe: (listener) => scope?.subscribe(listener) ?? (() => {}),
				getSnapshot: () => imageActionsEnabled(scope)
			}), [scope]);
			return (0, react.useSyncExternalStore)(source.subscribe, source.getSnapshot, source.getSnapshot);
		}
		function useSessionActions(sessionId, sessions, configScope) {
			const [pending, setPending] = (0, react.useState)(null);
			const pendingRef = (0, react.useRef)(false);
			const [failed, setFailed] = (0, react.useState)(false);
			const alive = (0, react.useRef)(true);
			const activeSession = (0, react.useRef)(sessionId);
			activeSession.current = sessionId;
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
				};
			}, []);
			const run = (0, react.useCallback)(async (actionName, content) => {
				if (pendingRef.current || actionName === "follow-up" && !imageActionsEnabled(configScope)) return false;
				const binding = sessions.binding(sessionId);
				if (binding === void 0) {
					setFailed(true);
					return false;
				}
				pendingRef.current = true;
				setFailed(false);
				setPending(actionName);
				try {
					const accepted = (actionName === "cancel" ? await binding.session.cancel() : await binding.session.prompt(content ?? [], "queue")).ok;
					if (alive.current) {
						setPending(null);
						setFailed(activeSession.current === sessionId && !accepted);
					}
					return accepted && alive.current && activeSession.current === sessionId;
				} catch {
					if (alive.current) {
						setPending(null);
						setFailed(activeSession.current === sessionId);
					}
					return false;
				} finally {
					pendingRef.current = false;
				}
			}, [
				sessionId,
				sessions,
				configScope
			]);
			return {
				pending,
				failed,
				cancel: (0, react.useCallback)(() => run("cancel"), [run]),
				followUp: (0, react.useCallback)((text) => run("follow-up", [{
					type: "text",
					text
				}]), [run])
			};
		}
		function ActionError({ visible, t }) {
			return visible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				style: detail,
				children: t("actionFailed")
			}) : null;
		}
		function triggerDownload(url, name) {
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = name;
			anchor.rel = "noopener";
			document.body.append(anchor);
			try {
				anchor.click();
			} finally {
				anchor.remove();
			}
		}
		function DownloadButton({ label, onDownload, t }) {
			const [state, setState] = (0, react.useState)("idle");
			const alive = (0, react.useRef)(true);
			const request = (0, react.useRef)(void 0);
			(0, react.useEffect)(() => {
				alive.current = true;
				return () => {
					alive.current = false;
					request.current?.abort();
				};
			}, []);
			async function download() {
				if (request.current !== void 0) return;
				const controller = new AbortController();
				request.current = controller;
				setState("pending");
				try {
					await onDownload(controller.signal);
					if (alive.current && !controller.signal.aborted) setState("idle");
				} catch {
					if (alive.current && !controller.signal.aborted) setState("failed");
				} finally {
					if (request.current === controller) request.current = void 0;
				}
			}
			const status = state === "pending" ? t("downloading") : state === "failed" ? t("downloadFailed") : void 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				style: action,
				disabled: state === "pending",
				"aria-busy": state === "pending",
				"data-download-state": state,
				onClick: () => {
					download();
				},
				children: status ?? label
			}), status === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
				role: "status",
				"aria-live": "polite",
				style: visuallyHidden,
				children: status
			})] });
		}
		async function downloadOriginal(sessionId, original, signal) {
			const { value: blob } = await requestBody(openAICodexOriginalImageUrl(sessionId, original.assetId), {
				method: "GET",
				headers: { accept: original.mediaType },
				credentials: "same-origin",
				signal
			}, async (response) => {
				if (!response.ok) throw new Error("Original image download failed");
				return response.blob();
			});
			if (signal.aborted) throw signal.reason;
			if (blob.size !== original.bytes) throw new Error("Original image download was incomplete");
			const url = URL.createObjectURL(blob);
			try {
				triggerDownload(url, original.name);
			} finally {
				URL.revokeObjectURL(url);
			}
		}
		function PromptPanel({ prompt, t }) {
			const [copyState, setCopyState] = (0, react.useState)("idle");
			const [hovered, setHovered] = (0, react.useState)(false);
			const [focused, setFocused] = (0, react.useState)(false);
			const [hoverless, setHoverless] = (0, react.useState)(false);
			const [tooltipVisible, setTooltipVisible] = (0, react.useState)(false);
			const tooltipId = (0, react.useId)();
			(0, react.useEffect)(() => {
				if (copyState === "idle") return;
				const timer = window.setTimeout(() => {
					setCopyState("idle");
				}, 2e3);
				return () => {
					window.clearTimeout(timer);
				};
			}, [copyState]);
			(0, react.useEffect)(() => {
				if (typeof window.matchMedia !== "function") return;
				const query = window.matchMedia("(hover: none)");
				const update = () => {
					setHoverless(query.matches);
				};
				update();
				query.addEventListener("change", update);
				return () => {
					query.removeEventListener("change", update);
				};
			}, []);
			async function copy() {
				setCopyState(await (0, _deepseek_ai_dsh_client_ui_primitives.writeClipboard)(prompt) ? "copied" : "failed");
			}
			const copyLabel = copyState === "copied" ? t("promptCopied") : copyState === "failed" ? t("promptCopyFailed") : t("copyPrompt");
			const showCopy = hovered || focused || hoverless || copyState !== "idle";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: promptPanelStyle,
				"aria-label": t("promptLabel"),
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
						style: promptLabelStyle,
						children: t("promptLabel")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: promptBlockStyle,
						onMouseEnter: () => {
							setHovered(true);
						},
						onMouseLeave: () => {
							setHovered(false);
						},
						onFocusCapture: () => {
							setFocused(true);
						},
						onBlurCapture: () => {
							setFocused(false);
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: {
									...copyButtonStyle,
									opacity: showCopy ? 1 : 0
								},
								"aria-label": copyLabel,
								"aria-describedby": tooltipVisible ? tooltipId : void 0,
								"data-copy-state": copyState,
								onMouseEnter: () => {
									setTooltipVisible(true);
								},
								onMouseLeave: () => {
									setTooltipVisible(false);
								},
								onFocus: () => {
									setTooltipVisible(true);
								},
								onBlur: () => {
									setTooltipVisible(false);
								},
								onClick: () => {
									copy();
								},
								children: copyState === "copied" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutlineRegular, { size: 16 }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCopyOutlineRegular, { size: 16 })
							}),
							tooltipVisible ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								id: tooltipId,
								role: "tooltip",
								style: tooltipStyle,
								children: copyLabel
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", {
								style: promptText,
								tabIndex: 0,
								children: prompt
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						role: "status",
						"aria-live": "polite",
						style: {
							position: "absolute",
							width: 1,
							height: 1,
							overflow: "hidden",
							clipPath: "inset(50%)"
						},
						children: copyState === "idle" ? "" : copyLabel
					})
				]
			});
		}
		function ResponsiveCard({ visual, side, label }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("section", {
				style: shell,
				"aria-label": label,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: layoutStyle,
					"data-testid": "image-generation-layout",
					"data-responsive-layout": "visual-prompt",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: side === void 0 ? {
							...visualStyle,
							maxWidth: "none"
						} : visualStyle,
						"data-testid": "image-generation-visual",
						children: visual
					}), side === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: sideStyle,
						"data-testid": "image-generation-prompt",
						children: side
					})]
				})
			});
		}
		function formatBytes$1(bytes) {
			if (bytes < 1e3) return `${String(bytes)} B`;
			if (bytes < 1e6) return `${(bytes / 1e3).toFixed(bytes < 1e4 ? 1 : 0)} KB`;
			return `${(bytes / 1e6).toFixed(bytes < 1e7 ? 1 : 0)} MB`;
		}
		function formatMediaType(mediaType) {
			return mediaType === "image/jpeg" ? "JPEG" : mediaType.slice(6).toUpperCase();
		}
		function useImageLoader(sessionId, sessions) {
			const urls = (0, react.useRef)(/* @__PURE__ */ new Map());
			const pending = (0, react.useRef)(/* @__PURE__ */ new Map());
			const activeSession = (0, react.useRef)(sessionId);
			const disposed = (0, react.useRef)(false);
			activeSession.current = sessionId;
			(0, react.useEffect)(() => {
				disposed.current = false;
				return () => {
					disposed.current = true;
					for (const entry of urls.current.values()) URL.revokeObjectURL(entry.url);
					urls.current.clear();
				};
			}, []);
			(0, react.useEffect)(() => () => {
				for (const [key, entry] of urls.current) {
					if (entry.sessionId !== sessionId) continue;
					URL.revokeObjectURL(entry.url);
					urls.current.delete(key);
				}
			}, [sessionId]);
			return (0, react.useCallback)(async (attachment) => {
				const key = `${sessionId}\u0000${attachment.attachmentId}`;
				const cached = urls.current.get(key);
				if (cached !== void 0) return cached.url;
				const inflight = pending.current.get(key);
				if (inflight !== void 0) return inflight;
				const request = (async () => {
					const binding = sessions.binding(sessionId);
					if (binding === void 0) throw new Error("Image session is unavailable");
					const result = await binding.session.readAttachment(attachment);
					if (!result.ok || result.value.attachment.attachmentId !== attachment.attachmentId) throw new Error("Image attachment could not be read");
					if (disposed.current || activeSession.current !== sessionId) throw new Error("Image view is no longer active");
					const bytes = result.value.data.slice().buffer;
					const url = URL.createObjectURL(new Blob([bytes], { type: result.value.attachment.mediaType }));
					urls.current.set(key, {
						sessionId,
						url
					});
					return url;
				})().finally(() => {
					pending.current.delete(key);
				});
				pending.current.set(key, request);
				return request;
			}, [sessionId, sessions]);
		}
		function labels(t) {
			return {
				image: t("image"),
				open: t("open"),
				openNamed: (label) => t("openNamed", { name: label }),
				loading: t("loading"),
				loadFailed: t("loadFailed"),
				lightbox: {
					dialog: t("lightboxDialog"),
					close: t("lightboxClose"),
					zoomIn: t("lightboxZoomIn"),
					zoomOut: t("lightboxZoomOut"),
					reset: t("lightboxReset")
				}
			};
		}
		function errorState(block, t) {
			const code = block.error?.code;
			if (code === "ABORTED" || code === "ABORTED_BEFORE_DISPATCH" || code === "TOOL_ABORTED") return {
				title: t("canceled"),
				detail: t("canceledDetail"),
				retryable: false,
				recovery: void 0
			};
			const safe = safeImageFailure(block.content);
			const reauth = code === "OPENAI_CODEX_REAUTH_REQUIRED" || safe?.recovery === "account";
			return {
				title: t("failed"),
				detail: reauth ? t("reauthRequired") : safe?.message ?? t("imageUnknownFailure"),
				retryable: !reauth && (safe?.retryable ?? false),
				recovery: safe?.recovery
			};
		}
		function CodexImageToolView({ block, sessionId, t, sessions, configScope }) {
			const load = useImageLoader(sessionId, sessions);
			const actionsEnabled = useImageActionsEnabled(configScope);
			const sessionActions = useSessionActions(sessionId, sessions, configScope);
			const galleryLabels = (0, react.useMemo)(() => labels(t), [t]);
			const prompt = promptForImageToolBlock(block);
			const request = imageRequestForToolBlock(block);
			const decoded = (0, react.useMemo)(() => "kind" in block ? imagePresentationForResult(block) : void 0, [block]);
			if (!("kind" in block)) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponsiveCard, {
				label: t(request?.operation === "edit" ? "imageEditing" : "generating"),
				visual: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "grid",
						gap: 10
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: header,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(request?.operation === "edit" ? "imageEditing" : "generating") })
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("progress", {
							style: progress,
							"aria-label": t(request?.operation === "edit" ? "imageEditing" : "generating")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							style: detail,
							children: t("generatingDetail")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: actionRow,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: action,
								disabled: sessionActions.pending !== null,
								"aria-busy": sessionActions.pending === "cancel",
								onClick: () => {
									sessionActions.cancel();
								},
								children: sessionActions.pending === "cancel" ? t("cancelingGeneration") : t("cancelGeneration")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionError, {
								visible: sessionActions.failed,
								t
							})]
						})
					]
				}),
				side: prompt === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptPanel, {
					prompt,
					t
				})
			});
			if (block.isError) {
				const state = errorState(block, t);
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponsiveCard, {
					label: state.title,
					visual: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						role: "status",
						style: {
							display: "grid",
							gap: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: state.title }),
							state.detail === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: detail,
								children: state.detail
							}),
							contentText(block.content)?.includes("may still be processing") === true ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: detail,
								children: t("imageRequestUncertain")
							}) : null,
							state.recovery === "input" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: detail,
								children: t("imageInputRecovery")
							}) : null,
							state.recovery === "storage" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: detail,
								children: t("imageStorageRecovery")
							}) : null,
							request === void 0 || !actionsEnabled || !state.retryable ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: actionRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									style: action,
									disabled: sessionActions.pending !== null,
									"aria-busy": sessionActions.pending === "follow-up",
									onClick: () => {
										sessionActions.followUp(imageRequestFollowUp(request));
									},
									children: sessionActions.pending === "follow-up" ? t("actionSending") : t(request.operation === "edit" ? "retryImageEdit" : "retryGeneration")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionError, {
									visible: sessionActions.failed,
									t
								})]
							})
						]
					}),
					side: prompt === void 0 ? void 0 : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptPanel, {
						prompt,
						t
					})
				});
			}
			if (decoded === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				style: shell,
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("completed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					style: detail,
					children: t("unknownResult")
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ImageResultCard, {
				decoded,
				sessionId,
				load,
				sessionActions,
				galleryLabels,
				actionsEnabled,
				t
			});
		}
		function imageInputLabel(input) {
			if ("assetId" in input) return input.assetId;
			if ("attachment" in input) return input.attachment.name ?? String(input.attachment.attachmentId);
			return input.attachmentId;
		}
		function ImageResultCard({ decoded, sessionId, load, sessionActions, galleryLabels, actionsEnabled, t }) {
			const [editing, setEditing] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResponsiveCard, {
				label: t(decoded.edit === void 0 ? "completed" : "imageEdited"),
				visual: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: header,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t(decoded.edit === void 0 ? "completed" : "imageEdited") })
					}),
					decoded.images.some((image) => image.preview === void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						role: "status",
						style: detail,
						children: t("imagePreviewUnavailable")
					}),
					decoded.images.some((image) => image.preview !== void 0) && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageGallery, {
						images: decoded.images.flatMap((image) => image.preview === void 0 ? [] : [{ attachment: image.preview }]),
						load,
						align: "start",
						labels: galleryLabels
					})
				] }),
				side: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(PromptPanel, {
						prompt: decoded.prompt,
						t
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: actionRow,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: action,
								disabled: !actionsEnabled || sessionActions.pending !== null,
								"aria-busy": sessionActions.pending === "follow-up",
								onClick: () => {
									sessionActions.followUp(imageRequestFollowUp(decoded.edit === void 0 ? {
										operation: "generate",
										prompt: decoded.prompt
									} : {
										operation: "edit",
										prompt: decoded.prompt,
										edit: decoded.edit
									}));
								},
								children: sessionActions.pending === "follow-up" ? t("actionSending") : t(decoded.edit === void 0 ? "regenerate" : "retryImageEdit")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								style: action,
								disabled: !actionsEnabled || sessionActions.pending !== null,
								"aria-busy": sessionActions.pending === "follow-up",
								onClick: () => {
									setEditing(true);
								},
								children: sessionActions.pending === "follow-up" ? t("actionSending") : t("editImage")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(ActionError, {
								visible: sessionActions.failed,
								t
							})
						]
					}),
					decoded.edit === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						style: detail,
						children: t("editFrom", {
							source: imageInputLabel(decoded.edit.target),
							count: decoded.edit.references.length
						})
					}),
					editing && actionsEnabled ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexImageEditForm, {
						decoded,
						sessionId,
						pending: sessionActions.pending !== null,
						followUp: sessionActions.followUp,
						onClose: () => {
							setEditing(false);
						},
						t
					}, JSON.stringify([sessionId, decoded.images.map((image) => [image.original?.assetId ?? null, image.preview?.attachmentId ?? null])])) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							display: "flex",
							flexWrap: "wrap",
							gap: 8
						},
						children: decoded.images.flatMap((image, index) => {
							const preview = image.preview;
							const suffix = preview?.name ?? image.original?.name ?? String(index + 1);
							const exactOriginal = image.original;
							const original = exactOriginal === void 0 ? [] : [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadButton, {
								onDownload: (signal) => downloadOriginal(sessionId, exactOriginal, signal),
								t,
								label: decoded.images.length === 1 ? t("downloadOriginal") : t("downloadOriginalNamed", { name: exactOriginal.name })
							}, `${sessionId}:${JSON.stringify(exactOriginal)}:${index}:original`)];
							if (preview === void 0) return original;
							return [...original, /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DownloadButton, {
								onDownload: async (signal) => {
									const url = await load(preview);
									if (!signal.aborted) triggerDownload(url, preview.name ?? t("image"));
								},
								t,
								label: image.original === void 0 ? decoded.images.length === 1 ? t("download") : t("downloadNamed", { name: suffix }) : decoded.images.length === 1 ? t("downloadPreview") : t("downloadPreviewNamed", { name: suffix })
							}, `${sessionId}:${preview.attachmentId}:${index}:preview`)];
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("summary", {
						style: {
							cursor: "pointer",
							color: "var(--dsw-alias-label-secondary)",
							fontSize: 13
						},
						children: t("imageDetails")
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...detail,
							display: "grid",
							gap: 4,
							marginTop: 6
						},
						children: decoded.images.flatMap((image, index) => {
							if (image.previewStatus === "unavailable") {
								const original = image.original;
								return [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("originalImageDetail", {
									name: original.name,
									format: formatMediaType(original.mediaType),
									width: original.width,
									height: original.height,
									size: formatBytes$1(original.bytes)
								}) }, `${original.assetId}:${index}:original`)];
							}
							const preview = image.preview;
							const original = image.original;
							const name = preview.name ?? String(index + 1);
							if (original === void 0) return [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("imageDetail", {
								name,
								format: formatMediaType(preview.mediaType),
								width: preview.width,
								height: preview.height,
								size: formatBytes$1(preview.bytes)
							}) }, `${preview.attachmentId}:${index}`)];
							return [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("originalImageDetail", {
								name: original.name,
								format: formatMediaType(original.mediaType),
								width: original.width,
								height: original.height,
								size: formatBytes$1(original.bytes)
							}) }, `${original.assetId}:${index}:original`), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("previewImageDetail", {
								format: formatMediaType(preview.mediaType),
								width: preview.width,
								height: preview.height,
								size: formatBytes$1(preview.bytes)
							}) }, `${preview.attachmentId}:${index}:preview`)];
						})
					})] })
				] })
			});
		}
		//#endregion
		//#region src/quota-contract.ts
		/** Same-origin endpoint exposing every non-active stored account's rolling windows. */
		const OPENAI_CODEX_QUOTA_PATH = "/plugins/dsh-openai-codex/quota";
		//#endregion
		//#region src/client/quota-service.ts
		/** How long the last reported quota survives refreshes that report nothing. */
		const STALE_HOLD_MS = 5 * 6e4;
		/** How often the Host is asked for the other accounts' figures while observed. */
		const QUOTA_REFRESH_MS = 6e4;
		/** The signed-in usage, or null for every other account state. */
		function usageOf(snapshot) {
			const status = snapshot.status;
			return status.status === "signed-in" ? status.usage : null;
		}
		/** Flatten one usage payload, or null when it carries nothing renderable. */
		function figuresOf(usage) {
			if (usage === null) return null;
			const windows = [];
			for (const bucket of usage.rateLimits) for (const window of bucket.windows) windows.push({
				bucketId: bucket.id,
				...bucket.name === void 0 ? {} : { bucketName: bucket.name },
				remainingPercent: window.remainingPercent,
				windowSeconds: window.windowSeconds,
				...window.resetAt === void 0 ? {} : { resetAt: window.resetAt }
			});
			const credits = usage.credits;
			const resetCredits = usage.resetCredits;
			if (windows.length === 0 && credits === void 0 && resetCredits === void 0) return null;
			return {
				windows,
				...credits === void 0 ? {} : { credits: { ...credits } },
				...resetCredits === void 0 ? {} : { resetCredits: {
					availableCount: resetCredits.availableCount,
					...resetCredits.credits === void 0 ? {} : { credits: resetCredits.credits.map((credit) => ({ ...credit })) }
				} }
			};
		}
		/** Whether a store state could not refresh the active account this round. */
		function activeReadFailed(status) {
			if (status.status === "error" || status.status === "reauth-required" || status.status === "remote-web-origin-not-trusted") return true;
			return status.status === "signed-in" && status.quotaError !== void 0;
		}
		/** Validate the Host's per-account response before it enters shared state. */
		function decodeQuotaPayload(value) {
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const entries = value["accounts"];
			if (!Array.isArray(entries) || entries.length > 16) return void 0;
			const decoded = [];
			const seen = /* @__PURE__ */ new Set();
			for (const entry of entries) {
				if (typeof entry !== "object" || entry === null || Array.isArray(entry)) return void 0;
				const record = entry;
				const accountKey = record["accountKey"];
				if (typeof accountKey !== "string" || !OPENAI_CODEX_ACCOUNT_KEY_PATTERN.test(accountKey) || seen.has(accountKey)) return void 0;
				seen.add(accountKey);
				const unavailable = record["unavailable"] === true;
				const errorCode = record["errorCode"];
				if (errorCode !== void 0 && (!unavailable || errorCode !== "reauth-required" && errorCode !== "rate-limited" && errorCode !== "unavailable")) return void 0;
				let usage;
				if (record["usage"] !== void 0) try {
					usage = decodeOpenAICodexUsage(record["usage"]);
				} catch {
					return;
				}
				if (usage === void 0 && !unavailable) return void 0;
				decoded.push({
					accountKey,
					...usage === void 0 ? {} : { usage },
					...unavailable ? { unavailable: true } : {},
					...errorCode === void 0 ? {} : { errorCode }
				});
			}
			return decoded;
		}
		/** Whether two window lists carry the same figures. */
		function sameWindows(left, right) {
			if (left.length !== right.length) return false;
			for (let index = 0; index < left.length; index += 1) {
				const a = left[index];
				const b = right[index];
				if (a.bucketId !== b.bucketId || a.bucketName !== b.bucketName || a.remainingPercent !== b.remainingPercent || a.windowSeconds !== b.windowSeconds || a.resetAt !== b.resetAt) return false;
			}
			return true;
		}
		/** Whether two credit projections carry the same figures. */
		function sameCredits(left, right) {
			if (left === void 0 !== (right === void 0)) return false;
			if (left === void 0 || right === void 0) return true;
			return left.unlimited === right.unlimited && left.balance === right.balance;
		}
		/** Whether two reset-credit projections carry the same cards. */
		function sameResetCredits(left, right) {
			if (left === void 0 !== (right === void 0)) return false;
			if (left === void 0 || right === void 0) return true;
			if (left.availableCount !== right.availableCount) return false;
			const before = left.credits ?? [];
			const after = right.credits ?? [];
			if (before.length !== after.length) return false;
			for (let index = 0; index < before.length; index += 1) {
				const a = before[index];
				const b = after[index];
				if (a.id !== b.id || a.resetType !== b.resetType || a.status !== b.status || a.grantedAt !== b.grantedAt || a.expiresAt !== b.expiresAt || a.title !== b.title) return false;
			}
			return true;
		}
		/** Whether two account entries carry the same identity, figures, and flags. */
		function sameAccount(left, right) {
			return left.accountKey === right.accountKey && left.label === right.label && left.maskedEmail === right.maskedEmail && left.active === right.active && (left.unavailable ?? false) === (right.unavailable ?? false) && left.errorCode === right.errorCode && sameWindows(left.windows, right.windows) && sameCredits(left.credits, right.credits) && sameResetCredits(left.resetCredits, right.resetCredits);
		}
		/**
		* Whether two snapshots carry the same figures. Timestamps are excluded, so a
		* value-equal refresh keeps the published object and notifies nobody.
		*/
		function sameSnapshot(left, right) {
			if (!sameWindows(left.windows, right.windows) || !sameCredits(left.credits, right.credits)) return false;
			const before = left.accounts ?? [];
			const after = right.accounts ?? [];
			if (before.length !== after.length) return false;
			for (let index = 0; index < before.length; index += 1) if (!sameAccount(before[index], after[index])) return false;
			return true;
		}
		/**
		* Bind the account store and the Host quota route as the quota service.
		* @param account - the plugin instance's account store.
		* @returns the service published as `codexQuota`.
		*/
		function createCodexQuotaService(account) {
			const listeners = /* @__PURE__ */ new Set();
			let current = null;
			let activeFigures = null;
			let activeAt = 0;
			let activeAccountKey;
			let activeUnavailable = false;
			let activeErrorCode;
			const otherFigures = /* @__PURE__ */ new Map();
			const unavailableAccounts = /* @__PURE__ */ new Map();
			let unsubscribeAccount;
			let staleTimer;
			let pollTimer;
			let pollController;
			let secondaryIdentity = "";
			const notify = () => {
				for (const listener of listeners) listener();
			};
			const clearStaleTimer = () => {
				clearTimeout(staleTimer);
				staleTimer = void 0;
			};
			/** Rebuild the published snapshot from the account list and every held figure. */
			const buildSnapshot = () => {
				if (activeFigures === null && otherFigures.size === 0 && !activeUnavailable && unavailableAccounts.size === 0) return null;
				const summaries = account.getSnapshot().accounts;
				const activeSummary = summaries.find((summary) => summary.active);
				const accounts = (activeSummary === void 0 ? [...summaries] : [activeSummary, ...summaries.filter((summary) => summary !== activeSummary)]).map((summary) => {
					const isActive = summary === activeSummary;
					const held = isActive ? void 0 : otherFigures.get(summary.accountKey);
					const figures = isActive ? activeFigures : held?.figures;
					const at = isActive ? activeAt : held?.at;
					const unavailable = isActive ? activeUnavailable : unavailableAccounts.has(summary.accountKey);
					const errorCode = isActive ? activeErrorCode : unavailableAccounts.get(summary.accountKey);
					return {
						accountKey: summary.accountKey,
						label: summary.displayName,
						...summary.maskedEmail === void 0 ? {} : { maskedEmail: summary.maskedEmail },
						active: summary.active,
						windows: figures?.windows ?? [],
						...figures?.credits === void 0 ? {} : { credits: figures.credits },
						...figures?.resetCredits === void 0 ? {} : { resetCredits: figures.resetCredits },
						...at === void 0 || at === 0 ? {} : { fetchedAt: at },
						...unavailable ? { unavailable: true } : {},
						...errorCode === void 0 ? {} : { errorCode }
					};
				});
				let newest = activeAt;
				for (const entry of otherFigures.values()) if (entry.at > newest) newest = entry.at;
				return {
					windows: activeFigures?.windows ?? [],
					...activeFigures?.credits === void 0 ? {} : { credits: activeFigures.credits },
					...summaries.length === 0 ? {} : { accounts },
					...newest === 0 ? {} : { fetchedAt: newest }
				};
			};
			const publish = () => {
				const next = buildSnapshot();
				if (current !== null && next !== null && sameSnapshot(current, next)) return;
				if (current === null && next === null) return;
				current = next;
				notify();
			};
			/** Drop each account's figures once they are older than the hold window. */
			const onStale = () => {
				staleTimer = void 0;
				const now = Date.now();
				let changed = false;
				if (activeFigures !== null && now - activeAt >= STALE_HOLD_MS) {
					activeFigures = null;
					activeAt = 0;
					activeUnavailable = false;
					activeErrorCode = void 0;
					changed = true;
				}
				for (const [key, entry] of [...otherFigures]) {
					if (now - entry.at < STALE_HOLD_MS) continue;
					otherFigures.delete(key);
					unavailableAccounts.delete(key);
					changed = true;
				}
				armStaleTimer();
				if (changed) publish();
			};
			/** Hold every figure only until its own deadline; the oldest one fires first. */
			const armStaleTimer = () => {
				clearStaleTimer();
				let soonest;
				const consider = (at) => {
					const left = STALE_HOLD_MS - (Date.now() - at);
					if (soonest === void 0 || left < soonest) soonest = left;
				};
				if (activeFigures !== null) consider(activeAt);
				for (const entry of otherFigures.values()) consider(entry.at);
				if (soonest === void 0) return;
				staleTimer = setTimeout(onStale, Math.max(0, soonest));
			};
			/** Forget figures for accounts the credential document no longer stores. */
			const prune = () => {
				const present = new Set(account.getSnapshot().accounts.map((summary) => summary.accountKey));
				for (const key of [...otherFigures.keys()]) if (!present.has(key)) otherFigures.delete(key);
				for (const key of [...unavailableAccounts.keys()]) if (!present.has(key)) unavailableAccounts.delete(key);
			};
			/** Fold one account-store snapshot into the active account's held figures. */
			const syncActive = () => {
				const snapshot = account.getSnapshot();
				const nextSecondaryIdentity = snapshot.accounts.filter((summary) => !summary.active).map((summary) => summary.accountKey).sort().join(",");
				const secondaryChanged = nextSecondaryIdentity !== secondaryIdentity;
				secondaryIdentity = nextSecondaryIdentity;
				const nextAccountKey = snapshot.accounts.find((summary) => summary.active)?.accountKey;
				if (nextAccountKey !== activeAccountKey) {
					if (activeAccountKey !== void 0 && activeFigures !== null) {
						otherFigures.set(activeAccountKey, {
							figures: activeFigures,
							at: activeAt
						});
						if (activeUnavailable) unavailableAccounts.set(activeAccountKey, activeErrorCode ?? "unavailable");
					}
					const held = nextAccountKey === void 0 ? void 0 : otherFigures.get(nextAccountKey);
					activeFigures = held?.figures ?? null;
					activeAt = held?.at ?? 0;
					activeUnavailable = nextAccountKey !== void 0 && unavailableAccounts.has(nextAccountKey);
					if (nextAccountKey !== void 0) otherFigures.delete(nextAccountKey);
					activeAccountKey = nextAccountKey;
				}
				const figures = figuresOf(usageOf(snapshot));
				if (figures === null) {
					activeUnavailable = activeReadFailed(snapshot.status);
					activeErrorCode = snapshot.status.status === "reauth-required" ? "reauth-required" : activeUnavailable ? snapshot.status.status === "signed-in" ? snapshot.status.quotaErrorCode ?? "unavailable" : "unavailable" : void 0;
				} else {
					activeFigures = figures;
					activeAt = Date.now();
					activeUnavailable = false;
					activeErrorCode = void 0;
				}
				prune();
				armStaleTimer();
				publish();
				if (secondaryChanged) {
					stopPolling();
					if (secondaryIdentity !== "") poll();
				}
			};
			/** Hold every other account's figures when a whole round could not complete. */
			const markUnavailable = () => {
				for (const summary of account.getSnapshot().accounts) if (!summary.active) unavailableAccounts.set(summary.accountKey, "unavailable");
				armStaleTimer();
				publish();
			};
			/** Merge one Host response, keeping the figures of every account it omits or fails. */
			const merge = (entries) => {
				const readAt = Date.now();
				const summaries = account.getSnapshot().accounts;
				const activeAccountKey = summaries.find((summary) => summary.active)?.accountKey;
				const returned = new Set(entries.map((entry) => entry.accountKey));
				for (const summary of summaries) if (!summary.active && !returned.has(summary.accountKey)) unavailableAccounts.set(summary.accountKey, "unavailable");
				for (const entry of entries) {
					if (entry.accountKey === activeAccountKey) continue;
					if (!summaries.some((summary) => summary.accountKey === entry.accountKey)) continue;
					const figures = entry.usage === void 0 ? null : figuresOf(entry.usage);
					if (figures === null) {
						unavailableAccounts.set(entry.accountKey, entry.errorCode ?? "unavailable");
						continue;
					}
					otherFigures.set(entry.accountKey, {
						figures,
						at: readAt
					});
					unavailableAccounts.delete(entry.accountKey);
				}
				armStaleTimer();
				publish();
			};
			const clearPollTimer = () => {
				clearTimeout(pollTimer);
				pollTimer = void 0;
			};
			const schedulePoll = () => {
				clearPollTimer();
				if (listeners.size === 0) return;
				pollTimer = setTimeout(() => {
					poll();
				}, QUOTA_REFRESH_MS);
			};
			/** Drop the pending round; the in-flight one sees its controller replaced. */
			const stopPolling = () => {
				clearPollTimer();
				pollController?.abort();
				pollController = void 0;
			};
			/** Read every non-active account once; never overlap two live rounds. */
			const poll = async () => {
				if (pollController !== void 0 || listeners.size === 0 || secondaryIdentity === "") return;
				const controller = new AbortController();
				pollController = controller;
				try {
					const { response, value } = await requestJson(OPENAI_CODEX_QUOTA_PATH, {
						method: "GET",
						headers: { accept: "application/json" },
						credentials: "same-origin",
						signal: controller.signal
					});
					if (controller.signal.aborted) return;
					const payload = response.ok ? decodeQuotaPayload(value) : void 0;
					if (payload === void 0) {
						markUnavailable();
						return;
					}
					merge(payload);
				} catch {
					if (!controller.signal.aborted) markUnavailable();
				} finally {
					if (pollController === controller) {
						pollController = void 0;
						schedulePoll();
					}
				}
			};
			return {
				snapshot: () => current,
				subscribe: (listener) => {
					listeners.add(listener);
					if (unsubscribeAccount === void 0) unsubscribeAccount = account.subscribe(syncActive);
					syncActive();
					if (listeners.size === 1 && pollController === void 0) {
						clearPollTimer();
						poll();
					}
					return () => {
						listeners.delete(listener);
						if (listeners.size > 0) return;
						if (unsubscribeAccount !== void 0) {
							unsubscribeAccount();
							unsubscribeAccount = void 0;
						}
						clearStaleTimer();
						stopPolling();
					};
				}
			};
		}
		//#endregion
		//#region src/client/OpenAICodexModelsCard.tsx
		/** Compact Models account entry with quota disclosure and shared configuration. */
		const buttonStyle = {
			padding: "6px 14px",
			border: "1px solid var(--dsw-alias-border-l2)",
			borderRadius: 999,
			background: "transparent",
			color: "inherit",
			font: "inherit",
			fontSize: 14,
			cursor: "pointer"
		};
		const secondaryStyle = {
			fontSize: 12,
			lineHeight: "18px",
			color: "var(--dsw-alias-label-secondary)"
		};
		/** Native modality contains keyboard focus and restores it to More settings on close. */
		function ConfigurationDialog({ t, configScope, onClose }) {
			const dialog = (0, react.useRef)(null);
			const titleId = (0, react.useId)();
			(0, react.useEffect)(() => {
				const element = dialog.current;
				element?.showModal();
				return () => {
					element?.close();
				};
			}, []);
			const close = () => {
				dialog.current?.close();
				onClose();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("dialog", {
				ref: dialog,
				"aria-labelledby": titleId,
				onCancel: (event) => {
					event.preventDefault();
					close();
				},
				onKeyDown: (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						event.preventDefault();
						close();
						return;
					}
					if (event.key !== "Tab") return;
					const focusable = Array.from(event.currentTarget.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], summary")).filter((element) => element.getClientRects().length > 0);
					const first = focusable[0];
					const last = focusable.at(-1);
					if (first === void 0 || last === void 0) return;
					if (event.shiftKey && document.activeElement === first) {
						event.preventDefault();
						last.focus();
					} else if (!event.shiftKey && document.activeElement === last) {
						event.preventDefault();
						first.focus();
					}
				},
				style: {
					boxSizing: "border-box",
					width: "min(720px, calc(100vw - 32px))",
					maxHeight: "calc(100dvh - 32px)",
					overflowY: "auto",
					padding: 20,
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					background: "var(--dsw-alias-bg-layer-1, white)",
					color: "var(--dsw-alias-label-primary)",
					margin: "auto"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
							gap: 12
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", {
							id: titleId,
							style: {
								margin: 0,
								fontSize: 18
							},
							children: t("moreSettingsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							style: buttonStyle,
							onClick: close,
							children: t("closeSettings")
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						style: secondaryStyle,
						children: t("settingsSaveHint")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OpenAICodexConfiguration, {
						t,
						...configScope === void 0 ? {} : { scope: configScope }
					})
				]
			});
		}
		function OpenAICodexModelsCard({ t, account, configScope }) {
			const [expanded, setExpanded] = (0, react.useState)(false);
			const [settingsOpen, setSettingsOpen] = (0, react.useState)(false);
			const detailsId = (0, react.useId)();
			const snapshot = (0, react.useSyncExternalStore)(account.subscribe, account.getSnapshot);
			const { status } = snapshot;
			const label = accountStatusLabel(status.status, t);
			(0, react.useEffect)(() => {
				if (status.status !== "signed-in") setExpanded(false);
			}, [status.status]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					borderRadius: 12,
					padding: "12px 14px",
					color: "var(--dsw-alias-label-primary)"
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							display: "flex",
							alignItems: "center",
							flexWrap: "wrap",
							gap: 10
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: 14,
									lineHeight: "22px",
									fontWeight: 500
								},
								children: t("modelsProviderName")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								"aria-hidden": "true",
								style: {
									...dotStyle(status.status),
									width: 8,
									height: 8
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								role: "status",
								style: {
									...secondaryStyle,
									flex: 1
								},
								children: label
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: {
							...secondaryStyle,
							marginTop: 4
						},
						children: t("modelsProviderSupport")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						style: { marginTop: 12 },
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountManager, {
							t,
							store: account,
							snapshot,
							compact: true,
							quotaExpanded: expanded,
							quotaControlsId: detailsId,
							onToggleQuota: () => {
								setExpanded(!expanded);
							}
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountFeedback, {
						t,
						snapshot,
						store: account
					}),
					expanded && status.status === "signed-in" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						id: detailsId,
						style: {
							borderTop: "1px solid var(--dsw-alias-border-l2)",
							marginTop: 12,
							paddingTop: 12
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageLimits, {
							t,
							usage: status.usage,
							heading: false,
							...status.quotaError === void 0 ? {} : { quotaError: status.quotaError }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							...secondaryStyle,
							marginTop: 12
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("modelsAccountHelp") }),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								onClick: () => {
									setSettingsOpen(true);
								},
								style: {
									...buttonStyle,
									padding: 0,
									border: 0,
									fontSize: "inherit",
									textDecoration: "underline"
								},
								children: t("moreSettings")
							})
						]
					}),
					settingsOpen && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ConfigurationDialog, {
						t,
						...configScope === void 0 ? {} : { configScope },
						onClose: () => {
							setSettingsOpen(false);
						}
					})
				]
			});
		}
		//#endregion
		//#region src/client/config-form.ts
		/**
		* The Host form validates its serialized schema in the browser. Codex Connect's
		* Host-only schema transforms cannot be rehydrated there, so read the same
		* accepted Host view through this package's browser-safe decoder. Writes still
		* use the Host form's ordered queue and revision checks.
		*/
		var OpenAICodexConfigForm = class {
			form;
			mirror;
			formSnapshot;
			mirrorSnapshot;
			projected;
			constructor(form, mirror) {
				this.form = form;
				this.mirror = mirror;
			}
			getSnapshot() {
				const form = this.form.getSnapshot();
				const mirror = this.mirror.getSnapshot();
				if (form === this.formSnapshot && mirror === this.mirrorSnapshot && this.projected !== void 0) return this.projected;
				this.formSnapshot = form;
				this.mirrorSnapshot = mirror;
				if (form.status === "ready") return this.projected = form;
				if (mirror.view === void 0) return this.projected = form;
				const view = mirror.view.namespaces.find((candidate) => candidate.ns === OPENAI_CODEX_SETTINGS_NAMESPACE);
				if (view === void 0) return this.projected = {
					...form,
					status: "unavailable",
					writable: mirror.view.writable
				};
				const value = decodeOpenAICodexSettings(view.value);
				this.projected = value === void 0 ? {
					...form,
					status: "unavailable"
				} : {
					status: "ready",
					value,
					base: view.base,
					user: view.user,
					revision: view.revision,
					writable: mirror.view.writable
				};
				return this.projected;
			}
			subscribe(listener) {
				const stopForm = this.form.subscribe(listener);
				const stopMirror = this.mirror.subscribe(listener);
				return () => {
					stopForm();
					stopMirror();
				};
			}
			mutate(ops, expectedRevision) {
				return this.form.mutate(ops, expectedRevision);
			}
			set(field, value) {
				return this.form.set(field, value);
			}
			unset(field) {
				return this.form.unset(field);
			}
		};
		//#endregion
		//#region src/client/RecentRequests.tsx
		/** Recent Codex request summaries inside the sidebar usage dialog. */
		/** @param value - token count. @returns compact English-unit token text (K/M/B) regardless of UI locale. */
		function formatTokens(value) {
			if (value === 0) return "0";
			return new Intl.NumberFormat("en-US", {
				notation: "compact",
				maximumFractionDigits: 2
			}).format(value);
		}
		/** @param value - byte count. @returns a binary byte label. */
		function formatBytes(value) {
			if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
			if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
			return `${value} B`;
		}
		/** @param value - epoch milliseconds. @param locale - display locale. @returns local clock time. */
		function formatTime(value, locale) {
			return new Intl.DateTimeFormat(locale, {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit",
				hour12: false
			}).format(value);
		}
		/** Locale keys for the request-purpose tag. */
		const KIND_KEYS = {
			conversation: "ov.recent.kind.conversation",
			title: "ov.recent.kind.title",
			compaction: "ov.recent.kind.compaction",
			subagent: "ov.recent.kind.subagent",
			"auto-review": "ov.recent.kind.autoReview"
		};
		function Metric({ label, value }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: "cc-recent-metric",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cc-recent-metric-label",
					children: label
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cc-recent-metric-value",
					children: value
				})]
			});
		}
		function Row({ request, t, locale }) {
			const reasoning = request.payloadReasoning === void 0 ? request.reasoning : request.payloadReasoning;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("article", {
				className: "cc-recent-row",
				"data-outcome": request.outcome,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-recent-lead",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: `cc-recent-transport cc-recent-transport-${request.transport}`,
								children: t(request.transport === "ws" ? "ov.recent.transport.ws" : "ov.recent.transport.sse")
							}),
							request.continuation === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-recent-kind",
								"data-kind": "continuation",
								title: request.mismatch,
								children: t(request.continuation === "delta" ? "ov.recent.continuation.delta" : "ov.recent.continuation.full")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-recent-model",
								title: request.model,
								children: request.model
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-recent-kind",
								"data-kind": request.kind,
								children: t(KIND_KEYS[request.kind])
							}),
							request.outcome === "ok" ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-recent-outcome",
								"data-outcome": request.outcome,
								children: t(request.outcome === "error" ? "ov.recent.outcome.error" : "ov.recent.outcome.aborted")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("time", {
								className: "cc-recent-time",
								dateTime: new Date(request.startedAt).toISOString(),
								children: formatTime(request.startedAt, locale)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-recent-key",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-recent-key-label",
							children: t("ov.recent.key")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-recent-key-value",
							title: request.routeLabel,
							children: request.routeLabel
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-recent-metrics",
						"aria-label": t("ov.recent.metrics"),
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("ov.recent.in"),
								value: formatTokens(request.inputTokens)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("ov.recent.out"),
								value: formatTokens(request.outputTokens)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("ov.recent.cacheW"),
								value: formatTokens(request.cacheWriteTokens)
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Metric, {
								label: t("ov.recent.cacheR"),
								value: formatTokens(request.cacheReadTokens)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-recent-meta",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("ov.recent.reasoning"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: reasoning ?? "—" })
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("ov.recent.body"),
							" ",
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: request.continuation === "delta" ? request.deltaBytes === void 0 ? t("ov.recent.bodyDelta") : t("ov.recent.bodyDelta") + " · " + formatBytes(request.deltaBytes) : request.bodyBytes === void 0 ? "—" : formatBytes(request.bodyBytes) })
						] })]
					})
				]
			});
		}
		/**
		* Render the bounded recent-request list, its empty/loading/failure states and the
		* scope note; the Parent dialog owns visibility and refresh cadence.
		*/
		function RecentRequests({ t, store }) {
			const snapshot = (0, react.useSyncExternalStore)(store.subscribe, store.snapshot);
			const locale = t("dateLocale");
			const titleId = (0, react.useId)();
			const requests = snapshot.requests;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cc-recent",
				"aria-labelledby": titleId,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-recent-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: titleId,
							className: "cc-recent-title",
							children: t("ov.recent.title")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-recent-limit",
							children: t("ov.recent.limit")
						})]
					}),
					snapshot.state === "loading" && requests.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cc-codex-empty",
						role: "status",
						children: t("ov.recent.loading")
					}) : null,
					snapshot.state === "failed" && requests.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-codex-empty",
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("ov.recent.failed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cc-usage-quota-detail-action",
							onClick: () => {
								store.refresh();
							},
							children: t("ov.recent.retry")
						})]
					}) : null,
					snapshot.state === "ready" && requests.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-codex-empty",
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", { children: t("ov.recent.empty") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cc-recent-empty-hint",
							children: t("ov.recent.emptyHint")
						})]
					}) : null,
					snapshot.state === "failed" && requests.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-recent-inline-failure",
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("ov.recent.failed") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cc-usage-quota-detail-action",
							onClick: () => {
								store.refresh();
							},
							children: t("ov.recent.retry")
						})]
					}) : null,
					requests.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "cc-recent-list",
						children: requests.map((request) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Row, {
							request,
							t,
							locale
						}, request.id))
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cc-recent-note",
						children: t("ov.recent.note")
					})
				]
			});
		}
		//#endregion
		//#region src/client/CompactAccountUsage.tsx
		/** Dense per-account quota table for the sidebar dialog. */
		const FIVE_HOURS = 18e3;
		const SEVEN_DAYS = 604800;
		/** @param account - one account. @param seconds - exact window length. @returns its most constrained window, if reported. */
		function windowOf(account, seconds) {
			let selected;
			for (const window of account.windows) {
				if (window.windowSeconds !== seconds) continue;
				if (selected === void 0 || window.remainingPercent < selected.remainingPercent) selected = window;
			}
			return selected;
		}
		/** @param win - one rolling window. @returns a short relative reset label, when known. */
		function resetIn(win) {
			if (win.resetAt === void 0) return void 0;
			const left = win.resetAt * 1e3 - Date.now();
			return left > 0 ? fmtDuration(left) : void 0;
		}
		/** One fixed 5h/7d cell: percentage, meter and relative reset, or a quiet dash. */
		function QuotaCell({ win, t }) {
			if (win === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-account-quota cc-account-quota-empty",
				children: "—"
			});
			const percent = Math.max(0, Math.min(100, Math.round(win.remainingPercent)));
			const reset = resetIn(win);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-account-quota",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-account-quota-line",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-account-quota-value",
						children: t("ov.quota.remaining", { p: percent })
					}), reset === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "cc-account-quota-reset",
						children: reset
					})]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cc-account-meter",
					"data-low": percent <= 20 ? "true" : void 0,
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { style: { width: percent + "%" } })
				})]
			});
		}
		/** @param account - one account. @param t - locale. @returns reset count plus the nearest dated card. */
		function ResetCell({ account, t }) {
			if (account.resetCredits === void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cc-account-reset cc-account-quota-empty",
				children: "—"
			});
			const nearest = (account.resetCredits.credits ?? []).map((credit) => credit.expiresAt).filter((value) => value !== void 0).sort((left, right) => left - right)[0];
			const date = nearest === void 0 ? void 0 : new Intl.DateTimeFormat(t("dateLocale"), {
				month: "2-digit",
				day: "2-digit"
			}).format(nearest * 1e3);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-account-reset",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cc-account-reset-count",
					children: t("ov.dash.cards", { count: account.resetCredits.availableCount })
				}), date === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cc-account-reset-date",
					children: t("ov.dash.nearest", { date })
				})]
			});
		}
		/**
		* Render every signed-in account as one aligned row: fixed 5h/7d columns,
		* a quiet reset count and the nearest card expiry. The Settings page keeps its
		* detailed per-account reset-card list; this dialog optimizes for scanning.
		*/
		function CompactAccountUsage({ accounts, quota, t }) {
			const rows = quota.accounts ?? [];
			if (rows.length === 0) return null;
			const updatedAt = formatOpenAICodexTimestamp(t("dateLocale"), quota.fetchedAt);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cc-account-summary",
				"aria-label": t("accountUsageHeading"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-account-summary-head",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", { children: t("accountUsageHeading") }), updatedAt === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("usageUpdatedAt", { time: updatedAt }) })]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-account-table",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cc-account-cell cc-account-head-cell",
							children: t("ov.dash.account")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cc-account-cell cc-account-head-cell",
							children: windowLabel(FIVE_HOURS)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cc-account-cell cc-account-head-cell",
							children: windowLabel(SEVEN_DAYS)
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cc-account-cell cc-account-head-cell",
							children: t("ov.dash.resetCards")
						}),
						rows.map((account) => {
							const name = accounts.find((candidate) => candidate.accountKey === account.accountKey)?.displayName ?? account.label;
							const active = account.active ? "true" : void 0;
							return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "cc-account-cell cc-account-name",
									"data-row": account.accountKey,
									"data-active": active,
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
											title: name === "" ? t("ov.quota.accountCurrent") : name,
											children: name === "" ? t("ov.quota.accountCurrent") : name
										}),
										account.active ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cc-account-badge",
											children: t("ov.quota.active")
										}) : null,
										account.unavailable === true || account.errorCode !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "cc-account-error",
											children: t("ov.quota.readFailed")
										}) : null
									]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "cc-account-cell",
									"data-row": account.accountKey,
									"data-active": active,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaCell, {
										win: windowOf(account, FIVE_HOURS),
										t
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "cc-account-cell",
									"data-row": account.accountKey,
									"data-active": active,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaCell, {
										win: windowOf(account, SEVEN_DAYS),
										t
									})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "cc-account-cell",
									"data-column": "reset",
									"data-row": account.accountKey,
									"data-active": active,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ResetCell, {
										account,
										t
									})
								})
							] }, account.accountKey);
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/CodexUsagePanel.tsx
		/** Sidebar quota widget and its account usage dialog. */
		/** Whether a panel is currently open; the capsule and the panel share this store. */
		var CodexUsagePanelStore = class {
			open = false;
			listeners = /* @__PURE__ */ new Set();
			/** @param listener - notified whenever the open flag changes. @returns its disposer. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** @returns whether the usage panel is open. */
			snapshot = () => this.open;
			/** Open the panel. */
			show() {
				this.setOpen(true);
			}
			/** Close the panel. */
			close() {
				this.setOpen(false);
			}
			setOpen(next) {
				if (this.open === next) return;
				this.open = next;
				for (const listener of this.listeners) listener();
			}
		};
		/** Actionable local usage failures; ordinary loading stays silent. */
		function LocalUsageNotice({ t, usage, source, compact = false }) {
			if (source === void 0) return null;
			const message = usage.state === "unavailable" ? t("ov.local.unavailable") : usage.state === "failed" || usage.failure === "request" ? t("ov.local.failed") : void 0;
			if (message === void 0) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-codex-empty",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "status",
					children: message
				}), compact ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "cc-usage-quota-detail-action",
					onClick: () => {
						source.retry();
					},
					children: t("ov.local.retry")
				})]
			});
		}
		/** Present only the established daily figure for the current calendar. */
		function currentUsageDays(data, day) {
			const value = data?.days[day];
			return value === void 0 ? {} : { [day]: value };
		}
		/** Original compact quota card; the collapsed rail retains the same gauge entry. */
		function CodexUsageCapsule({ t, quota, panel, wide, localUsage }) {
			const open = (0, react.useSyncExternalStore)(panel.subscribe, panel.snapshot);
			const usage = (0, react.useSyncExternalStore)(localUsage?.subscribe ?? subscribeUnavailableUsage, localUsage?.snapshot ?? unavailableUsageSnapshot);
			const locale = t("dateLocale");
			const Grid = (0, react.useMemo)(() => makeQuotaGrid(quota, {
				t,
				fmtDuration,
				locale
			}), [
				quota,
				t,
				locale
			]);
			const today = usageToday(usage.data?.timeZone);
			const show = () => {
				panel.show();
			};
			if (wide !== true) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "cc-usage-entry cc-usage-entry-rail",
				title: t("ov.entry"),
				"aria-label": t("ov.entry"),
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				onClick: show,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cc-usage-entry-icon",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexSettingsIcon, { size: 18 })
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-usage-widget",
				role: "button",
				tabIndex: 0,
				title: t("ov.entry"),
				"aria-label": t("ov.entry"),
				"aria-haspopup": "dialog",
				"aria-expanded": open,
				onClick: show,
				onKeyDown: (event) => {
					if (event.target !== event.currentTarget) return;
					if (event.key === "Enter" || event.key === " ") {
						event.preventDefault();
						show();
					}
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-usage-widget-head",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-entry-icon",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexSettingsIcon, { size: 14 })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-widget-title",
								children: t("ov.entry")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cc-usage-widget-more",
								"aria-hidden": "true",
								children: String.fromCharCode(8250)
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocalUsageNotice, {
						t,
						usage,
						source: localUsage,
						compact: true
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Grid, {
						days: currentUsageDays(usage.data, today),
						today,
						compact: true,
						onSelectDay: show
					})
				]
			});
		}
		/** Four compact headline figures with active balance/today drill-down detail. */
		function UsageSummary({ t, days, today, currency, recent }) {
			const entry = balanceEntryOf((0, react.useSyncExternalStore)(subscribePlatformBalance, platformBalanceSnapshot), currency);
			const totals = Object.hasOwn(days, today) ? days[today] : void 0;
			const summary = recent.summary;
			const hitRate = summary !== void 0 && summary.totalInputTokens > 0 ? new Intl.NumberFormat(t("dateLocale"), {
				style: "percent",
				maximumFractionDigits: 1
			}).format(summary.cachedInputTokens / summary.totalInputTokens) : "—";
			const [detail, setDetail] = (0, react.useState)(null);
			const title = detail === "balance" ? t("ov.quota.balance") : detail === "today" ? t("ov.quota.today") : "";
			const rows = detail === "balance" && entry !== null ? [
				[t("ov.quota.detail.total"), symbolOf(entry.currency) + entry.total.toFixed(2)],
				[t("ov.quota.detail.granted"), symbolOf(entry.currency) + entry.granted.toFixed(2)],
				[t("ov.quota.detail.topped"), symbolOf(entry.currency) + entry.toppedUp.toFixed(2)],
				[t("ov.quota.detail.currency"), entry.currency]
			] : detail === "today" && totals !== void 0 ? [
				[t("ov.kpi.tokens"), fmt(totals.tokens)],
				[t("ov.quota.detail.sessions"), String(totals.sessions)],
				[t("ov.quota.detail.requests"), fmt(totals.requests)]
			] : [];
			const toggle = (next) => {
				setDetail((current) => current === next ? null : next);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "cc-kpi",
				"aria-label": t("ov.quota.platform"),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-kpi-grid",
					children: [
						entry === null ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "cc-kpi-tile",
							"aria-expanded": detail === "balance",
							onClick: () => {
								toggle("balance");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-label",
									children: t("ov.quota.balance")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-value",
									children: symbolOf(entry.currency) + entry.total.toFixed(2)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-sub",
									children: t("ov.quota.balanceSub", {
										granted: entry.granted.toFixed(2),
										topped: entry.toppedUp.toFixed(2)
									})
								})
							]
						}),
						totals === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "cc-kpi-tile",
							"aria-expanded": detail === "today",
							onClick: () => {
								toggle("today");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-label",
									children: t("ov.quota.today")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-value",
									children: fmt(totals.tokens)
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-sub",
									children: t("ov.kpi.tokens")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cc-kpi-tile",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-label",
									children: t("ov.kpi.cacheHit")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-value",
									children: hitRate
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-sub",
									children: t("ov.kpi.cacheScope")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cc-kpi-tile",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-label",
									children: t("ov.kpi.concurrency")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-value",
									children: recent.state === "ready" && summary !== void 0 ? summary.activeRequests.toLocaleString(t("dateLocale")) : "—"
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cc-kpi-sub",
									children: t("ov.kpi.concurrencyScope")
								})
							]
						})
					]
				}), rows.length === 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cc-usage-quota-detail",
					role: "group",
					"aria-label": title,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-usage-quota-detail-head",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-usage-quota-detail-title",
							children: title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cc-usage-quota-detail-close",
							"aria-label": t("cmd.close"),
							onClick: () => {
								setDetail(null);
							},
							children: String.fromCharCode(215)
						})]
					}), rows.map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-usage-quota-detail-row",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-usage-quota-detail-label",
							children: label
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "cc-usage-quota-detail-value",
							children: value
						})]
					}, label))]
				})]
			});
		}
		/** Shared read-only usage content for the overview tab and the existing dialog. */
		function CodexUsageOverview({ t, account, quota, localUsage, recent, includeAccountUsage = true, showStatus = true }) {
			const snapshot = (0, react.useSyncExternalStore)(account.subscribe, account.getSnapshot);
			const recentSnapshot = (0, react.useSyncExternalStore)(recent.subscribe, recent.snapshot);
			const quotaSnapshot = (0, react.useSyncExternalStore)(quota.subscribe, quota.snapshot);
			const usage = (0, react.useSyncExternalStore)(localUsage?.subscribe ?? subscribeUnavailableUsage, localUsage?.snapshot ?? unavailableUsageSnapshot);
			const today = usageToday(usage.data?.timeZone);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cc-usage-panel",
				children: [
					showStatus ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cc-usage-status",
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							"aria-hidden": "true",
							style: dotStyle(snapshot.status.status)
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: accountStatusLabel(snapshot.status.status, t) })]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocalUsageNotice, {
						t,
						usage,
						source: localUsage
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(UsageSummary, {
						t,
						days: currentUsageDays(usage.data, today),
						today,
						currency: t("dateLocale") === "zh-CN" ? "cny" : "usd",
						recent: recentSnapshot
					}),
					includeAccountUsage && quotaSnapshot !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CompactAccountUsage, {
						accounts: snapshot.accounts,
						quota: quotaSnapshot,
						t
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(RecentRequests, {
						t,
						store: recent
					})
				]
			});
		}
		/** Account usage dialog; its entry and read-only interactions remain unchanged. */
		function CodexUsagePanel(props) {
			const { t, panel, recent } = props;
			const open = (0, react.useSyncExternalStore)(panel.subscribe, panel.snapshot);
			(0, react.useEffect)(() => {
				if (!open) return;
				recent.refresh();
				const timer = setInterval(() => {
					recent.refresh();
				}, 5e3);
				return () => {
					clearInterval(timer);
				};
			}, [open, recent]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.Modal, {
				open,
				onClose: () => {
					panel.close();
				},
				title: t("usagePanelTitle"),
				closeLabel: t("close"),
				className: "cc-usage-dialog",
				contentClassName: "cc-usage-dialog-content",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CodexUsageOverview, { ...props })
			});
		}
		//#endregion
		//#region src/client/usage-styles.ts
		/** Styles preserving the original sidebar quota widget layout. */
		const usageStyles = `
.cc-usage-entry { display: flex; align-items: center; gap: 8px; width: calc(100% + 4px); height: 42px; box-sizing: border-box; margin: 0 -2px; border: 0; padding: 0 10px 0 8px; overflow: hidden; background: transparent; border-radius: 12px; color: var(--dsw-alias-label-primary); font-family: inherit; font-size: 14px; line-height: 22px; cursor: pointer; }
.cc-usage-entry:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-usage-entry-rail { flex: none; justify-content: center; gap: 0; width: 36px; height: 36px; margin: 0; padding: 0; border-radius: 50%; }
.cc-usage-entry-icon { flex: none; }
.cc-usage-entry-label { flex: 1 1 auto; min-width: 0; text-align: left; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-usage-quota { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.cc-usage-quota-multi { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.cc-usage-quota-cell { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
.cc-usage-quota-cell:hover { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
.cc-usage-quota-cell:focus-visible { outline: 2px solid color-mix(in srgb, var(--cc-usage-accent) 60%, transparent); outline-offset: 1px; }
.cc-usage-quota-on { border-color: color-mix(in srgb, var(--cc-usage-accent) 65%, transparent); }
.cc-usage-quota-label { display: flex; align-items: center; gap: 4px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cc-usage-quota-value { font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-usage-quota-sub { color: var(--dsw-alias-label-tertiary); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-usage-quota-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-usage-quota-rank { flex: none; margin-left: auto; padding: 0 5px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent); color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 15px; font-variant-numeric: tabular-nums; }
.cc-usage-quota-legend { grid-column: 1 / -1; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 12px; font-size: 10px; color: var(--dsw-alias-label-secondary); }
.cc-usage-quota-legend-item { display: inline-flex; align-items: center; gap: 4px; min-width: 0; }
.cc-usage-quota-legend-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-usage-quota-legend .cc-usage-quota-rank { margin-left: 0; }
.cc-usage-quota-detail { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 80%, transparent); }
.cc-usage-quota-detail-head { display: flex; align-items: center; gap: 6px; }
.cc-usage-quota-detail-title { font-weight: 600; color: var(--dsw-alias-label-primary); font-size: 12px; }
.cc-usage-quota-detail-close { margin-left: auto; border: 0; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; font-size: 13px; line-height: 1; padding: 2px 5px; border-radius: 6px; }
.cc-usage-quota-detail-close:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cc-usage-quota-detail-row { display: flex; align-items: baseline; gap: 8px; font-size: 12px; }
.cc-usage-quota-detail-label { color: var(--dsw-alias-label-secondary); }
.cc-usage-quota-detail-value { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--dsw-alias-label-primary); }
.cc-usage-quota-detail-action { align-self: flex-start; margin-top: 2px; border: 1px solid color-mix(in srgb, var(--cc-usage-accent) 45%, transparent); color: var(--cc-usage-accent); background: color-mix(in srgb, var(--cc-usage-accent) 10%, transparent); border-radius: 999px; font: inherit; font-size: 11px; padding: 2px 10px; cursor: pointer; }
.cc-usage-quota-detail-action:hover { background: color-mix(in srgb, var(--cc-usage-accent) 18%, transparent); }
.cc-usage-widget { --cc-usage-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--color-blue-500)); display: flex; flex-direction: column; gap: 6px; margin: 2px 0 6px; padding: 8px 9px 9px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l2) 70%, transparent); background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 62%, transparent); backdrop-filter: blur(18px) saturate(150%); -webkit-backdrop-filter: blur(18px) saturate(150%); box-shadow: var(--dsw-shadow-lv1, 0 2px 10px rgba(0, 0, 0, 0.18)); width: 100%; box-sizing: border-box; min-width: 0; cursor: pointer; transition: background 120ms ease, box-shadow 120ms ease; }
.cc-usage-widget:hover { background: color-mix(in srgb, var(--dsw-alias-bg-layer-1) 78%, transparent); box-shadow: var(--dsw-shadow-lv2, 0 4px 16px rgba(0, 0, 0, 0.22)); }
.cc-usage-widget:focus-visible { outline: 2px solid color-mix(in srgb, var(--cc-usage-accent) 60%, transparent); outline-offset: 2px; }
.cc-usage-widget-head { display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-usage-widget-title { font-weight: 600; }
.cc-usage-widget-more { margin-left: auto; opacity: 0.5; }
.cc-usage-quota-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.cc-usage-quota-account { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; min-width: 0; padding: 5px 8px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent); font: inherit; color: inherit; text-align: left; cursor: pointer; transition: border-color 120ms ease; }
.cc-usage-quota-account:hover { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
.cc-usage-quota-account-head { display: flex; align-items: center; gap: 4px; min-width: 0; }
.cc-usage-quota-account .cc-usage-quota-rank { margin-left: 0; }
.cc-usage-quota-account-name { font-size: 10px; color: var(--dsw-alias-label-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-usage-quota-account-windows { margin-left: auto; display: flex; align-items: baseline; gap: 10px; flex: none; font-variant-numeric: tabular-nums; }
.cc-usage-quota-window { display: inline-flex; align-items: baseline; gap: 3px; }
.cc-usage-quota-window-label { font-size: 10px; color: var(--dsw-alias-label-tertiary); }
.cc-usage-quota-window-value { font-size: 12px; font-weight: 600; }
.cc-usage-quota-compact .cc-usage-quota-cell { padding: 6px 7px; border-radius: 8px; background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 72%, transparent); }
.cc-usage-quota-compact .cc-usage-quota-label { font-size: 10px; }
.cc-usage-quota-compact .cc-usage-quota-value { font-size: 13px; }
.cc-usage-quota-compact .cc-usage-quota-sub { font-size: 10px; }
`;
		/** Dialog layout complements shared modal focus, dismissal and safe-area behavior. */
		const usageDialogStyles = `
.cc-usage-dialog { width: min(940px, calc(100vw - 32px)); max-width: calc(100vw - 32px); }
.cc-usage-dialog-content { overflow-y: auto; max-height: calc(100dvh - 100px); box-sizing: border-box; padding-right: 20px; }
.cc-usage-panel { --cc-usage-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--color-blue-500)); display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.cc-usage-status { display: flex; align-items: center; gap: 9px; }
.cc-kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px; }
.cc-kpi-tile { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-width: 0; min-height: 64px; padding: 9px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-2); font: inherit; color: inherit; text-align: left; }
button.cc-kpi-tile { cursor: pointer; transition: border-color 120ms ease, background 120ms ease; }
button.cc-kpi-tile:hover { border-color: color-mix(in srgb, var(--cc-usage-accent) 45%, var(--dsw-alias-border-l2)); }
button.cc-kpi-tile:focus-visible { outline: 2px solid color-mix(in srgb, var(--cc-usage-accent) 60%, transparent); outline-offset: 1px; }
.cc-kpi-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-kpi-value { color: var(--dsw-alias-label-primary); font-size: 18px; font-weight: 650; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-kpi-sub { color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cc-kpi-tile[data-low="true"] .cc-kpi-value { color: var(--dsw-alias-state-error-primary); }
@media (max-width: 720px) {
  .cc-kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
.cc-account-summary { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
.cc-account-summary-head { display: flex; align-items: baseline; gap: 10px; }
.cc-account-summary-head h3 { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-account-summary-head span { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-account-table { display: grid; grid-template-columns: 40% 19% 19% 22%; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-account-cell { min-width: 0; padding: 7px 10px; text-align: left; vertical-align: middle; }
.cc-account-head-cell { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-tertiary); font-size: 10px; font-weight: 500; }
.cc-account-cell[data-row] { border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-account-cell[data-active="true"] { background: color-mix(in srgb, var(--cc-usage-accent) 4%, transparent); }
.cc-account-name { display: flex; align-items: center; gap: 6px; min-width: 0; }
.cc-account-name strong { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
.cc-account-badge { flex: none; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, var(--cc-usage-accent) 12%, transparent); color: var(--cc-usage-accent); font-size: 10px; line-height: 16px; }
.cc-account-error { margin-left: auto; color: var(--dsw-alias-state-error-primary, #d92d20); font-size: 10px; }
.cc-account-quota { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cc-account-quota-line { display: flex; justify-content: space-between; gap: 6px; font-size: 11px; }
.cc-account-quota-value { color: var(--dsw-alias-label-primary); font-weight: 600; white-space: nowrap; }
.cc-account-quota-reset { color: var(--dsw-alias-label-tertiary); font-size: 10px; white-space: nowrap; }
.cc-account-quota-empty { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-account-meter { height: 4px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 14%, transparent); }
.cc-account-meter span { display: block; height: 100%; border-radius: inherit; background: var(--cc-usage-accent); }
.cc-account-meter[data-low="true"] span { background: var(--dsw-alias-state-error-primary); }
.cc-account-reset { display: flex; flex-direction: column; gap: 1px; min-width: 0; font-size: 11px; }
.cc-account-reset-count { color: var(--dsw-alias-label-primary); }
.cc-account-reset-date { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
@media (max-width: 620px) {
  .cc-account-table { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
  .cc-account-head-cell { display: none; }
  .cc-account-cell { padding: 6px 8px; }
  .cc-account-name, .cc-account-cell[data-column="reset"] { grid-column: 1 / -1; }
  .cc-account-quota-line { flex-direction: column; gap: 0; }
  .cc-account-quota-reset { font-size: 9px; }
  .cc-account-badge { display: none; }
}
.cc-recent { display: flex; flex-direction: column; gap: 10px; min-width: 0; padding-top: 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-recent-head { display: flex; align-items: baseline; gap: 10px; }
.cc-recent-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-recent-limit { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-recent-list { display: flex; flex-direction: column; gap: 8px; }
.cc-recent-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "lead metrics" "key metrics" "meta meta"; gap: 4px 12px; padding: 10px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-recent-row[data-outcome="error"] { border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 35%, var(--dsw-alias-border-l2)); }
.cc-recent-lead { grid-area: lead; display: flex; align-items: center; gap: 8px; min-width: 0; }
.cc-recent-transport { flex: none; padding: 1px 7px; border-radius: 999px; font-size: 10px; line-height: 16px; font-weight: 600; }
.cc-recent-transport-ws { color: var(--cc-usage-accent); background: color-mix(in srgb, var(--cc-usage-accent) 14%, transparent); }
.cc-recent-transport-sse { color: var(--dsw-alias-label-primary); background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.cc-recent-model { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; }
.cc-recent-kind { flex: none; padding: 0 6px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-secondary) 10%, transparent); color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; }
.cc-recent-kind[data-kind="conversation"] { background: transparent; color: var(--dsw-alias-label-tertiary); padding: 0; }
.cc-recent-kind[data-kind="title"] { background: color-mix(in srgb, var(--cc-usage-accent) 12%, transparent); color: var(--cc-usage-accent); }
.cc-recent-kind[data-kind="compaction"] { background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); color: var(--dsw-alias-label-secondary); }
.cc-recent-kind[data-kind="subagent"] { background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); color: var(--dsw-alias-label-secondary); }
.cc-recent-kind[data-kind="auto-review"] { background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); color: var(--dsw-alias-label-secondary); }
.cc-recent-time { margin-left: auto; color: var(--dsw-alias-label-tertiary); font-size: 11px; font-variant-numeric: tabular-nums; }
.cc-recent-outcome { flex: none; color: var(--dsw-alias-state-error-primary); background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, transparent); border-radius: 999px; padding: 1px 6px; font-size: 10px; line-height: 15px; }
.cc-recent-outcome[data-outcome="aborted"] { color: var(--dsw-alias-label-secondary); background: color-mix(in srgb, var(--dsw-alias-label-secondary) 12%, transparent); }
.cc-recent-key { grid-area: key; display: flex; align-items: baseline; gap: 6px; min-width: 0; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-recent-key-label { color: var(--dsw-alias-label-tertiary); }
.cc-recent-key-value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cc-recent-metrics { grid-area: metrics; display: grid; grid-template-columns: repeat(2, minmax(62px, auto)); gap: 2px 12px; align-content: start; }
.cc-recent-metric { display: flex; align-items: baseline; gap: 4px; font-variant-numeric: tabular-nums; }
.cc-recent-metric-label { color: var(--dsw-alias-label-tertiary); font-size: 10px; }
.cc-recent-metric-value { color: var(--dsw-alias-label-primary); font-size: 12px; font-weight: 600; }
.cc-recent-meta { grid-area: meta; display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-recent-meta b { color: var(--dsw-alias-label-primary); font-weight: 600; }
.cc-recent-note { margin: 0; color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-recent-empty-hint { color: var(--dsw-alias-label-tertiary); font-size: 11px; }
.cc-recent-inline-failure { display: flex; align-items: center; gap: 8px; color: var(--dsw-alias-label-secondary); font-size: 11px; }
.cc-recent-inline-failure .cc-usage-quota-detail-action { margin-left: auto; }
@media (max-width: 620px) {
  .cc-recent-row { grid-template-columns: minmax(0, 1fr); grid-template-areas: "lead" "key" "metrics" "meta"; }
  .cc-recent-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .cc-recent-time { margin-left: 0; }
}
`;
		//#endregion
		//#region src/client/management-styles.ts
		/** Management page layout, account rows, and the shared diagnostic surfaces. */
		const managementStyles = `
/* The account list names every account and shows its limits; this list carries problems only. */
.cc-account-readiness { display: grid; gap: 10px; padding: 0; list-style: none; }
.cc-account-readiness li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: baseline; padding: 8px 0; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.cc-account-readiness li:last-child { border-bottom: 0; padding-bottom: 0; }
.cc-account-readiness small { flex-basis: 100%; color: var(--dsw-alias-label-secondary); }

/* Page shell: no outer card; the host settings page provides the frame and width. */
.cc-page { color: var(--dsw-alias-label-primary); min-width: 0; width: 100%; box-sizing: border-box; }
.cc-page-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 16px; padding: 0 0 14px; }
.cc-page-account { display: flex; align-items: center; min-width: 0; gap: 10px; flex: 1 1 240px; }
.cc-page-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); font-size: 14px; font-weight: 500; }
.cc-page-account-copy { display: flex; flex-direction: column; min-width: 0; gap: 1px; }
.cc-page-account-title { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
.cc-page-account-title strong { font-size: 15px; line-height: 22px; font-weight: 500; }
.cc-page-account-status { display: inline-flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-page-account-meta { overflow: hidden; max-width: 100%; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; text-overflow: ellipsis; white-space: nowrap; }
.cc-page-action { box-sizing: border-box; min-height: 32px; padding: 5px 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.cc-page-action:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-page-action:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: 2px; }

/* Tabs stay in the page flow: the host settings page owns the only sticky header. */
.cc-tabs { display: flex; gap: 2px; overflow-x: auto; border-bottom: 1px solid var(--dsw-alias-border-l2); scrollbar-width: none; }
.cc-tabs::-webkit-scrollbar { display: none; }
.cc-tab { position: relative; display: inline-flex; flex: 0 0 auto; align-items: center; gap: 6px; padding: 8px 11px 9px; border: 0; border-radius: 6px 6px 0 0; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 13px; line-height: 20px; white-space: nowrap; cursor: pointer; transition: background-color 120ms ease, color 120ms ease; }
.cc-tab:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.cc-tab[aria-selected="true"] { color: var(--dsw-alias-label-primary); font-weight: 500; }
.cc-tab[aria-selected="true"]::after { content: ""; position: absolute; right: 10px; bottom: 0; left: 10px; height: 2px; border-radius: 2px 2px 0 0; background: var(--dsw-alias-label-primary); }
.cc-tab:focus-visible { outline: 2px solid var(--dsw-alias-button-primary-fill); outline-offset: -2px; }
/* Counts read as data, not as status pills. */
.cc-tab-count, .cc-account-count { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; font-variant-numeric: tabular-nums; }

/* Content pane. */
.cc-content { min-width: 0; padding-top: 20px; }
.cc-content-header { margin: 0 0 20px; }
.cc-content-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 18px; line-height: 26px; font-weight: 500; }
.cc-content-subtitle { max-width: 72ch; margin: 4px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.cc-content-config { min-width: 0; }
.cc-page [role="tabpanel"][hidden] { display: none !important; }

/* Account tab. */
.cc-account-panel { display: flex; flex-direction: column; gap: 16px; }
.cc-account-panel-head { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.cc-account-panel-head h3 { display: flex; align-items: baseline; gap: 8px; margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.cc-primary-button { box-sizing: border-box; min-height: 34px; padding: 6px 14px; border: 1px solid var(--dsw-alias-button-primary-fill); border-radius: 8px; background: var(--dsw-alias-button-primary-fill); color: var(--dsw-alias-label-primary-foreground); font: inherit; font-size: 13px; cursor: pointer; }
.cc-account-list { margin: 0; padding: 0; overflow: hidden; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); list-style: none; }
.cc-account-row { position: relative; display: flex; align-items: center; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-account-row:first-child { border-top: 0; }
/* The active account is marked once, with an accent rule instead of a competing fill. */
.cc-account-row[data-active="true"] { background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 40%, transparent); box-shadow: inset 3px 0 0 var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-label-primary)); }
.cc-account-row-avatar { display: grid; place-items: center; flex: 0 0 auto; width: 36px; height: 36px; border-radius: 50%; background: var(--dsw-alias-bg-layer-2); font-size: 13px; font-weight: 500; }
.cc-account-row-copy { display: flex; flex-direction: column; min-width: 0; gap: 2px; flex: 1 1 180px; }
.cc-account-row-copy strong { overflow: hidden; font-size: 13px; line-height: 20px; font-weight: 500; text-overflow: ellipsis; }
.cc-account-row-copy span { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; overflow-wrap: anywhere; }
.cc-account-row-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; flex: 0 0 auto; margin-left: auto; }
/* Status uses one accented chip; the destructive row action stays quiet until hover. */
.cc-account-badge { padding: 0 8px; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, var(--dsw-alias-label-primary)) 14%, transparent); color: var(--dsw-alias-label-primary); font-size: 11px; line-height: 20px; }
.cc-row-button { box-sizing: border-box; min-height: 30px; padding: 4px 10px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.cc-row-button:hover { background: var(--dsw-alias-interactive-bg-hover); }
.cc-row-button-danger { color: var(--dsw-alias-label-secondary); }
.cc-row-button-danger:hover { color: var(--dsw-alias-state-error-primary); border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 45%, var(--dsw-alias-border-l2)); }
/* Disabled controls keep readable text instead of fading the whole button. */
.cc-primary-button:disabled, .cc-row-button:disabled, .cc-page-action:disabled { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-dimmed); cursor: default; }
.cc-account-footer { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.cc-account-footer p { max-width: 60ch; margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
/* Quota sits inside its account row: spacing separates it, not a second rule. */
.cc-account-quota { flex: 1 1 100%; margin-top: 4px; }
.cc-account-auth { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; }
.cc-account-auth p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.cc-account-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 10px; padding: 18px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-account-empty h3 { margin: 0; font-size: 14px; font-weight: 500; }
.cc-account-empty p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
/* A confirmation surface, not an alarm: tinted ground, neutral border, red heading. */
.cc-account-remove { display: flex; flex-direction: column; gap: 8px; padding: 14px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 6%, transparent); }
.cc-account-remove strong { color: var(--dsw-alias-state-error-primary); font-size: 13px; font-weight: 500; }
.cc-account-remove p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-account-remove-actions { display: flex; justify-content: flex-end; gap: 8px; }

/* Shared diagnostics and configuration surfaces. */
.cc-manage-card { min-width: 0; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-card h3, .cc-manage-card strong { font-weight: 500; }
.cc-manage-card p { margin: 5px 0 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; overflow-wrap: anywhere; }
.cc-manage-diagnostics { margin-top: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-diagnostics summary { padding: 11px 14px; color: var(--dsw-alias-label-primary); font-size: 13px; cursor: pointer; }
.cc-manage-diagnostics[open] summary { border-bottom: 1px solid var(--dsw-alias-border-l2); }
.cc-manage-diagnostics > .cc-manage-card { border: 0; border-radius: 0; background: transparent; }
.cc-manage-actions { gap: 12px; border-top: 1px solid var(--dsw-alias-border-l2); }
.cc-manage-catalog { display: flex; flex-direction: column; gap: 12px; margin-top: 18px; padding: 16px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-2); }
.cc-manage-catalog h3 { margin: 0; font-size: 14px; line-height: 20px; font-weight: 500; }
.cc-manage-catalog p { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.cc-manage-catalog label { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; font-size: 13px; }
.cc-manage-catalog select { box-sizing: border-box; width: min(100%, 340px); min-height: 40px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); background: var(--dsw-alias-bg-layer-1); padding: 8px; font: inherit; }
.cc-manage-catalog ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; padding: 0; margin: 0; list-style: none; }
.cc-manage-catalog li { min-width: 0; padding: 12px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); }
.cc-manage-catalog li > div { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; font-size: 13px; }
.cc-manage-catalog code { display: block; overflow-wrap: anywhere; color: var(--dsw-alias-label-secondary); font-size: 12px; margin-top: 5px; }
.cc-manage-catalog [role="alert"] { color: var(--dsw-alias-state-error-primary); }
@container (max-width: 560px) { .cc-manage-catalog ul { grid-template-columns: minmax(0, 1fr); } }

/* Per-account Codex windows: one visual system for remaining allowance. */
.cc-codex-windows { display: flex; flex-direction: column; }
.cc-codex-window { display: grid; grid-template-columns: minmax(56px, max-content) minmax(0, 1fr) auto; align-items: baseline; gap: 4px 12px; padding: 7px 0; border-top: 1px solid var(--dsw-alias-border-l2); font-size: 13px; line-height: 20px; }
.cc-codex-window:first-child { border-top: 0; padding-top: 0; }
.cc-codex-window-label { color: var(--dsw-alias-label-secondary); }
.cc-codex-window-value { color: var(--dsw-alias-label-primary); font-weight: 500; font-variant-numeric: tabular-nums; }
.cc-codex-window-reset { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; text-align: right; }
/* Two tiers only: remaining allowance, or a critical remainder. */
.cc-codex-meter { grid-column: 1 / -1; height: 6px; overflow: hidden; border-radius: 999px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.cc-codex-meter > span { display: block; height: 100%; border-radius: inherit; background: var(--dsw-alias-state-success-primary); }
.cc-codex-meter[data-low="true"] > span { background: var(--dsw-alias-state-error-primary); }
.cc-codex-empty { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }

/* Kept for the standalone account surface and its direct component tests. */
.cc-settings-layout { grid-template-columns: minmax(176px, 220px) minmax(0, 1fr); }
.cc-settings-main { min-width: 0; width: 100%; box-sizing: border-box; }

@media (max-width: 720px) {
  .cc-page-header { padding-bottom: 12px; }
  .cc-page-action { min-height: 30px; }
  .cc-tab { padding-inline: 9px; }
  .cc-content { padding-top: 16px; }
  .cc-content-title { font-size: 17px; line-height: 24px; }
  .cc-settings-layout { grid-template-columns: minmax(0, 1fr); }
  .cc-settings-nav [role="tablist"] { display: grid !important; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; }
}
@media (max-width: 560px) {
  .cc-page-avatar { width: 34px; height: 34px; font-size: 13px; }
  .cc-page-account-title strong { font-size: 14px; line-height: 22px; }
  .cc-account-row-actions { flex-basis: 100%; margin-left: 46px; }
  .cc-codex-window { grid-template-columns: minmax(48px, max-content) minmax(0, 1fr); }
  .cc-codex-window-reset { grid-column: 1 / -1; text-align: left; }
}
`;
		//#endregion
		//#region src/client/usage-warmup.ts
		/** Subscriber-owned view of the Session list's own usage projection values. */
		/** Owner-only warm-up trigger: starts the Host's one-pass projection backfill. */
		const BACKFILL_ROUTE = "/api/dsh-codex-connect/local-usage/backfill";
		/** Owner-only warm-up status: data only, never starts a pass. */
		const STATUS_ROUTE = "/api/dsh-codex-connect/local-usage/backfill/status";
		/** Lower bound for a Host-supplied cadence; timers have a signed 32-bit maximum. */
		const MIN_POLL_MS = 100;
		const MAX_POLL_MS = 2147483647;
		const WARMUP_STATES = new Set([
			"idle",
			"running",
			"done",
			"partial",
			"failed"
		]);
		/** @param value - Status payload field. @returns Whether it names a pass lifecycle state. */
		function isWarmupState(value) {
			return typeof value === "string" && WARMUP_STATES.has(value);
		}
		/**
		* @param value - Warm-up status response body.
		* @returns The validated pass state and the Host-configured polling cadence.
		*/
		function warmupStatusOf(value) {
			const record = asRecord(value);
			const state = record?.state;
			const pollMs = record?.pollMs;
			if (!isWarmupState(state) || typeof pollMs !== "number" || !Number.isFinite(pollMs) || pollMs <= 0) throw new Error("Local usage warm-up returned an invalid status");
			return {
				state,
				pollMs
			};
		}
		/** @param value - Warm-up trigger response body. @returns Its pass state, when reported. */
		function warmupStateOf(value) {
			const state = asRecord(value)?.state;
			return isWarmupState(state) ? state : void 0;
		}
		/** An abortable polling delay; disposal clears the timer and its listener together. */
		function pause(ms, signal) {
			if (signal.aborted) return Promise.resolve();
			return new Promise((resolve) => {
				const finish = () => {
					clearTimeout(timer);
					signal.removeEventListener("abort", finish);
					resolve();
				};
				const timer = setTimeout(finish, ms);
				signal.addEventListener("abort", finish, { once: true });
			});
		}
		/** @param pollMs - Host cadence. @returns The cadence bounded for a browser timer. */
		function boundedPollMs(pollMs) {
			return Math.min(MAX_POLL_MS, Math.max(MIN_POLL_MS, pollMs));
		}
		/** @param ledger - Merged ledger. @returns Frozen display data, or null when nothing was recorded. */
		function frozenLedger(ledger) {
			const days = {};
			let recorded = 0;
			for (const [day, totals] of Object.entries(ledger.days)) {
				days[day] = Object.freeze({
					tokens: totals.tokens,
					requests: totals.requests,
					sessions: totals.sessions
				});
				recorded++;
			}
			if (recorded === 0) return null;
			return Object.freeze({
				...ledger.timeZone === void 0 ? {} : { timeZone: ledger.timeZone },
				days: Object.freeze(days)
			});
		}
		/** @param left - Displayed ledger. @param right - Rebuilt ledger. @returns Whether both carry the same figures. */
		function sameLedger(left, right) {
			if (left.timeZone !== right.timeZone) return false;
			const days = Object.keys(left.days);
			if (days.length !== Object.keys(right.days).length) return false;
			for (const day of days) {
				const before = left.days[day];
				const after = right.days[day];
				if (before === void 0 || after === void 0) return false;
				if (before.tokens !== after.tokens || before.requests !== after.requests || before.sessions !== after.sessions) return false;
			}
			return true;
		}
		/**
		* Merge the per-Session `codexConnectUsage` values the Session list already carries,
		* then drive the Host's one-pass warm-up so stored Sessions acquire their row.
		*
		* The ledger is always rebuilt from the list snapshot, so known figures stay
		* visible while a pass runs and survive a failed re-pull. Polling, timers, and
		* requests exist only while the store has subscribers.
		*/
		var LocalUsageStore = class {
			ctx;
			current = Object.freeze({
				state: "loading",
				data: null
			});
			data = null;
			listeners = /* @__PURE__ */ new Set();
			detachList;
			controller;
			work;
			lastListSnapshot;
			synced = false;
			settled = false;
			restart = false;
			disposed = false;
			/** @param ctx - client root context supplying the Session list and its refresh. */
			constructor(ctx) {
				this.ctx = ctx;
			}
			/** @param listener - Called after a new immutable snapshot is published. @returns The subscription disposer. */
			subscribe = (listener) => {
				if (this.disposed) return () => {};
				this.listeners.add(listener);
				if (this.listeners.size === 1) this.activate();
				return () => {
					this.listeners.delete(listener);
					if (this.listeners.size === 0) this.deactivate();
				};
			};
			/** @returns The same snapshot until merged usage or the pass state changes. */
			snapshot = () => this.current;
			/** Re-run a failed warm-up observation; the one-pass Host never starts a second pass. */
			retry = () => {
				if (this.disposed || this.listeners.size === 0) return;
				this.settled = false;
				this.restart = false;
				this.publish(this.data === null ? "loading" : "ready");
				this.syncFromList();
				this.start();
				this.controller?.abort();
			};
			/** Abort requests, clear polling, and wait for the owned observation to settle. */
			async dispose() {
				this.disposed = true;
				this.listeners.clear();
				this.detachList?.();
				this.detachList = void 0;
				const work = this.work;
				this.controller?.abort();
				if (work === void 0) return;
				try {
					await work;
				} catch (_error) {}
			}
			/** @returns The Session face, when the Host generation supplies one. */
			sessions() {
				try {
					return this.ctx.sessions;
				} catch (_error) {
					return;
				}
			}
			activate() {
				const list = this.sessions()?.list;
				if (list !== void 0) this.detachList = list.subscribe(() => {
					this.syncFromList();
				});
				this.syncFromList();
				if (!this.settled) this.publish(this.data === null ? "loading" : "ready");
				this.start();
			}
			deactivate() {
				this.detachList?.();
				this.detachList = void 0;
				this.synced = false;
				this.lastListSnapshot = void 0;
				this.settled = false;
				this.restart = false;
				this.controller?.abort();
				this.publish(this.data === null ? "loading" : "ready");
			}
			/**
			* Rebuild the merged ledger from the list snapshot.
			* @returns Whether new figures were published.
			*/
			syncFromList() {
				const list = this.sessions()?.list;
				if (list === void 0) return false;
				const snapshot = list.getSnapshot();
				if (this.synced && snapshot === this.lastListSnapshot) return false;
				this.lastListSnapshot = snapshot;
				this.synced = true;
				const data = frozenLedger(usageLedgerOf(snapshot));
				if (data === null) return false;
				if (this.data !== null && sameLedger(this.data, data)) return false;
				this.data = data;
				this.publish(this.current.state, this.current.failure);
				return true;
			}
			publish(state, failure) {
				const next = Object.freeze({
					state,
					data: this.data,
					...failure === void 0 ? {} : { failure }
				});
				if (next.state === this.current.state && next.data === this.current.data && next.failure === this.current.failure) return;
				this.current = next;
				for (const listener of [...this.listeners]) listener();
			}
			start() {
				if (this.disposed || this.listeners.size === 0 || this.settled) return;
				if (this.controller !== void 0) {
					this.restart = true;
					return;
				}
				const controller = new AbortController();
				this.controller = controller;
				const work = this.observe(controller.signal).catch(() => {});
				this.work = work;
				work.then(() => {
					if (this.controller !== controller) return;
					this.controller = void 0;
					this.work = void 0;
					if (this.restart && !this.disposed && this.listeners.size > 0) {
						this.restart = false;
						this.start();
					}
				});
			}
			/**
			* Observe the Host's one-pass warm-up, then re-pull the list that carries the folded rows.
			* @param signal - Cancellation owned by the subscription cycle.
			* @returns Resolution once the pass settled or the observation stopped.
			*/
			async observe(signal) {
				try {
					let status = await this.readStatus(signal);
					if (signal.aborted) return;
					if (status.state === "idle") {
						const started = await this.trigger(signal);
						if (signal.aborted) return;
						status = started === void 0 || started === "idle" ? await this.readStatus(signal) : {
							state: started,
							pollMs: status.pollMs
						};
						if (signal.aborted) return;
					}
					while (status.state === "running") {
						await pause(boundedPollMs(status.pollMs), signal);
						if (signal.aborted) return;
						status = await this.readStatus(signal);
						if (signal.aborted) return;
					}
					this.settled = true;
					if (status.state !== "idle") await this.refreshSessions();
					if (signal.aborted) return;
					this.publish(status.state === "failed" ? "failed" : "ready");
				} catch (_error) {
					if (signal.aborted) return;
					this.publish("unavailable", "request");
				}
			}
			/** @param signal - Cancellation owned by the subscription cycle. @returns The validated Host status. */
			async readStatus(signal) {
				const { response, value } = await requestJson(STATUS_ROUTE, {
					method: "POST",
					signal
				});
				if (!response.ok) throw new Error("Local usage warm-up status is unavailable");
				return warmupStatusOf(value);
			}
			/** @param signal - Cancellation owned by the subscription cycle. @returns The pass state the trigger reported. */
			async trigger(signal) {
				const { response, value } = await requestJson(BACKFILL_ROUTE, {
					method: "POST",
					signal
				});
				if (!response.ok) throw new Error("Local usage warm-up could not start");
				return warmupStateOf(value);
			}
			/** Re-pull the Session list so the freshly folded projection rows reach this browser. */
			async refreshSessions() {
				const sessions = this.sessions();
				if (sessions === void 0 || typeof sessions.refresh !== "function") return;
				try {
					await sessions.refresh();
				} catch (_error) {
					return;
				}
				this.syncFromList();
			}
		};
		//#endregion
		//#region src/client/recent-requests.ts
		/** Browser reader for the Host's process-local recent Codex requests. */
		/** Same-origin route served by the plugin's Host half. */
		const RECENT_REQUESTS_ROUTE = "/api/dsh-codex-connect/recent-requests";
		function record(value) {
			return value !== null && typeof value === "object" && !Array.isArray(value) ? value : void 0;
		}
		function count(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : void 0;
		}
		function text(value) {
			return typeof value === "string" && value.length > 0 ? value : void 0;
		}
		/** @param value - route JSON. @returns the recognized kind, defaulting to a conversation. */
		function kindOf(value) {
			return value === "title" || value === "compaction" || value === "subagent" || value === "auto-review" ? value : "conversation";
		}
		function requestOf(value) {
			const entry = record(value);
			if (entry === void 0) return void 0;
			const id = text(entry["id"]);
			const provider = text(entry["provider"]);
			const model = text(entry["model"]);
			const routeLabel = text(entry["routeLabel"]);
			const startedAt = count(entry["startedAt"]);
			const transport = entry["transport"];
			const outcome = entry["outcome"];
			const inputTokens = count(entry["inputTokens"]);
			const outputTokens = count(entry["outputTokens"]);
			const cacheReadTokens = count(entry["cacheReadTokens"]);
			const cacheWriteTokens = count(entry["cacheWriteTokens"]);
			const reasoning = entry["reasoning"];
			const payloadReasoning = entry["payloadReasoning"];
			const bodyBytes = entry["bodyBytes"];
			const continuation = entry["continuation"];
			const mismatch = entry["mismatch"];
			const deltaBytes = entry["deltaBytes"];
			if (id === void 0 || provider === void 0 || model === void 0 || routeLabel === void 0 || startedAt === void 0 || transport !== "ws" && transport !== "sse" || outcome !== "ok" && outcome !== "error" && outcome !== "aborted" || inputTokens === void 0 || outputTokens === void 0 || cacheReadTokens === void 0 || cacheWriteTokens === void 0) return void 0;
			return {
				id,
				startedAt,
				provider,
				model,
				routeLabel,
				kind: kindOf(entry["kind"]),
				...typeof reasoning === "string" && reasoning.length > 0 ? { reasoning } : {},
				...payloadReasoning === null || typeof payloadReasoning === "string" ? { payloadReasoning } : {},
				transport,
				inputTokens,
				outputTokens,
				cacheReadTokens,
				cacheWriteTokens,
				...count(bodyBytes) === void 0 ? {} : { bodyBytes },
				...continuation === "delta" || continuation === "full" ? { continuation } : {},
				...typeof mismatch === "string" && mismatch.length > 0 ? { mismatch } : {},
				...count(deltaBytes) === void 0 ? {} : { deltaBytes },
				outcome
			};
		}
		/** @param value - route JSON. @returns validated newest-first requests, capped at five. */
		function recentRequestsOf(value) {
			const body = record(value);
			if (body === void 0 || !Array.isArray(body["requests"])) return [];
			return body["requests"].slice(0, 5).flatMap((entry) => {
				const request = requestOf(entry);
				return request === void 0 ? [] : [request];
			});
		}
		function summaryOf(value) {
			const summary = record(record(value)?.["summary"]);
			const activeRequests = count(summary?.["activeRequests"]);
			const cachedInputTokens = count(summary?.["cachedInputTokens"]);
			const totalInputTokens = count(summary?.["totalInputTokens"]);
			return activeRequests === void 0 || cachedInputTokens === void 0 || totalInputTokens === void 0 || cachedInputTokens > totalInputTokens ? void 0 : {
				activeRequests,
				cachedInputTokens,
				totalInputTokens
			};
		}
		/**
		* Observable recent-request source. Refreshes on demand while the panel is visible;
		* failed refreshes retain the last good rows.
		*/
		var RecentRequestsStore = class {
			current = Object.freeze({
				state: "ready",
				requests: []
			});
			listeners = /* @__PURE__ */ new Set();
			pending;
			/** @param listener - notified after each published snapshot. @returns its disposer. */
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			/** @returns the same snapshot until a refresh publishes another. */
			snapshot = () => this.current;
			/** Read the Host's current list; concurrent callers share one request. */
			refresh() {
				if (this.pending !== void 0) return this.pending;
				if (this.current.requests.length === 0 && this.current.summary === void 0) this.publish({
					state: "loading",
					requests: []
				});
				this.pending = (async () => {
					try {
						const { response, value } = await requestJson(RECENT_REQUESTS_ROUTE, { method: "GET" });
						if (!response.ok) throw new Error(`recent requests returned HTTP ${response.status}`);
						const summary = summaryOf(value);
						this.publish({
							state: "ready",
							requests: recentRequestsOf(value),
							...summary === void 0 ? {} : { summary }
						});
					} catch (_error) {
						this.publish({
							...this.current,
							state: "failed"
						});
					} finally {
						this.pending = void 0;
					}
				})();
				return this.pending;
			}
			publish(next) {
				this.current = Object.freeze({
					...next,
					requests: Object.freeze([...next.requests])
				});
				for (const listener of this.listeners) listener();
			}
		};
		//#endregion
		//#region src/client/index.tsx
		/** Stable browser-plugin name. */
		const name = "dsh-codex-connect-client";
		/** Client services required by the Plugin configuration contribution. */
		const inject = [
			"slots",
			"locale",
			"connection",
			"remote",
			"remote.session",
			"configForms",
			"sessions"
		];
		function apply(ctx) {
			const namespace = "settings.openai-codex";
			const account = new OpenAICodexAccountStore();
			ctx.effect(() => () => {
				account.dispose();
			}, "dsh-codex-connect: account observation");
			const panel = new CodexUsagePanelStore();
			ctx.provide("codexUsagePanel", { open: () => {
				panel.show();
			} });
			ctx.effect(() => {
				const style = document.createElement("style");
				style.textContent = usageStyles + usageDialogStyles + managementStyles;
				document.head.append(style);
				return () => {
					style.remove();
				};
			}, "dsh-codex-connect: usage styles");
			const quota = createCodexQuotaService(account);
			ctx.provide("codexQuota", quota);
			const localUsage = new LocalUsageStore(ctx);
			ctx.effect(() => () => localUsage.dispose(), "dsh-codex-connect: local usage observation");
			const recent = new RecentRequestsStore();
			ctx.effect(() => ctx.locale.register(namespace, {
				zh,
				en
			}), "dsh-codex-connect: settings copy");
			const t = ctx.locale.bind(namespace);
			const describe = ctx.configForms.describe();
			describe.ensure();
			const configScope = new OpenAICodexConfigForm(ctx.configForms.get(OPENAI_CODEX_SETTINGS_NAMESPACE), describe);
			ctx.effect(() => ctx.configForms.whileServed([OPENAI_CODEX_SETTINGS_NAMESPACE], () => {
				const disposeSection = ctx.slots.register({
					name: "settings.section",
					id: "codex-connect",
					order: 12,
					locale: namespace,
					label: () => t("title"),
					inject: () => ({
						t,
						configScope,
						account,
						quota,
						localUsage,
						onOpenUsage: () => {
							panel.show();
						}
					})
				}, OpenAICodexPluginCard);
				const disposeIcon = ctx.slots.register({
					name: "settings.section.icon",
					id: "codex-connect",
					label: () => t("title")
				}, CodexSettingsIcon);
				return () => {
					disposeIcon();
					disposeSection();
				};
			}), "dsh-codex-connect: settings page while served");
			ctx.slots.inject("settings.models.footer", () => ctx.slots.register({
				name: "settings.models.footer",
				id: "dsh-codex-connect-account",
				order: 100,
				inject: () => ({
					t,
					account,
					configScope
				})
			}, OpenAICodexModelsCard));
			const usageInjected = () => ({
				t,
				account,
				quota,
				panel,
				localUsage,
				recent
			});
			ctx.slots.inject("sidebar.footer.action", () => ctx.slots.register({
				name: "sidebar.footer.action",
				id: "codex-connect-usage",
				order: 11,
				locale: namespace,
				inject: usageInjected
			}, CodexUsageCapsule));
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: "codex-connect-usage",
				order: 20,
				locale: namespace,
				inject: usageInjected
			}, CodexUsagePanel));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "codex_connect_image_generate",
				locale: namespace,
				inject: () => ({
					sessions: ctx.sessions,
					configScope
				})
			}, CodexImageToolView));
			ctx.inject(["slots", "modelDirectories"], (scope) => {
				scope.slots.inject("conversation.input.right", () => scope.slots.register({
					name: "conversation.input.right",
					id: "openai-codex-fast-mode",
					order: 10,
					locale: namespace,
					inject: (sessionId) => ({
						directory: scope.modelDirectories.directoryFor(sessionId).store,
						account
					})
				}, OpenAICodexFastModeToggle));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});
