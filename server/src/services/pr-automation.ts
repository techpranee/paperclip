import { spawn } from "node:child_process";
import { asBoolean, asString, parseObject } from "../adapters/utils.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function runCommand(args: string[], cwd: string, command = "git") {
  return await new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout: stdout.trim(), stderr: stderr.trim(), code }));
  });
}

async function assertGitRepo(cwd: string) {
  const result = await runCommand(["rev-parse", "--is-inside-work-tree"], cwd);
  return result.code === 0 && result.stdout === "true";
}

async function assertGhAvailable(cwd: string) {
  const result = await runCommand(["--version"], cwd, "gh");
  return result.code === 0;
}

function resolvePullRequestConfig(input: {
  workspaceMetadata: Record<string, unknown> | null;
  projectPolicy: Record<string, unknown> | null;
  repoRef: string | null;
}) {
  const workspaceMetadata = parseObject(input.workspaceMetadata);
  const workspacePullRequest = parseObject(workspaceMetadata.pullRequest);
  const projectPullRequest = parseObject(input.projectPolicy);

  const mode =
    asString(workspacePullRequest.mode, "") ||
    asString(projectPullRequest.mode, "") ||
    "none";
  const baseBranch =
    readNonEmptyString(workspacePullRequest.baseBranch) ??
    readNonEmptyString(projectPullRequest.baseBranch) ??
    input.repoRef ??
    "master";
  const autoPushOnDone =
    asBoolean(workspacePullRequest.autoPushOnDone, asBoolean(projectPullRequest.autoPushOnDone, true));

  return {
    mode,
    baseBranch,
    autoPushOnDone,
  };
}

export interface RunPullRequestAutomationInput {
  cwd: string;
  branchName: string | null;
  issue: {
    id: string;
    identifier: string | null;
    title: string | null;
  } | null;
  workspaceMetadata: Record<string, unknown> | null;
  projectPullRequestPolicy: Record<string, unknown> | null;
  repoRef: string | null;
}

export interface PullRequestAutomationResult {
  skipped: boolean;
  reason?: string;
  warnings: string[];
  prUrl: string | null;
  pushed: boolean;
  committed: boolean;
}

export async function runPullRequestAutomation(
  input: RunPullRequestAutomationInput,
): Promise<PullRequestAutomationResult> {
  const warnings: string[] = [];
  const resolved = resolvePullRequestConfig({
    workspaceMetadata: input.workspaceMetadata,
    projectPolicy: input.projectPullRequestPolicy,
    repoRef: input.repoRef,
  });

  if (resolved.mode !== "agent_auto_open") {
    return {
      skipped: true,
      reason: `pullRequest mode is "${resolved.mode}"`,
      warnings,
      prUrl: null,
      pushed: false,
      committed: false,
    };
  }

  if (!input.issue) {
    return {
      skipped: true,
      reason: "no issue context",
      warnings,
      prUrl: null,
      pushed: false,
      committed: false,
    };
  }

  if (!input.branchName) {
    return {
      skipped: true,
      reason: "no execution branch available",
      warnings,
      prUrl: null,
      pushed: false,
      committed: false,
    };
  }

  const isRepo = await assertGitRepo(input.cwd);
  if (!isRepo) {
    return {
      skipped: true,
      reason: `cwd is not a git repository: ${input.cwd}`,
      warnings,
      prUrl: null,
      pushed: false,
      committed: false,
    };
  }

  const ghAvailable = await assertGhAvailable(input.cwd);
  if (!ghAvailable) {
    warnings.push("GitHub CLI (gh) is not available; skipping PR automation.");
    return {
      skipped: true,
      reason: "gh not available",
      warnings,
      prUrl: null,
      pushed: false,
      committed: false,
    };
  }

  await runCommand(["checkout", input.branchName], input.cwd);
  await runCommand(["add", "-A"], input.cwd);

  const stagedDiff = await runCommand(["diff", "--cached", "--quiet"], input.cwd);
  let committed = false;
  if (stagedDiff.code !== 0) {
    const issueLabel = input.issue.identifier ?? input.issue.id;
    const title = readNonEmptyString(input.issue.title) ?? "task updates";
    const commitMessage = `${issueLabel}: ${title}`.slice(0, 180);
    const commitResult = await runCommand(["commit", "-m", commitMessage], input.cwd);
    if (commitResult.code !== 0) {
      warnings.push(`Commit failed: ${commitResult.stderr || commitResult.stdout || "unknown error"}`);
      return {
        skipped: false,
        reason: "commit_failed",
        warnings,
        prUrl: null,
        pushed: false,
        committed: false,
      };
    }
    committed = true;
  }

  if (!resolved.autoPushOnDone) {
    return {
      skipped: false,
      reason: "autoPushOnDone disabled",
      warnings,
      prUrl: null,
      pushed: false,
      committed,
    };
  }

  const pushResult = await runCommand(["push", "-u", "origin", input.branchName], input.cwd);
  if (pushResult.code !== 0) {
    warnings.push(`Push failed: ${pushResult.stderr || pushResult.stdout || "unknown error"}`);
    return {
      skipped: false,
      reason: "push_failed",
      warnings,
      prUrl: null,
      pushed: false,
      committed,
    };
  }

  const existingPr = await runCommand(
    ["pr", "list", "--head", input.branchName, "--json", "url", "--limit", "1"],
    input.cwd,
    "gh",
  );
  if (existingPr.code === 0 && existingPr.stdout) {
    try {
      const parsed = JSON.parse(existingPr.stdout) as Array<{ url?: string }>;
      const prUrl = readNonEmptyString(parsed[0]?.url);
      if (prUrl) {
        return {
          skipped: false,
          warnings,
          prUrl,
          pushed: true,
          committed,
        };
      }
    } catch {
      warnings.push("Failed to parse existing PR metadata from gh output.");
    }
  }

  const issueLabel = input.issue.identifier ?? input.issue.id;
  const issueTitle = readNonEmptyString(input.issue.title) ?? "Automated changes";
  const prTitle = `[${issueLabel}] ${issueTitle}`.slice(0, 240);
  const prBody = `Automated PR for ${issueLabel}.\n\nGenerated by Paperclip agent run.`;
  const createPr = await runCommand(
    [
      "pr",
      "create",
      "--base",
      resolved.baseBranch,
      "--head",
      input.branchName,
      "--title",
      prTitle,
      "--body",
      prBody,
    ],
    input.cwd,
    "gh",
  );

  if (createPr.code !== 0) {
    warnings.push(`PR create failed: ${createPr.stderr || createPr.stdout || "unknown error"}`);
    return {
      skipped: false,
      reason: "pr_create_failed",
      warnings,
      prUrl: null,
      pushed: true,
      committed,
    };
  }

  const prUrl = readNonEmptyString(createPr.stdout) ?? null;
  return {
    skipped: false,
    warnings,
    prUrl,
    pushed: true,
    committed,
  };
}
