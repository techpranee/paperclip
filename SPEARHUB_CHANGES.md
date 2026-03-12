# SPEARHUB Changes: Repo Automation + Secrets Integration

## Objective

Deploy Paperclip as an internal company control plane where agents can:

1. clone private GitHub repositories using a GitHub PAT
2. implement issue/feature/goal work on isolated branches
3. open pull requests for humans to review and merge
4. fetch runtime secrets per repo/project from Infisical

## Current Reality (as of this branch)

- Project workspaces already store `cwd`, `repoUrl`, and `repoRef`.
- Heartbeat execution requires a local `cwd`; when unavailable it falls back to agent-home.
- Automatic clone/fetch from `repoUrl` is not yet implemented.
- Worktree runtime support exists (`git_worktree` strategy), but PR policy automation is not fully enforced end-to-end.
- Secrets service exists with provider abstraction, but Infisical provider integration is not yet wired.

## Implementation Plan

### Phase 1 — Workspace metadata contracts (started)

Add structured workspace metadata for:

- Git auth policy (PAT secret ref, optional username)
- Infisical linkage (project/environment/path/mappings)
- PR automation preferences (mode/base branch/auto-push)

Status: **in progress**

### Phase 2 — Secure Git materialization service

Add a server service that can:

- clone workspace repo if local path does not exist
- fetch and checkout `repoRef`/base branch for existing repos
- authenticate against private GitHub using PAT from secret refs
- avoid token leakage in URLs and logs

Key constraints:

- never persist raw PAT in workspace row metadata
- resolve PAT value at runtime from secret reference
- redact any sensitive command/env data in logs

### Phase 3 — Heartbeat integration

Before adapter execution:

- materialize workspace from `repoUrl` + auth metadata when required
- preserve current fallback behavior only if materialization fails
- expose actionable run warnings and issue comments when clone/fetch fails

### Phase 4 — Branch isolation defaults

Resolve and enforce isolated worktree policy for coding agents:

- default to `workspaceStrategy.type = git_worktree` for configured projects
- branch template from issue context (`{{issue.identifier}}-{{slug}}`)
- avoid direct changes on project primary branch

### Phase 5 — PR workflow automation

Introduce explicit PR policy handling:

- commit/push/open PR modes (`none`, `agent_may_open`, `agent_auto_open`, `approval_required`)
- optional auto-push on issue done
- persist PR URL/number/status in issue metadata/activity
- never auto-merge unless explicitly configured in future policy

### Phase 6 — Infisical provider integration

Add Infisical as a first-class secrets provider:

- provider adapter in secrets provider registry
- token/project/environment based resolution
- runtime fetch and injection into adapter env
- standardized errors for missing auth/project/environment/keys

### Phase 7 — Repo-level Infisical linkage in project workspace config

Allow each workspace/repo to define Infisical linkage:

- Infisical project id
- environment name
- optional path/scope
- optional key mapping from Infisical secret names to runtime env vars

### Phase 8 — UI/API support

Project workspace UI and API should support:

- Git auth mode + PAT secret reference selector
- Infisical linkage form fields
- PR policy controls
- validation + preview of effective config

### Phase 9 — Security hardening + observability

- aggressive redaction for PAT and fetched secrets
- audit events for clone/fetch/PR operations
- retry/backoff for transient network/provider failures
- clear operator diagnostics in activity and run logs

## Data Model Notes

- Continue using `project_workspaces.metadata` JSONB for first rollout.
- Store only references/identifiers (secret refs, project ids), not raw secrets.
- Keep `company_secrets` as source-of-truth for credential material.

## Rollout Strategy

1. Ship contract + API validation (safe no-op behavior).
2. Enable clone/fetch service behind feature flag.
3. Enable PR automation in `agent_may_open` mode first.
4. Add Infisical provider and workspace linkage.
5. Expand with approval-gated PR modes and stricter policy enforcement.

## Open Questions

- Should PAT be reusable per company, per project, or per workspace?
- Should PR open happen on issue `done`, on approval, or both (policy)?
- Should Infisical values be fetched per run or cached with TTL?
- Should clone location be explicit per workspace or derived from instance/project conventions?

## Immediate Next Steps

1. Complete shared/server contract wiring for workspace metadata.
2. Add server git materialization service with PAT secret-ref auth.
3. Integrate materialization path into heartbeat workspace resolution.
4. Add focused tests for private clone auth and safe redaction.
