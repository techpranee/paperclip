import { z } from "zod";
import { PROJECT_STATUSES } from "../constants.js";

const executionWorkspaceStrategySchema = z
  .object({
    type: z.enum(["project_primary", "git_worktree"]).optional(),
    baseRef: z.string().optional().nullable(),
    branchTemplate: z.string().optional().nullable(),
    worktreeParentDir: z.string().optional().nullable(),
    provisionCommand: z.string().optional().nullable(),
    teardownCommand: z.string().optional().nullable(),
  })
  .strict();

export const projectExecutionWorkspacePolicySchema = z
  .object({
    enabled: z.boolean(),
    defaultMode: z.enum(["project_primary", "isolated"]).optional(),
    allowIssueOverride: z.boolean().optional(),
    workspaceStrategy: executionWorkspaceStrategySchema.optional().nullable(),
    workspaceRuntime: z.record(z.unknown()).optional().nullable(),
    branchPolicy: z.record(z.unknown()).optional().nullable(),
    pullRequestPolicy: z.record(z.unknown()).optional().nullable(),
    cleanupPolicy: z.record(z.unknown()).optional().nullable(),
  })
  .strict();

const workspaceGitAuthSchema = z
  .object({
    mode: z.enum(["none", "inherit_company_default", "github_pat_secret_ref"]),
    patSecretId: z.string().uuid().optional().nullable(),
    username: z.string().min(1).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.mode === "github_pat_secret_ref" && (!value.patSecretId || value.patSecretId.trim().length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "gitAuth.patSecretId is required when gitAuth.mode is github_pat_secret_ref.",
        path: ["patSecretId"],
      });
    }
  });

const workspaceInfisicalSchema = z
  .object({
    enabled: z.boolean(),
    projectId: z.string().min(1).optional().nullable(),
    environment: z.string().min(1).optional().nullable(),
    secretPath: z.string().min(1).optional().nullable(),
    mappings: z.record(z.string()).optional().nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!value.enabled) return;
    if (!value.projectId || value.projectId.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "infisical.projectId is required when infisical.enabled is true.",
        path: ["projectId"],
      });
    }
    if (!value.environment || value.environment.trim().length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "infisical.environment is required when infisical.enabled is true.",
        path: ["environment"],
      });
    }
  });

export const projectWorkspaceMetadataSchema = z
  .object({
    explanation: z.string().optional(),
    gitAuth: workspaceGitAuthSchema.optional().nullable(),
    infisical: workspaceInfisicalSchema.optional().nullable(),
    pullRequest: z
      .object({
        mode: z.enum(["none", "agent_may_open", "agent_auto_open", "approval_required"]).optional(),
        baseBranch: z.string().min(1).optional().nullable(),
        autoPushOnDone: z.boolean().optional(),
      })
      .strict()
      .optional()
      .nullable(),
  })
  .passthrough();

const projectWorkspaceFields = {
  name: z.string().min(1).optional(),
  cwd: z.string().min(1).optional().nullable(),
  repoUrl: z.string().url().optional().nullable(),
  repoRef: z.string().optional().nullable(),
  metadata: projectWorkspaceMetadataSchema.optional().nullable(),
};

export const createProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional().default(false),
}).superRefine((value, ctx) => {
  const hasCwd = typeof value.cwd === "string" && value.cwd.trim().length > 0;
  const hasRepo = typeof value.repoUrl === "string" && value.repoUrl.trim().length > 0;
  if (!hasCwd && !hasRepo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Workspace requires at least one of cwd or repoUrl.",
      path: ["cwd"],
    });
  }
});

export type CreateProjectWorkspace = z.infer<typeof createProjectWorkspaceSchema>;

export const updateProjectWorkspaceSchema = z.object({
  ...projectWorkspaceFields,
  isPrimary: z.boolean().optional(),
}).partial();

export type UpdateProjectWorkspace = z.infer<typeof updateProjectWorkspaceSchema>;

const projectFields = {
  /** @deprecated Use goalIds instead */
  goalId: z.string().uuid().optional().nullable(),
  goalIds: z.array(z.string().uuid()).optional(),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default("backlog"),
  leadAgentId: z.string().uuid().optional().nullable(),
  targetDate: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
  executionWorkspacePolicy: projectExecutionWorkspacePolicySchema.optional().nullable(),
  archivedAt: z.string().datetime().optional().nullable(),
};

export const createProjectSchema = z.object({
  ...projectFields,
  workspace: createProjectWorkspaceSchema.optional(),
});

export type CreateProject = z.infer<typeof createProjectSchema>;

export const updateProjectSchema = z.object(projectFields).partial();

export type UpdateProject = z.infer<typeof updateProjectSchema>;

export type ProjectExecutionWorkspacePolicy = z.infer<typeof projectExecutionWorkspacePolicySchema>;
export type ProjectWorkspaceMetadata = z.infer<typeof projectWorkspaceMetadataSchema>;
