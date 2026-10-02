import dotenv from "dotenv";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { fileURLToPath } from "node:url";

// Load environment variables from project directory .env, ~/.env, or process.cwd() .env
const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRootDir = path.resolve(currentDir, "..");
const projectEnv = path.join(projectRootDir, ".env");
const homeEnv = path.join(os.homedir(), ".env");

if (fs.existsSync(projectEnv)) {
  dotenv.config({ path: projectEnv });
}
if (fs.existsSync(homeEnv)) {
  dotenv.config({ path: homeEnv });
}
dotenv.config(); // fallback to cwd


export interface ServerConfig {
  githubToken: string | undefined;
  projectsDir: string;
}

/**
 * Resolves the primary directory where Antigravity projects reside.
 * Evaluates:
 * 1. ANTIGRAVITY_PROJECTS_DIR environment variable
 * 2. Fallback to ~/Documents/Projects if it exists
 * 3. Fallback to current working directory
 */
export function resolveProjectsDirectory(overrideDir?: string): string {
  if (overrideDir) {
    const resolved = path.resolve(overrideDir);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Specified projects directory does not exist: ${resolved}`);
    }
    return resolved;
  }

  const envDir = process.env.ANTIGRAVITY_PROJECTS_DIR || process.env.PROJECTS_DIR;
  if (envDir) {
    const resolved = path.resolve(envDir);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  // Check default ~/Documents/Projects
  const defaultUserDir = path.join(os.homedir(), "Documents", "Projects");
  if (fs.existsSync(defaultUserDir)) {
    return defaultUserDir;
  }

  return process.cwd();
}

export const CONFIG: ServerConfig = {
  get githubToken(): string | undefined {
    return process.env.GITHUB_PERSONAL_ACCESS_TOKEN || process.env.GITHUB_TOKEN;
  },
  get projectsDir(): string {
    return resolveProjectsDirectory();
  },
};

/**
 * Asserts that the GitHub Personal Access Token is configured.
 * Throws a helpful error message with setup instructions if missing.
 */
export function ensureGitHubToken(): string {
  const token = CONFIG.githubToken;
  if (!token || token.trim() === "") {
    throw new Error(
      "Missing GitHub token. Please set GITHUB_PERSONAL_ACCESS_TOKEN in your environment or .env file. " +
      "You can generate one at https://github.com/settings/tokens (classic with 'repo' scope or fine-grained with Repository permissions)."
    );
  }
  return token.trim();
}
