import type { ServerAdapterModule } from "./types.js";
import {
  execute as claudeExecute,
  testEnvironment as claudeTestEnvironment,
  sessionCodec as claudeSessionCodec,
} from "@paperclipai/adapter-claude-local/server";
import { agentConfigurationDoc as claudeAgentConfigurationDoc, models as claudeModels } from "@paperclipai/adapter-claude-local";
import {
  execute as codexExecute,
  testEnvironment as codexTestEnvironment,
  sessionCodec as codexSessionCodec,
} from "@paperclipai/adapter-codex-local/server";
import { agentConfigurationDoc as codexAgentConfigurationDoc, models as codexModels } from "@paperclipai/adapter-codex-local";
import {
  execute as cursorExecute,
  testEnvironment as cursorTestEnvironment,
  sessionCodec as cursorSessionCodec,
} from "@paperclipai/adapter-cursor-local/server";
import { agentConfigurationDoc as cursorAgentConfigurationDoc, models as cursorModels } from "@paperclipai/adapter-cursor-local";
import {
  execute as openCodeExecute,
  testEnvironment as openCodeTestEnvironment,
  sessionCodec as openCodeSessionCodec,
  listOpenCodeModels,
} from "@paperclipai/adapter-opencode-local/server";
import {
  agentConfigurationDoc as openCodeAgentConfigurationDoc,
} from "@paperclipai/adapter-opencode-local";
import {
  execute as openclawExecute,
  testEnvironment as openclawTestEnvironment,
  onHireApproved as openclawOnHireApproved,
} from "@paperclipai/adapter-openclaw/server";
import {
  agentConfigurationDoc as openclawAgentConfigurationDoc,
  models as openclawModels,
} from "@paperclipai/adapter-openclaw";
import { listCodexModels } from "./codex-models.js";
import { listCursorModels } from "./cursor-models.js";
import { processAdapter } from "./process/index.js";
import { httpAdapter } from "./http/index.js";

const PI_ADAPTER_MODULE_SPEC: string = ["@paperclipai", "adapter-pi-local"].join("/");
const PI_ADAPTER_SERVER_MODULE_SPEC: string = `${PI_ADAPTER_MODULE_SPEC}/server`;

type PiServerModuleShape = {
  execute: ServerAdapterModule["execute"];
  testEnvironment: ServerAdapterModule["testEnvironment"];
  sessionCodec?: ServerAdapterModule["sessionCodec"];
  listPiModels: NonNullable<ServerAdapterModule["listModels"]>;
};

type PiSharedModuleShape = {
  agentConfigurationDoc?: string;
};

const claudeLocalAdapter: ServerAdapterModule = {
  type: "claude_local",
  execute: claudeExecute,
  testEnvironment: claudeTestEnvironment,
  sessionCodec: claudeSessionCodec,
  models: claudeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: claudeAgentConfigurationDoc,
};

const codexLocalAdapter: ServerAdapterModule = {
  type: "codex_local",
  execute: codexExecute,
  testEnvironment: codexTestEnvironment,
  sessionCodec: codexSessionCodec,
  models: codexModels,
  listModels: listCodexModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: codexAgentConfigurationDoc,
};

const cursorLocalAdapter: ServerAdapterModule = {
  type: "cursor",
  execute: cursorExecute,
  testEnvironment: cursorTestEnvironment,
  sessionCodec: cursorSessionCodec,
  models: cursorModels,
  listModels: listCursorModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: cursorAgentConfigurationDoc,
};

const openclawAdapter: ServerAdapterModule = {
  type: "openclaw",
  execute: openclawExecute,
  testEnvironment: openclawTestEnvironment,
  onHireApproved: openclawOnHireApproved,
  models: openclawModels,
  supportsLocalAgentJwt: false,
  agentConfigurationDoc: openclawAgentConfigurationDoc,
};

const openCodeLocalAdapter: ServerAdapterModule = {
  type: "opencode_local",
  execute: openCodeExecute,
  testEnvironment: openCodeTestEnvironment,
  sessionCodec: openCodeSessionCodec,
  models: [],
  listModels: listOpenCodeModels,
  supportsLocalAgentJwt: true,
  agentConfigurationDoc: openCodeAgentConfigurationDoc,
};

const adapters: ServerAdapterModule[] = [claudeLocalAdapter, codexLocalAdapter, openCodeLocalAdapter];
const piLocalAdapter = await loadPiLocalAdapter();
if (piLocalAdapter) {
  adapters.push(piLocalAdapter);
}
adapters.push(cursorLocalAdapter, openclawAdapter, processAdapter, httpAdapter);

const adaptersByType = new Map<string, ServerAdapterModule>(adapters.map((a) => [a.type, a]));

export function getServerAdapter(type: string): ServerAdapterModule {
  const adapter = adaptersByType.get(type);
  if (!adapter) {
    // Fall back to process adapter for unknown types
    return processAdapter;
  }
  return adapter;
}

export async function listAdapterModels(type: string): Promise<{ id: string; label: string }[]> {
  const adapter = adaptersByType.get(type);
  if (!adapter) return [];
  if (adapter.listModels) {
    const discovered = await adapter.listModels();
    if (discovered.length > 0) return discovered;
  }
  return adapter.models ?? [];
}

export function listServerAdapters(): ServerAdapterModule[] {
  return Array.from(adaptersByType.values());
}

export function findServerAdapter(type: string): ServerAdapterModule | null {
  return adaptersByType.get(type) ?? null;
}

async function loadPiLocalAdapter(): Promise<ServerAdapterModule | null> {
  try {
    const [piServerModule, piSharedModule] = await Promise.all([
      import(PI_ADAPTER_SERVER_MODULE_SPEC) as Promise<PiServerModuleShape>,
      import(PI_ADAPTER_MODULE_SPEC) as Promise<PiSharedModuleShape>,
    ]);
    return {
      type: "pi_local",
      execute: piServerModule.execute,
      testEnvironment: piServerModule.testEnvironment,
      sessionCodec: piServerModule.sessionCodec,
      models: [],
      listModels: piServerModule.listPiModels,
      supportsLocalAgentJwt: true,
      agentConfigurationDoc: piSharedModule.agentConfigurationDoc,
    };
  } catch (error) {
    if (isModuleMissingError(error, PI_ADAPTER_MODULE_SPEC)) {
      const message = error instanceof Error ? error.message : String(error);
      if (process.env.NODE_ENV !== "test") {
        console.warn(`[paperclip] pi_local adapter unavailable: ${message}`);
      }
      return null;
    }
    throw error;
  }
}

function isModuleMissingError(error: unknown, moduleName: string): error is Error & { code?: string } {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: unknown };
  if (maybeError.code !== "ERR_MODULE_NOT_FOUND") return false;
  return typeof maybeError.message === "string" && maybeError.message.includes(moduleName);
}
