type InfisicalConfig = {
  enabled: boolean;
  projectId: string;
  environment: string;
  secretPath: string;
  mappings: Record<string, string>;
};

type InfisicalRawSecret = {
  key: string;
  value: string;
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseInfisicalConfig(metadata: Record<string, unknown> | null): InfisicalConfig | null {
  const infisical = asRecord(metadata?.infisical);
  if (!infisical) return null;
  const enabled = infisical.enabled === true;
  if (!enabled) return null;

  const projectId = readNonEmptyString(infisical.projectId);
  const environment = readNonEmptyString(infisical.environment);
  const secretPath = readNonEmptyString(infisical.secretPath) ?? "/";
  const mappingsRaw = asRecord(infisical.mappings) ?? {};
  const mappings: Record<string, string> = {};
  for (const [key, value] of Object.entries(mappingsRaw)) {
    const envKey = readNonEmptyString(key);
    const sourceKey = readNonEmptyString(value);
    if (envKey && sourceKey) mappings[envKey] = sourceKey;
  }

  if (!projectId || !environment) return null;
  return {
    enabled: true,
    projectId,
    environment,
    secretPath,
    mappings,
  };
}

function parseSecretEntry(entry: unknown): InfisicalRawSecret | null {
  const rec = asRecord(entry);
  if (!rec) return null;

  const key =
    readNonEmptyString(rec.secretKey) ??
    readNonEmptyString(rec.key) ??
    readNonEmptyString(rec.name);
  const value =
    readNonEmptyString(rec.secretValue) ??
    readNonEmptyString(rec.value);

  if (!key || value === null) return null;
  return { key, value };
}

function collectInfisicalSecrets(payload: unknown): InfisicalRawSecret[] {
  const root = asRecord(payload);
  if (!root) return [];

  const candidates: unknown[] = [];
  if (Array.isArray(root.secrets)) candidates.push(...root.secrets);
  const data = asRecord(root.data);
  if (data && Array.isArray(data.secrets)) candidates.push(...data.secrets);

  const secrets: InfisicalRawSecret[] = [];
  for (const candidate of candidates) {
    const parsed = parseSecretEntry(candidate);
    if (parsed) secrets.push(parsed);
  }
  return secrets;
}

export async function resolveWorkspaceInfisicalEnv(input: {
  metadata: Record<string, unknown> | null;
}): Promise<{ env: Record<string, string>; secretKeys: Set<string>; warnings: string[] }> {
  const cfg = parseInfisicalConfig(input.metadata);
  if (!cfg) return { env: {}, secretKeys: new Set<string>(), warnings: [] };

  const apiUrl = (process.env.PAPERCLIP_INFISICAL_API_URL ?? "https://app.infisical.com").trim().replace(/\/+$/, "");
  const accessToken = readNonEmptyString(process.env.PAPERCLIP_INFISICAL_ACCESS_TOKEN);
  if (!accessToken) {
    return {
      env: {},
      secretKeys: new Set<string>(),
      warnings: [
        "Infisical is enabled for workspace but PAPERCLIP_INFISICAL_ACCESS_TOKEN is not configured.",
      ],
    };
  }

  const url = new URL(`${apiUrl}/api/v3/secrets/raw`);
  url.searchParams.set("projectId", cfg.projectId);
  url.searchParams.set("environment", cfg.environment);
  url.searchParams.set("secretPath", cfg.secretPath);
  url.searchParams.set("recursive", "true");
  url.searchParams.set("include_imports", "true");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `Infisical secret fetch failed (${response.status}${response.statusText ? ` ${response.statusText}` : ""})${detail ? `: ${detail.slice(0, 300)}` : ""}`,
    );
  }

  const body = await response.json().catch(() => ({}));
  const fetched = collectInfisicalSecrets(body);
  const byKey = new Map(fetched.map((secret) => [secret.key, secret.value]));

  const env: Record<string, string> = {};
  const secretKeys = new Set<string>();

  if (Object.keys(cfg.mappings).length > 0) {
    for (const [envKey, sourceKey] of Object.entries(cfg.mappings)) {
      const value = byKey.get(sourceKey);
      if (typeof value !== "string") continue;
      env[envKey] = value;
      secretKeys.add(envKey);
    }
  } else {
    for (const [key, value] of byKey.entries()) {
      env[key] = value;
      secretKeys.add(key);
    }
  }

  return { env, secretKeys, warnings: [] };
}