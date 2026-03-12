import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveDefaultAgentWorkspaceDir } from "../home-paths.js";

type GitAuthMode = "none" | "inherit_company_default" | "github_pat_secret_ref";

type GitAuthConfig = {
  mode: GitAuthMode;
  patSecretId?: string | null;
  username?: string | null;
};

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseGitAuthConfig(metadata: Record<string, unknown> | null): GitAuthConfig | null {
  const gitAuth = asRecord(metadata?.gitAuth);
  if (!gitAuth) return null;
  const mode = readNonEmptyString(gitAuth.mode);
  if (mode !== "none" && mode !== "inherit_company_default" && mode !== "github_pat_secret_ref") {
    return null;
  }
  return {
    mode,
    patSecretId: readNonEmptyString(gitAuth.patSecretId),
    username: readNonEmptyString(gitAuth.username),
  };
}

async function runGit(input: {
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", input.args, {
      cwd: input.cwd,
      env: input.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = stderr.trim() || stdout.trim() || `git exited with code ${code ?? "unknown"}`;
      reject(new Error(detail));
    });
  });
}

async function createAskPassEnv(input: {
  pat: string;
  username: string;
}): Promise<{
  env: NodeJS.ProcessEnv;
  cleanup: () => Promise<void>;
}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-git-askpass-"));
  const scriptPath = path.join(tempDir, "askpass.sh");
  const script = [
    "#!/bin/sh",
    "prompt=\"$1\"",
    "case \"$prompt\" in",
    "  *sername*|*Username*) printf '%s\\n' \"$PAPERCLIP_GIT_USERNAME\" ;;",
    "  *) printf '%s\\n' \"$PAPERCLIP_GIT_PAT\" ;;",
    "esac",
    "",
  ].join("\n");
  await fs.writeFile(scriptPath, script, { encoding: "utf8", mode: 0o700 });
  await fs.chmod(scriptPath, 0o700);

  return {
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: scriptPath,
      PAPERCLIP_GIT_USERNAME: input.username,
      PAPERCLIP_GIT_PAT: input.pat,
    },
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}

function defaultRepoWorkspacePath(agentId: string, workspaceId: string) {
  return path.join(resolveDefaultAgentWorkspaceDir(agentId), "project-workspaces", workspaceId, "repo");
}

export async function materializeProjectWorkspaceRepo(input: {
  companyId: string;
  agentId: string;
  workspaceId: string;
  repoUrl: string;
  repoRef: string | null;
  metadata: Record<string, unknown> | null;
  resolveSecretRef: (params: {
    companyId: string;
    secretId: string;
    version?: number | "latest";
  }) => Promise<string>;
}): Promise<{ cwd: string; warnings: string[] }> {
  const warnings: string[] = [];
  const targetRepoPath = defaultRepoWorkspacePath(input.agentId, input.workspaceId);
  const targetParentDir = path.dirname(targetRepoPath);
  await fs.mkdir(targetParentDir, { recursive: true });

  const gitAuth = parseGitAuthConfig(input.metadata);
  let gitEnv: NodeJS.ProcessEnv = process.env;
  let cleanupAskPass: (() => Promise<void>) | null = null;

  try {
    if (gitAuth?.mode === "github_pat_secret_ref") {
      const patSecretId = readNonEmptyString(gitAuth.patSecretId);
      if (!patSecretId) {
        warnings.push("Workspace gitAuth is set to github_pat_secret_ref but patSecretId is missing.");
      } else {
        const pat = await input.resolveSecretRef({
          companyId: input.companyId,
          secretId: patSecretId,
          version: "latest",
        });
        const username = readNonEmptyString(gitAuth.username) ?? "x-access-token";
        const askPass = await createAskPassEnv({ pat, username });
        gitEnv = askPass.env;
        cleanupAskPass = askPass.cleanup;
      }
    }

    const hasGitDir = await fs
      .stat(path.join(targetRepoPath, ".git"))
      .then((stats) => stats.isDirectory())
      .catch(() => false);

    if (!hasGitDir) {
      await runGit({
        args: ["clone", "--origin", "origin", "--", input.repoUrl, targetRepoPath],
        cwd: targetParentDir,
        env: gitEnv,
      });
    }

    const currentOriginUrl = await runGit({
      args: ["-C", targetRepoPath, "remote", "get-url", "origin"],
      cwd: targetRepoPath,
      env: gitEnv,
    })
      .then((result) => result.stdout.trim())
      .catch(() => null);

    if (currentOriginUrl && currentOriginUrl !== input.repoUrl) {
      await runGit({
        args: ["-C", targetRepoPath, "remote", "set-url", "origin", input.repoUrl],
        cwd: targetRepoPath,
        env: gitEnv,
      });
    }

    await runGit({
      args: ["-C", targetRepoPath, "fetch", "--prune", "origin"],
      cwd: targetRepoPath,
      env: gitEnv,
    });

    const targetRef = readNonEmptyString(input.repoRef);
    if (targetRef) {
      try {
        await runGit({
          args: ["-C", targetRepoPath, "checkout", "--force", targetRef],
          cwd: targetRepoPath,
          env: gitEnv,
        });
      } catch (error) {
        if (targetRef.startsWith("origin/")) {
          const localBranch = targetRef.slice("origin/".length).trim();
          if (localBranch.length > 0) {
            await runGit({
              args: ["-C", targetRepoPath, "checkout", "-B", localBranch, targetRef],
              cwd: targetRepoPath,
              env: gitEnv,
            });
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    return {
      cwd: targetRepoPath,
      warnings,
    };
  } finally {
    if (cleanupAskPass) {
      await cleanupAskPass();
    }
  }
}