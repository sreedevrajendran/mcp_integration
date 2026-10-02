import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface LocalGitStatus {
  isGitRepo: boolean;
  currentBranch?: string;
  isClean?: boolean;
  staged?: string[];
  modified?: string[];
  untracked?: string[];
  remoteOrigin?: string;
  recentCommits?: Array<{
    hash: string;
    message: string;
    author: string;
    date: string;
  }>;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd, timeout: 10000 });
  return stdout.trim();
}

/**
 * Checks if the directory is a git repository.
 */
export function isGitRepository(dirPath: string): boolean {
  return fs.existsSync(path.join(dirPath, ".git"));
}

/**
 * Inspects the local git status of a project.
 */
export async function inspectGitStatus(
  projectPath: string,
  limitCommits: number = 5
): Promise<LocalGitStatus> {
  if (!isGitRepository(projectPath)) {
    return { isGitRepo: false };
  }

  try {
    // 1. Current branch
    let currentBranch = "unknown";
    try {
      currentBranch = await runGit(projectPath, ["rev-parse", "--abbrev-ref", "HEAD"]);
    } catch {
      // In an empty repo without commits, rev-parse HEAD might fail; try symbolic-ref
      try {
        currentBranch = await runGit(projectPath, ["branch", "--show-current"]);
      } catch {
        currentBranch = "main (no commits yet)";
      }
    }

    // 2. Remote origin
    let remoteOrigin: string | undefined;
    try {
      remoteOrigin = await runGit(projectPath, ["remote", "get-url", "origin"]);
    } catch {
      remoteOrigin = undefined;
    }

    // 3. Status porcelain
    const statusOutput = await runGit(projectPath, ["status", "--porcelain"]);
    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    if (statusOutput) {
      const lines = statusOutput.split("\n");
      for (const line of lines) {
        if (!line || line.length < 3) continue;
        const indexStatus = line[0];
        const workTreeStatus = line[1];
        const filePath = line.slice(3).trim();

        if (indexStatus === "?" && workTreeStatus === "?") {
          untracked.push(filePath);
        } else {
          if (indexStatus !== " " && indexStatus !== "?") {
            staged.push(`${indexStatus}: ${filePath}`);
          }
          if (workTreeStatus !== " " && workTreeStatus !== "?") {
            modified.push(`${workTreeStatus}: ${filePath}`);
          }
        }
      }
    }

    // 4. Recent commits
    const recentCommits: Array<{
      hash: string;
      message: string;
      author: string;
      date: string;
    }> = [];

    try {
      const logOutput = await runGit(projectPath, [
        "log",
        `-${limitCommits}`,
        "--pretty=format:%h|||%s|||%an|||%ar",
      ]);
      if (logOutput) {
        const commitLines = logOutput.split("\n");
        for (const line of commitLines) {
          const [hash, message, author, date] = line.split("|||");
          if (hash && message) {
            recentCommits.push({ hash, message, author, date });
          }
        }
      }
    } catch {
      // Empty repo has no commits yet
    }

    return {
      isGitRepo: true,
      currentBranch,
      isClean: staged.length === 0 && modified.length === 0 && untracked.length === 0,
      staged,
      modified,
      untracked,
      remoteOrigin,
      recentCommits,
    };
  } catch (error) {
    return {
      isGitRepo: true,
      currentBranch: "error reading git state",
    };
  }
}

/**
 * Initializes a new git repo if missing.
 */
export async function initGit(projectPath: string, initialBranch: string = "main"): Promise<string> {
  if (isGitRepository(projectPath)) {
    return "Repository is already initialized with git.";
  }
  await runGit(projectPath, ["init", "-b", initialBranch]);
  return `Initialized empty Git repository with default branch '${initialBranch}'.`;
}

/**
 * Configures or updates the remote origin URL.
 */
export async function configureRemoteOrigin(
  projectPath: string,
  remoteUrl: string
): Promise<{ action: string; url: string }> {
  if (!isGitRepository(projectPath)) {
    await initGit(projectPath);
  }

  try {
    await runGit(projectPath, ["remote", "get-url", "origin"]);
    // Remote exists, update it
    await runGit(projectPath, ["remote", "set-url", "origin", remoteUrl]);
    return { action: "updated", url: remoteUrl };
  } catch {
    // Remote doesn't exist, add it
    await runGit(projectPath, ["remote", "add", "origin", remoteUrl]);
    return { action: "added", url: remoteUrl };
  }
}
