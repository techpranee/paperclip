import type { CLIAdapterModule } from "@paperclipai/adapter-utils";
import { printClaudeStreamEvent } from "@paperclipai/adapter-claude-local/cli";
import { printCodexStreamEvent } from "@paperclipai/adapter-codex-local/cli";
import { printCursorStreamEvent } from "@paperclipai/adapter-cursor-local/cli";
import { printOpenCodeStreamEvent } from "@paperclipai/adapter-opencode-local/cli";
import { printOpenClawStreamEvent } from "@paperclipai/adapter-openclaw/cli";
import { processCLIAdapter } from "./process/index.js";
import { httpCLIAdapter } from "./http/index.js";

const PI_ADAPTER_CLI_MODULE_SPEC = ["@paperclipai", "adapter-pi-local", "cli"].join("/");

type PiCliModuleShape = {
  printPiStreamEvent: CLIAdapterModule["formatStdoutEvent"];
};

const claudeLocalCLIAdapter: CLIAdapterModule = {
  type: "claude_local",
  formatStdoutEvent: printClaudeStreamEvent,
};

const codexLocalCLIAdapter: CLIAdapterModule = {
  type: "codex_local",
  formatStdoutEvent: printCodexStreamEvent,
};

const openCodeLocalCLIAdapter: CLIAdapterModule = {
  type: "opencode_local",
  formatStdoutEvent: printOpenCodeStreamEvent,
};

const cursorLocalCLIAdapter: CLIAdapterModule = {
  type: "cursor",
  formatStdoutEvent: printCursorStreamEvent,
};

const openclawCLIAdapter: CLIAdapterModule = {
  type: "openclaw",
  formatStdoutEvent: printOpenClawStreamEvent,
};

const adapters: CLIAdapterModule[] = [claudeLocalCLIAdapter, codexLocalCLIAdapter, openCodeLocalCLIAdapter];
const piLocalCLIAdapter = await loadPiLocalCLIAdapter();
if (piLocalCLIAdapter) {
  adapters.push(piLocalCLIAdapter);
}
adapters.push(cursorLocalCLIAdapter, openclawCLIAdapter, processCLIAdapter, httpCLIAdapter);

const adaptersByType = new Map<string, CLIAdapterModule>(adapters.map((a) => [a.type, a]));

export function getCLIAdapter(type: string): CLIAdapterModule {
  return adaptersByType.get(type) ?? processCLIAdapter;
}

async function loadPiLocalCLIAdapter(): Promise<CLIAdapterModule | null> {
  try {
    const piCliModule = (await import(PI_ADAPTER_CLI_MODULE_SPEC)) as PiCliModuleShape;
    return {
      type: "pi_local",
      formatStdoutEvent: piCliModule.printPiStreamEvent,
    };
  } catch (error) {
    if (isModuleMissingError(error, PI_ADAPTER_CLI_MODULE_SPEC)) {
      console.warn(`[paperclip/cli] pi_local adapter unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    throw error;
  }
}

function isModuleMissingError(error: unknown, moduleName: string): error is Error & { code?: string } {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: unknown };
  if (maybeError.code === "ERR_MODULE_NOT_FOUND") {
    return typeof maybeError.message === "string" && maybeError.message.includes(moduleName);
  }
  if (typeof maybeError.message === "string") {
    return maybeError.message.includes("Cannot find module") && maybeError.message.includes(moduleName);
  }
  return false;
}
