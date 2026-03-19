import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  ToggleField,
  help,
} from "../../components/agent-config-primitives";
import { AgentInstructionsPathField } from "../instructions-path-field";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

export function OpenCodeLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  return (
    <>
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
      <ToggleField
        label="Allow file read"
        hint={help.allowFileRead}
        checked={
          isCreate
            ? !!values!.allowFileRead
            : eff("adapterConfig", "allowFileRead", !!config.allowFileRead)
        }
        onChange={(v) =>
          isCreate ? set!({ allowFileRead: v }) : mark("adapterConfig", "allowFileRead", v)
        }
      />
      <ToggleField
        label="Allow file write"
        hint={help.allowFileWrite}
        checked={
          isCreate
            ? !!values!.allowFileWrite
            : eff("adapterConfig", "allowFileWrite", !!config.allowFileWrite)
        }
        onChange={(v) =>
          isCreate ? set!({ allowFileWrite: v }) : mark("adapterConfig", "allowFileWrite", v)
        }
      />
      <ToggleField
        label="Allow network"
        hint={help.allowNetwork}
        checked={
          isCreate
            ? !!values!.allowNetwork
            : eff("adapterConfig", "allowNetwork", !!config.allowNetwork)
        }
        onChange={(v) =>
          isCreate ? set!({ allowNetwork: v }) : mark("adapterConfig", "allowNetwork", v)
        }
      />
      <ToggleField
        label="Allow shell commands"
        hint={help.allowShellExec}
        checked={
          isCreate
            ? !!values!.allowShellExec
            : eff("adapterConfig", "allowShellExec", !!config.allowShellExec)
        }
        onChange={(v) =>
          isCreate ? set!({ allowShellExec: v }) : mark("adapterConfig", "allowShellExec", v)
        }
      />
      <Field label="Allowed file paths" hint={help.allowedFilePaths}>
        <textarea
          rows={3}
          className={inputClass}
          placeholder=".env, /home/user/project/secrets.json"
          value={
            isCreate
              ? values!.allowedFilePaths ?? ""
              : eff("adapterConfig", "allowedFilePaths", String(config.allowedFilePaths ?? ""))
          }
          onChange={(e) =>
            isCreate
              ? set!({ allowedFilePaths: e.target.value })
              : mark("adapterConfig", "allowedFilePaths", e.target.value || undefined)
          }
        />
      </Field>
    </>
  );
}
