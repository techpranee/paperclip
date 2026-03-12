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

const adapters: UIAdapterModule[] = [claudeLocalUIAdapter, codexLocalUIAdapter, geminiLocalUIAdapter, openCodeLocalUIAdapter];
const piLocalUIAdapter = await loadPiLocalUIAdapter();
if (piLocalUIAdapter) {
  adapters.push(piLocalUIAdapter);
}
adapters.push(cursorLocalUIAdapter, openClawGatewayUIAdapter, processUIAdapter, httpUIAdapter);

const adaptersByType = new Map<string, UIAdapterModule>(adapters.map((a) => [a.type, a]));

export function getUIAdapter(type: string): UIAdapterModule {
  return adaptersByType.get(type) ?? processUIAdapter;
}
