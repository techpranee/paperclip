import type { UIAdapterModule } from "./types";
import { claudeLocalUIAdapter } from "./claude-local";
import { codexLocalUIAdapter } from "./codex-local";
import { cursorLocalUIAdapter } from "./cursor";
import { geminiLocalUIAdapter } from "./gemini-local";
import { openCodeLocalUIAdapter } from "./opencode-local";
import { loadPiLocalUIAdapter } from "./pi-local";
import { openClawGatewayUIAdapter } from "./openclaw-gateway";
import { processUIAdapter } from "./process";
import { httpUIAdapter } from "./http";

const adapters: UIAdapterModule[] = [
  claudeLocalUIAdapter,
  codexLocalUIAdapter,
  geminiLocalUIAdapter,
  openCodeLocalUIAdapter,
  cursorLocalUIAdapter,
  openClawGatewayUIAdapter,
  processUIAdapter,
  httpUIAdapter,
];

const adaptersByType = new Map<string, UIAdapterModule>(adapters.map((a) => [a.type, a]));

void loadPiLocalUIAdapter()
  .then((piLocalUIAdapter) => {
    if (piLocalUIAdapter) {
      adaptersByType.set(piLocalUIAdapter.type, piLocalUIAdapter);
    }
  })
  .catch((error) => {
    console.error(
      `[paperclip/ui] failed to load optional pi_local adapter: ${error instanceof Error ? error.message : String(error)}`,
    );
  });

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? processUIAdapter;
}
