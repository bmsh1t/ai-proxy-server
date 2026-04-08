import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_FILE = path.join(__dirname, "../../usage-log.json");
const MAX_ENTRIES = 1000;

export interface UsageEntry {
  timestamp: number;
  model: string;
  provider: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  cached: boolean;
}

export interface UsageSummary {
  totalRequests: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  cachedRequests: number;
  byProvider: Record<string, {
    requests: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }>;
}

const _entries: UsageEntry[] = [];

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const lines = fs.readFileSync(LOG_FILE, "utf-8").split("\n").filter(Boolean);
    const recent = lines.slice(-MAX_ENTRIES);
    for (const line of recent) {
      try {
        const entry = JSON.parse(line) as UsageEntry;
        _entries.push(entry);
      } catch { /* skip malformed */ }
    }
    if (_entries.length > MAX_ENTRIES) _entries.splice(0, _entries.length - MAX_ENTRIES);
  } catch { /* ignore read errors */ }
}

export function appendUsage(entry: UsageEntry): void {
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch { /* ignore write errors */ }
}

export function getUsageSummary(limit = 200): { summary: UsageSummary; entries: UsageEntry[] } {
  const summary: UsageSummary = {
    totalRequests: 0,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    cachedRequests: 0,
    byProvider: {},
  };
  for (const e of _entries) {
    summary.totalRequests++;
    summary.totalPromptTokens += e.promptTokens;
    summary.totalCompletionTokens += e.completionTokens;
    summary.totalTokens += e.totalTokens;
    if (e.cached) summary.cachedRequests++;
    if (!summary.byProvider[e.provider]) {
      summary.byProvider[e.provider] = { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }
    const p = summary.byProvider[e.provider]!;
    p.requests++;
    p.promptTokens += e.promptTokens;
    p.completionTokens += e.completionTokens;
    p.totalTokens += e.totalTokens;
  }
  const recent = _entries.slice(-limit).reverse();
  return { summary, entries: recent };
}

loadFromDisk();
