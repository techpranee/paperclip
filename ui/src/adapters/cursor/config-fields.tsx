import type { AdapterConfigFieldsProps } from "../types";
import { AgentInstructionsPathField } from "../instructions-path-field";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the prompt at runtime.";

export function CursorLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <AgentInstructionsPathField
      hint={instructionsFileHint}
      value={
        isCreate
          ? values!.instructionsFilePath ?? ""
          : eff(
              "adapterConfig",
              "instructionsFilePath",
              String(config.instructionsFilePath ?? ""),
            )
      }
      onCommit={(v) =>
        isCreate
          ? set!({ instructionsFilePath: v })
          : mark("adapterConfig", "instructionsFilePath", v || undefined)
      }
      className={inputClass}
    />
  );
}
