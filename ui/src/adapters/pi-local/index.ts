import type { UIAdapterModule } from "../types";
import { PiLocalConfigFields } from "./config-fields";

const PI_ADAPTER_UI_MODULE_SPEC = ["@paperclipai", "adapter-pi-local", "ui"].join("/");

type PiUiModuleShape = {
  parsePiStdoutLine: UIAdapterModule["parseStdoutLine"];
  buildPiLocalConfig: UIAdapterModule["buildAdapterConfig"];
};

export async function loadPiLocalUIAdapter(): Promise<UIAdapterModule | null> {
  try {
    const piUiModule = (await import(PI_ADAPTER_UI_MODULE_SPEC)) as PiUiModuleShape;
    return {
      type: "pi_local",
      label: "Pi (local)",
      parseStdoutLine: piUiModule.parsePiStdoutLine,
      ConfigFields: PiLocalConfigFields,
      buildAdapterConfig: piUiModule.buildPiLocalConfig,
    };
  } catch (error) {
    if (isModuleMissingError(error, PI_ADAPTER_UI_MODULE_SPEC)) {
      console.warn(`[paperclip/ui] pi_local adapter unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
    throw error;
  }
}

function isModuleMissingError(error: unknown, moduleName: string): error is Error {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { message?: unknown };
  if (typeof maybeError.message !== "string") return false;
  return maybeError.message.includes(moduleName) || maybeError.message.includes("Failed to fetch dynamically imported module");
}
