import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field } from "../components/agent-config-primitives";
import { ChoosePathButton } from "../components/PathInstructionsModal";
import { healthApi } from "../api/health";
import { queryKeys } from "../lib/queryKeys";

function isLikelyHostAbsolutePath(value: string): boolean {
  const trimmed = value.trim();
  return (
    /^\/Users\//.test(trimmed) ||
    /^\/home\//.test(trimmed) ||
    /^\/root\//.test(trimmed) ||
    /^[A-Za-z]:[\\/]/.test(trimmed)
  );
}

export function AgentInstructionsPathField({
  value,
  onCommit,
  hint,
  className,
  placeholder = "/absolute/path/to/AGENTS.md",
}: {
  value: string;
  onCommit: (value: string) => void;
  hint: string;
  className: string;
  placeholder?: string;
}) {
  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    staleTime: 60_000,
  });
  const [draft, setDraft] = useState(value);
  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const validationMessage = useMemo(() => {
    if (!isAuthenticatedMode) return null;
    if (!isLikelyHostAbsolutePath(draft)) return null;
    return "Host machine paths like /Users/... will not exist on your server container. Leave this empty and use Prompt Template, or point to a container-mounted path such as /paperclip/...";
  }, [draft, isAuthenticatedMode]);

  const commitValue = (next: string) => {
    if (isAuthenticatedMode && isLikelyHostAbsolutePath(next)) {
      return;
    }
    onCommit(next);
  };

  return (
    <Field label="Agent instructions file" hint={hint}>
      <div className="flex items-center gap-2">
        <input
          className={className}
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            commitValue(next);
          }}
          onBlur={() => {
            if (validationMessage) {
              setDraft(value);
              return;
            }
            if (draft !== value) onCommit(draft);
          }}
          placeholder={placeholder}
        />
        <ChoosePathButton />
      </div>
      {isAuthenticatedMode && !draft.trim() && (
        <p className="mt-1 text-xs text-muted-foreground">
          Leave this empty for server deployments. Store durable agent instructions in Prompt Template so they live in Postgres.
        </p>
      )}
      {validationMessage && (
        <p className="mt-1 text-xs text-amber-400">{validationMessage}</p>
      )}
    </Field>
  );
}