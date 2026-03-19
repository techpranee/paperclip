import { spawnSync } from "node:child_process";
import { models as claudeFallbackModels } from "@paperclipai/adapter-claude-local";
import type { AdapterModel, AdapterModelDiscoveryInput } from "./types.js";

const CLAUDE_MODELS_TIMEOUT_MS = 5_000;
const CLAUDE_MODELS_CACHE_TTL_MS = 60_000;
const MAX_BUFFER_BYTES = 512 * 1024;

const cacheByFingerprint = new Map<string, { expiresAt: number; models: AdapterModel[] }>();

type ClaudeModelsCommandResult = {
  status: number | null;
  stdout: string;
  stderr: string;
  hasError: boolean;
};

type ClaudeModelsSpawnConfig = {
  command: string;
  cwd?: string;
  env: NodeJS.ProcessEnv;
  fingerprint: string;
};

function asModelArrayPayload(value: unknown): AdapterModel[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  const record = value as Record<string, unknown>;
  const data = Array.isArray(record.data) ? record.data : [];
  const models: AdapterModel[] = [];
  for (const item of data) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const rec = item as Record<string, unknown>;
    const id =
      (typeof rec.id === "string" && rec.id.trim()) ||
      (typeof rec.model === "string" && rec.model.trim()) ||
      (typeof rec.name === "string" && rec.name.trim()) ||
      "";
    if (!id) continue;
    models.push({ id, label: id });
  }
  return dedupeModels(models);
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function sanitizeModelId(raw: string): string {
  return raw
    .trim()
    .replace(/^['"`]+|['"`]+$/g, "")
    .replace(/\(.*\)\s*$/g, "")
    .trim();
}

function isLikelyModelId(raw: string): boolean {
  const value = sanitizeModelId(raw);
  if (!value) return false;
  if (!/[.:/_-]/.test(value) && value.toLowerCase() === value) return false;
  if (/^(invalid|error|failed|unauthorized|forbidden|warning)$/i.test(value)) return false;
  return /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(value);
}

function pushModelId(target: AdapterModel[], raw: string) {
  const id = sanitizeModelId(raw);
  if (!isLikelyModelId(id)) return;
  target.push({ id, label: id });
}

function collectFromJsonValue(value: unknown, target: AdapterModel[]) {
  if (typeof value === "string") {
    pushModelId(target, value);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        pushModelId(target, item);
        continue;
      }
      if (typeof item !== "object" || item === null) continue;
      const rec = item as Record<string, unknown>;
      const id =
        (typeof rec.id === "string" && rec.id) ||
        (typeof rec.model === "string" && rec.model) ||
        (typeof rec.name === "string" && rec.name) ||
        "";
      if (id) pushModelId(target, id);
      if ("models" in rec) collectFromJsonValue(rec.models, target);
      if ("data" in rec) collectFromJsonValue(rec.data, target);
      if ("items" in rec) collectFromJsonValue(rec.items, target);
    }
    return;
  }

  if (typeof value !== "object" || value === null) return;
  const rec = value as Record<string, unknown>;
  collectFromJsonValue(rec.models, target);
  collectFromJsonValue(rec.data, target);
  collectFromJsonValue(rec.items, target);
}

export function parseClaudeModelsOutput(stdout: string, stderr: string): AdapterModel[] {
  const models: AdapterModel[] = [];
  const trimmedStdout = stdout.trim();
  if (trimmedStdout.startsWith("{") || trimmedStdout.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmedStdout) as unknown;
      collectFromJsonValue(parsed, models);
    } catch {
      // Ignore malformed JSON and continue parsing plain text output.
    }
  }

  const combined = `${stdout}\n${stderr}`;
  for (const match of combined.matchAll(/available models?:\s*([^\n]+)/gi)) {
    const list = match[1] ?? "";
    for (const token of list.split(",")) {
      pushModelId(models, token);
    }
  }

  for (const lineRaw of combined.split(/\r?\n/)) {
    const line = lineRaw.trim();
    if (!line) continue;

    const bullet = line.replace(/^[-*]\s+/, "").trim();
    if (isLikelyModelId(bullet)) {
      pushModelId(models, bullet);
      continue;
    }

    const firstToken = bullet.split(/\s+/)[0] ?? "";
    if (isLikelyModelId(firstToken)) {
      pushModelId(models, firstToken);
    }
  }

  return dedupeModels(models);
}

function mergedWithFallback(models: AdapterModel[]): AdapterModel[] {
  return dedupeModels([...models, ...claudeFallbackModels]);
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readEnvBindingValue(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const rec = value as Record<string, unknown>;
  if (rec.type === "plain" && typeof rec.value === "string") return rec.value;
  return null;
}

function configFingerprint(config: ClaudeModelsSpawnConfig): string {
  const baseUrl = readNonEmptyString(config.env.ANTHROPIC_BASE_URL) ?? "";
  const apiKey = readNonEmptyString(config.env.ANTHROPIC_API_KEY) ?? "";
  const apiKeyFingerprint = apiKey ? `${apiKey.length}:${apiKey.slice(-4)}` : "";
  return JSON.stringify({
    command: config.command,
    cwd: config.cwd ?? "",
    baseUrl,
    apiKeyFingerprint,
  });
}

function buildSpawnConfig(input?: AdapterModelDiscoveryInput): ClaudeModelsSpawnConfig {
  const adapterConfig =
    typeof input?.adapterConfig === "object" && input.adapterConfig !== null && !Array.isArray(input.adapterConfig)
      ? (input.adapterConfig as Record<string, unknown>)
      : {};

  const command = readNonEmptyString(adapterConfig.command) ?? "claude";
  const cwd = readNonEmptyString(adapterConfig.cwd) ?? undefined;
  const env: NodeJS.ProcessEnv = { ...process.env };

  const envConfig =
    typeof adapterConfig.env === "object" && adapterConfig.env !== null && !Array.isArray(adapterConfig.env)
      ? (adapterConfig.env as Record<string, unknown>)
      : {};

  for (const [key, rawValue] of Object.entries(envConfig)) {
    const value = readEnvBindingValue(rawValue);
    if (value !== null) env[key] = value;
  }

  const anthropicBaseUrl = readNonEmptyString(adapterConfig.anthropicBaseUrl);
  const anthropicApiKey = readNonEmptyString(adapterConfig.anthropicApiKey);
  const ollamaLinkUrl = readNonEmptyString(adapterConfig.ollamaLinkUrl);
  const ollamaCloudUrl = readNonEmptyString(adapterConfig.ollamaCloudUrl);
  const ollamaLinkApiKey = readNonEmptyString(adapterConfig.ollamaLinkApiKey);

  if (anthropicBaseUrl) {
    env.ANTHROPIC_BASE_URL = anthropicBaseUrl;
  }
  if (anthropicApiKey) {
    env.ANTHROPIC_API_KEY = anthropicApiKey;
  }
  if (!readNonEmptyString(env.ANTHROPIC_BASE_URL)) {
    const fallbackBaseUrl = ollamaLinkUrl || ollamaCloudUrl;
    if (fallbackBaseUrl) {
      env.ANTHROPIC_BASE_URL = fallbackBaseUrl;
    }
  }
  if (ollamaLinkApiKey && !readNonEmptyString(env.ANTHROPIC_API_KEY)) {
    env.ANTHROPIC_API_KEY = ollamaLinkApiKey;
  }

  const config = { command, cwd, env, fingerprint: "" };
  config.fingerprint = configFingerprint(config);
  return config;
}

function withPath(url: string, pathSuffix: string): string {
  const base = url.replace(/\/+$/, "");
  return `${base}${pathSuffix}`;
}

function modelEndpointsFromBaseUrl(baseUrl: string): string[] {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return [];

  const endpoints = new Set<string>();
  if (/\/v\d+$/i.test(trimmed)) {
    endpoints.add(withPath(trimmed, "/models"));
  } else {
    endpoints.add(withPath(trimmed, "/v1/models"));
    endpoints.add(withPath(trimmed, "/models"));
  }
  return Array.from(endpoints);
}

async function fetchModelsFromConfiguredEndpoint(spawnConfig: ClaudeModelsSpawnConfig): Promise<AdapterModel[]> {
  const baseUrl = readNonEmptyString(spawnConfig.env.ANTHROPIC_BASE_URL);
  if (!baseUrl) return [];

  const apiKey = readNonEmptyString(spawnConfig.env.ANTHROPIC_API_KEY);
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  for (const endpoint of modelEndpointsFromBaseUrl(baseUrl)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), CLAUDE_MODELS_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "GET",
        headers,
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const payload = (await response.json()) as unknown;
      const models = asModelArrayPayload(payload);
      if (models.length > 0) return models;
    } catch {
      // Ignore endpoint probe errors and continue with next candidate.
    } finally {
      clearTimeout(timeout);
    }
  }

  return [];
}

function defaultClaudeModelsRunner(input?: AdapterModelDiscoveryInput): ClaudeModelsCommandResult {
  const spawnConfig = buildSpawnConfig(input);

  const jsonResult = spawnSync(spawnConfig.command, ["models", "--json"], {
    encoding: "utf8",
    cwd: spawnConfig.cwd,
    env: spawnConfig.env,
    timeout: CLAUDE_MODELS_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });
  const jsonStdout = typeof jsonResult.stdout === "string" ? jsonResult.stdout : "";
  const jsonStderr = typeof jsonResult.stderr === "string" ? jsonResult.stderr : "";
  const jsonCombined = `${jsonStdout}\n${jsonStderr}`;
  const jsonUnsupported = /unknown option\s+'?--json'?/i.test(jsonCombined);

  if (!jsonUnsupported && (jsonResult.status ?? 1) === 0) {
    return {
      status: jsonResult.status,
      stdout: jsonStdout,
      stderr: jsonStderr,
      hasError: Boolean(jsonResult.error),
    };
  }

  if (!jsonUnsupported) {
    const parsedFromJsonAttempt = parseClaudeModelsOutput(jsonStdout, jsonStderr);
    if (parsedFromJsonAttempt.length > 0) {
      return {
        status: jsonResult.status,
        stdout: jsonStdout,
        stderr: jsonStderr,
        hasError: Boolean(jsonResult.error),
      };
    }
  }

  const textResult = spawnSync(spawnConfig.command, ["models"], {
    encoding: "utf8",
    cwd: spawnConfig.cwd,
    env: spawnConfig.env,
    timeout: CLAUDE_MODELS_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
  });

  return {
    status: textResult.status,
    stdout: typeof textResult.stdout === "string" ? textResult.stdout : "",
    stderr: typeof textResult.stderr === "string" ? textResult.stderr : "",
    hasError: Boolean(textResult.error),
  };
}

let claudeModelsRunner: (input?: AdapterModelDiscoveryInput) => ClaudeModelsCommandResult =
  defaultClaudeModelsRunner;

function fetchClaudeModelsFromCli(input?: AdapterModelDiscoveryInput): AdapterModel[] {
  const result = claudeModelsRunner(input);
  const { stdout, stderr } = result;
  if (result.hasError && stdout.trim().length === 0 && stderr.trim().length === 0) {
    return [];
  }

  const parsed = parseClaudeModelsOutput(stdout, stderr);
  if (parsed.length > 0) return parsed;
  return [];
}

export async function listClaudeModels(input?: AdapterModelDiscoveryInput): Promise<AdapterModel[]> {
  const spawnConfig = buildSpawnConfig(input);
  const cached = cacheByFingerprint.get(spawnConfig.fingerprint);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.models;
  }

  const fromEndpoint = await fetchModelsFromConfiguredEndpoint(spawnConfig);
  if (fromEndpoint.length > 0) {
    const merged = mergedWithFallback(fromEndpoint);
    cacheByFingerprint.set(spawnConfig.fingerprint, {
      expiresAt: now + CLAUDE_MODELS_CACHE_TTL_MS,
      models: merged,
    });
    return merged;
  }

  const discovered = fetchClaudeModelsFromCli(input);
  if (discovered.length > 0) {
    const merged = mergedWithFallback(discovered);
    cacheByFingerprint.set(spawnConfig.fingerprint, {
      expiresAt: now + CLAUDE_MODELS_CACHE_TTL_MS,
      models: merged,
    });
    return merged;
  }

  if (cached && cached.models.length > 0) {
    return cached.models;
  }

  return dedupeModels(claudeFallbackModels);
}

export function resetClaudeModelsCacheForTests() {
  cacheByFingerprint.clear();
}

export function setClaudeModelsRunnerForTests(
  runner: ((input?: AdapterModelDiscoveryInput) => ClaudeModelsCommandResult) | null,
) {
  claudeModelsRunner = runner ?? defaultClaudeModelsRunner;
}
