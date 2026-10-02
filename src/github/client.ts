import { Octokit } from "@octokit/rest";
import { ensureGitHubToken } from "../config.js";

let octokitInstance: Octokit | null = null;

/**
 * Returns an authenticated Octokit client instance.
 */
export function getOctokit(): Octokit {
  if (!octokitInstance) {
    const token = ensureGitHubToken();
    octokitInstance = new Octokit({
      auth: token,
      userAgent: "Antigravity-Gemini-Bridge/1.0.0",
    });
  }
  return octokitInstance;
}

/**
 * Verifies that the GitHub token is valid and returns user info.
 */
export async function verifyGitHubAuth(): Promise<{ login: string; name: string | null; scopes?: string }> {
  const octokit = getOctokit();
  const { data, headers } = await octokit.rest.users.getAuthenticated();
  return {
    login: data.login,
    name: data.name,
    scopes: headers["x-oauth-scopes"],
  };
}
