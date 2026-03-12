import type { AdapterConfigFieldsProps } from "./types";
import { Field, DraftInput } from "../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function LocalWorkspaceRuntimeFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <Field label="Ollama Cloud URL" hint="Optional Ollama Cloud endpoint for model inference">
      <DraftInput
        value={
          isCreate
            ? values!.ollamaCloudUrl ?? ""
            : eff(
                "adapterConfig",
                "ollamaCloudUrl",
                String(config.ollamaCloudUrl ?? ""),
              )
        }
        onCommit={(v) =>
          isCreate
            ? set!({ ollamaCloudUrl: v })
            : mark("adapterConfig", "ollamaCloudUrl", v || undefined)
        }
        immediate
        className={inputClass}
        placeholder="https://api.ollama.cloud/..."
      />
    </Field>
  );
}

