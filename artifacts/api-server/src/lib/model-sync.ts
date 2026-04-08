export interface SyncedModel {
  id: string;
  provider: "openai" | "anthropic" | "gemini" | "openrouter";
  contextLength?: number;
  ownedBy: string;
  created?: number;
  name?: string;
}

export interface ProviderSyncResult {
  provider: "openai" | "anthropic" | "gemini" | "openrouter";
  models: SyncedModel[];
  ok: boolean;
  error?: string;
  source: "live" | "static";
  fetchedAt: number;
}

export interface SyncCache {
  results: ProviderSyncResult[];
  syncedAt: number;
}

let _cache: SyncCache | null = null;

async function tryFetch(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const resp = await fetch(url, { headers, signal: ctrl.signal });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return resp.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── Static fallback lists (comprehensive, curated) ────────────────────────────

const OPENAI_STATIC: SyncedModel[] = [
  { id: "gpt-4.1",              provider: "openai", ownedBy: "openai", contextLength: 1_048_576, name: "GPT-4.1" },
  { id: "gpt-4.1-mini",         provider: "openai", ownedBy: "openai", contextLength: 1_048_576, name: "GPT-4.1 Mini" },
  { id: "gpt-4.1-nano",         provider: "openai", ownedBy: "openai", contextLength: 1_048_576, name: "GPT-4.1 Nano" },
  { id: "gpt-4o",               provider: "openai", ownedBy: "openai", contextLength: 128_000,   name: "GPT-4o" },
  { id: "gpt-4o-mini",          provider: "openai", ownedBy: "openai", contextLength: 128_000,   name: "GPT-4o Mini" },
  { id: "gpt-4-turbo",          provider: "openai", ownedBy: "openai", contextLength: 128_000,   name: "GPT-4 Turbo" },
  { id: "gpt-4",                provider: "openai", ownedBy: "openai", contextLength: 8_192,      name: "GPT-4" },
  { id: "gpt-3.5-turbo",        provider: "openai", ownedBy: "openai", contextLength: 16_384,    name: "GPT-3.5 Turbo" },
  { id: "o4-mini",              provider: "openai", ownedBy: "openai", contextLength: 200_000,   name: "o4-mini" },
  { id: "o3",                   provider: "openai", ownedBy: "openai", contextLength: 200_000,   name: "o3" },
  { id: "o3-mini",              provider: "openai", ownedBy: "openai", contextLength: 200_000,   name: "o3-mini" },
  { id: "o1",                   provider: "openai", ownedBy: "openai", contextLength: 200_000,   name: "o1" },
  { id: "o1-mini",              provider: "openai", ownedBy: "openai", contextLength: 128_000,   name: "o1-mini" },
  { id: "o1-preview",           provider: "openai", ownedBy: "openai", contextLength: 128_000,   name: "o1-preview" },
  { id: "chatgpt-4o-latest",    provider: "openai", ownedBy: "openai", contextLength: 128_000,   name: "ChatGPT-4o Latest" },
];

const ANTHROPIC_STATIC: SyncedModel[] = [
  { id: "claude-opus-4-5",          provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude Opus 4.5" },
  { id: "claude-sonnet-4-5",        provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude Sonnet 4.5" },
  { id: "claude-haiku-4-5",         provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude Haiku 4.5" },
  { id: "claude-3-7-sonnet-20250219", provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3.7 Sonnet" },
  { id: "claude-3-5-sonnet-20241022", provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3.5 Sonnet (Oct 2024)" },
  { id: "claude-3-5-sonnet-20240620", provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3.5 Sonnet (Jun 2024)" },
  { id: "claude-3-5-haiku-20241022",  provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3.5 Haiku" },
  { id: "claude-3-opus-20240229",     provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3 Opus" },
  { id: "claude-3-sonnet-20240229",   provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3 Sonnet" },
  { id: "claude-3-haiku-20240307",    provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 3 Haiku" },
  { id: "claude-2.1",                 provider: "anthropic", ownedBy: "anthropic", contextLength: 200_000, name: "Claude 2.1" },
  { id: "claude-2.0",                 provider: "anthropic", ownedBy: "anthropic", contextLength: 100_000, name: "Claude 2.0" },
];

const GEMINI_STATIC: SyncedModel[] = [
  { id: "gemini-2.5-pro-preview-05-06",    provider: "gemini", ownedBy: "gemini", contextLength: 1_048_576, name: "Gemini 2.5 Pro Preview" },
  { id: "gemini-2.5-pro-exp-03-25",        provider: "gemini", ownedBy: "gemini", contextLength: 1_048_576, name: "Gemini 2.5 Pro Exp" },
  { id: "gemini-2.5-flash-preview-04-17",  provider: "gemini", ownedBy: "gemini", contextLength: 1_048_576, name: "Gemini 2.5 Flash Preview" },
  { id: "gemini-2.5-pro",                  provider: "gemini", ownedBy: "gemini", contextLength: 2_000_000, name: "Gemini 2.5 Pro" },
  { id: "gemini-2.5-flash",                provider: "gemini", ownedBy: "gemini", contextLength: 1_048_576, name: "Gemini 2.5 Flash" },
  { id: "gemini-2.0-flash",                provider: "gemini", ownedBy: "gemini", contextLength: 1_048_576, name: "Gemini 2.0 Flash" },
  { id: "gemini-2.0-flash-lite",           provider: "gemini", ownedBy: "gemini", contextLength: 1_048_576, name: "Gemini 2.0 Flash-Lite" },
  { id: "gemini-2.0-flash-thinking-exp",   provider: "gemini", ownedBy: "gemini", contextLength: 32_767,    name: "Gemini 2.0 Flash Thinking" },
  { id: "gemini-1.5-pro-002",              provider: "gemini", ownedBy: "gemini", contextLength: 2_000_000, name: "Gemini 1.5 Pro 002" },
  { id: "gemini-1.5-flash-002",            provider: "gemini", ownedBy: "gemini", contextLength: 1_000_000, name: "Gemini 1.5 Flash 002" },
  { id: "gemini-1.5-flash-8b",             provider: "gemini", ownedBy: "gemini", contextLength: 1_000_000, name: "Gemini 1.5 Flash 8B" },
  { id: "gemini-1.0-pro",                  provider: "gemini", ownedBy: "gemini", contextLength: 32_760,    name: "Gemini 1.0 Pro" },
];

// ── Provider fetch functions ──────────────────────────────────────────────────

async function fetchOpenAIModels(): Promise<ProviderSyncResult> {
  const fetchedAt = Date.now();
  const baseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (baseUrl && apiKey) {
    try {
      const data = await tryFetch(`${baseUrl}/models`, { Authorization: `Bearer ${apiKey}` }) as { data?: { id: string; created?: number }[] };
      const raw = data.data ?? [];
      if (raw.length > 0) {
        const models: SyncedModel[] = raw
          .filter((m) => /^(gpt-|o[0-9]|chatgpt-)/.test(m.id) &&
            !m.id.includes("audio") && !m.id.includes("realtime") &&
            !m.id.includes("0301") && !m.id.includes("0613") &&
            !m.id.includes("-preview-2024") && !m.id.includes("vision-preview"))
          .map((m) => ({ id: m.id, provider: "openai" as const, ownedBy: "openai", created: m.created }))
          .sort((a, b) => a.id.localeCompare(b.id));
        return { provider: "openai", models, ok: true, source: "live", fetchedAt };
      }
    } catch { /* fall through to static */ }
  }
  return { provider: "openai", models: OPENAI_STATIC, ok: true, source: "static", fetchedAt };
}

async function fetchAnthropicModels(): Promise<ProviderSyncResult> {
  const fetchedAt = Date.now();
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (baseUrl && apiKey) {
    try {
      const data = await tryFetch(`${baseUrl}/models`, {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      }) as { data?: { id: string; display_name?: string }[] };
      const raw = data.data ?? [];
      if (raw.length > 0) {
        const models: SyncedModel[] = raw
          .filter((m) => m.id.startsWith("claude-"))
          .map((m) => ({ id: m.id, provider: "anthropic" as const, ownedBy: "anthropic", name: m.display_name }));
        return { provider: "anthropic", models, ok: true, source: "live", fetchedAt };
      }
    } catch { /* fall through to static */ }
  }
  return { provider: "anthropic", models: ANTHROPIC_STATIC, ok: true, source: "static", fetchedAt };
}

async function fetchGeminiModels(): Promise<ProviderSyncResult> {
  const fetchedAt = Date.now();
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (baseUrl && apiKey) {
    try {
      const data = await tryFetch(`${baseUrl}/models?pageSize=100`, { Authorization: `Bearer ${apiKey}` }) as {
        models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
      };
      const raw = data.models ?? [];
      if (raw.length > 0) {
        const models: SyncedModel[] = raw
          .filter((m) => {
            const id = (m.name ?? "").replace("models/", "");
            return id.startsWith("gemini-") &&
              (m.supportedGenerationMethods ?? []).some((x) => x.includes("generateContent"));
          })
          .map((m) => ({
            id: (m.name ?? "").replace("models/", ""),
            provider: "gemini" as const,
            ownedBy: "gemini",
            name: m.displayName,
          }));
        return { provider: "gemini", models, ok: true, source: "live", fetchedAt };
      }
    } catch { /* fall through to static */ }
  }
  return { provider: "gemini", models: GEMINI_STATIC, ok: true, source: "static", fetchedAt };
}

async function fetchOpenRouterModels(): Promise<ProviderSyncResult> {
  const fetchedAt = Date.now();
  // Use openrouter.ai directly — public endpoint, no auth required for listing
  const directUrl = "https://openrouter.ai/api/v1/models";
  try {
    const data = await tryFetch(directUrl, {
      "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "https://api-proxy.local",
    }) as { data?: { id: string; name?: string; context_length?: number; created?: number }[] };
    const raw = data.data ?? [];
    const models: SyncedModel[] = raw
      .filter((m) => m.context_length && m.context_length >= 4096)
      .map((m) => ({
        id: m.id,
        provider: "openrouter" as const,
        ownedBy: m.id.split("/")[0],
        contextLength: m.context_length,
        created: m.created,
        name: m.name,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    return { provider: "openrouter", models, ok: true, source: "live", fetchedAt };
  } catch (e: unknown) {
    return { provider: "openrouter", models: [], ok: false, error: String(e), source: "live", fetchedAt };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function syncAllModels(): Promise<SyncCache> {
  const settled = await Promise.allSettled([
    fetchOpenAIModels(),
    fetchAnthropicModels(),
    fetchGeminiModels(),
    fetchOpenRouterModels(),
  ]);

  const results: ProviderSyncResult[] = settled.map((r, i) => {
    const providers = ["openai", "anthropic", "gemini", "openrouter"] as const;
    if (r.status === "fulfilled") return r.value;
    return {
      provider: providers[i],
      models: [],
      ok: false,
      error: r.reason?.message ?? "Unknown error",
      source: "static" as const,
      fetchedAt: Date.now(),
    };
  });

  _cache = { results, syncedAt: Date.now() };
  return _cache;
}

export function getSyncCache(): SyncCache | null {
  return _cache;
}

export function getAllSyncedModels(): SyncedModel[] {
  return _cache?.results.flatMap((r) => r.models) ?? [];
}
