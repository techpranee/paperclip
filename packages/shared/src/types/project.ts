import type { ProjectStatus } from "../constants.js";
import type { ProjectExecutionWorkspacePolicy, WorkspaceRuntimeService } from "./workspace-runtime.js";

export interface ProjectGoalRef {
  id: string;
  title: string;
}

export type ProjectWorkspaceGitAuthMode =
  | "none"
  | "inherit_company_default"
  | "github_pat_secret_ref";

export interface ProjectWorkspaceGitAuthConfig {
  mode: ProjectWorkspaceGitAuthMode;
  patSecretId?: string | null;
  username?: string | null;
}

export interface ProjectWorkspaceInfisicalConfig {
  enabled: boolean;
  projectId?: string | null;
  environment?: string | null;
  secretPath?: string | null;
  mappings?: Record<string, string> | null;
}

export interface ProjectWorkspacePullRequestConfig {
  mode?: "none" | "agent_may_open" | "agent_auto_open" | "approval_required";
  baseBranch?: string | null;
  autoPushOnDone?: boolean;
}

export interface ProjectWorkspaceMetadata {
  explanation?: string;
  gitAuth?: ProjectWorkspaceGitAuthConfig | null;
  infisical?: ProjectWorkspaceInfisicalConfig | null;
  pullRequest?: ProjectWorkspacePullRequestConfig | null;
  [key: string]: unknown;
}

export interface ProjectWorkspace {
  id: string;
  companyId: string;
  projectId: string;
  name: string;
  cwd: string | null;
  repoUrl: string | null;
  repoRef: string | null;
  metadata: ProjectWorkspaceMetadata | null;
  isPrimary: boolean;
  runtimeServices?: WorkspaceRuntimeService[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  companyId: string;
  urlKey: string;
  /** @deprecated Use goalIds / goals instead */
  goalId: string | null;
  goalIds: string[];
  goals: ProjectGoalRef[];
  name: string;
  description: string | null;
  status: ProjectStatus;
  leadAgentId: string | null;
  targetDate: string | null;
  color: string | null;
  executionWorkspacePolicy: ProjectExecutionWorkspacePolicy | null;
  workspaces: ProjectWorkspace[];
  primaryWorkspace: ProjectWorkspace | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
