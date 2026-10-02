import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  commitFileToGitHub,
  createBranch,
  createPullRequest,
  createRepository,
  editRepository,
  getRepoInfo,
  listUserRepos,
  manageIssue,
} from "../github/services.js";

/**
 * Registers all GitHub integration tools for repository inspection, creation, editing,
 * issues, PRs, branches, and file commits.
 */
export function registerGitHubTools(server: McpServer): void {
  // 1. github_get_repo_info
  server.tool(
    "github_get_repo_info",
    "Fetches repository metadata, stars, forks, default branch, recent commits, and active branch list from GitHub.",
    {
      owner: z.string().describe("Repository owner or organization name"),
      repo: z.string().describe("Repository name"),
      includeRecentCommits: z
        .boolean()
        .default(true)
        .describe("Whether to fetch the last 5 commits on default branch"),
    },
    async ({ owner, repo, includeRecentCommits }) => {
      try {
        const info = await getRepoInfo(owner, repo, includeRecentCommits);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(info, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `GitHub API error: ${error.message}` }],
        };
      }
    }
  );

  // 2. github_create_repository
  server.tool(
    "github_create_repository",
    "Creates a new repository on GitHub (public or private) for the authenticated user or an organization.",
    {
      name: z.string().describe("Repository name to create"),
      description: z.string().optional().describe("Short description of the repository"),
      private: z.boolean().default(true).describe("Whether the repository should be private"),
      autoInit: z
        .boolean()
        .default(false)
        .describe("Whether to initialize the repository with an empty README on GitHub"),
      org: z
        .string()
        .optional()
        .describe("GitHub organization name (leave empty to create under personal user account)"),
      hasIssues: z.boolean().default(true).describe("Enable GitHub Issues"),
      hasWiki: z.boolean().default(false).describe("Enable GitHub Wiki"),
    },
    async ({ name, description, private: isPrivate, autoInit, org, hasIssues, hasWiki }) => {
      try {
        const repo = await createRepository({
          name,
          description,
          private: isPrivate,
          autoInit,
          org,
          hasIssues,
          hasWiki,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Repository ${repo.fullName} created successfully on GitHub!`,
                  repository: repo,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to create GitHub repository: ${error.message}` }],
        };
      }
    }
  );

  // 3. github_edit_repository
  server.tool(
    "github_edit_repository",
    "Edits repository settings on GitHub (e.g. description, homepage URL, private/public visibility, topics/tags).",
    {
      owner: z.string().describe("Repository owner or organization"),
      repo: z.string().describe("Repository name"),
      description: z.string().optional().describe("New repository description"),
      homepage: z.string().optional().describe("New repository homepage URL"),
      private: z.boolean().optional().describe("Change repository visibility (true for private, false for public)"),
      topics: z.array(z.string()).optional().describe("Array of topics/tags for the repository"),
      defaultBranch: z.string().optional().describe("Change the default branch name"),
      hasIssues: z.boolean().optional().describe("Enable/disable Issues"),
      hasWiki: z.boolean().optional().describe("Enable/disable Wiki"),
    },
    async ({ owner, repo, description, homepage, private: isPrivate, topics, defaultBranch, hasIssues, hasWiki }) => {
      try {
        const result = await editRepository({
          owner,
          repo,
          description,
          homepage,
          private: isPrivate,
          topics,
          defaultBranch,
          hasIssues,
          hasWiki,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Repository ${owner}/${repo} updated successfully!`,
                  details: result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to update repository: ${error.message}` }],
        };
      }
    }
  );

  // 4. github_list_user_repos
  server.tool(
    "github_list_user_repos",
    "Lists repositories accessible to the authenticated GitHub user.",
    {
      type: z
        .enum(["all", "owner", "public", "private", "member"])
        .default("owner")
        .describe("Filter repos by affiliation type"),
      sort: z
        .enum(["created", "updated", "pushed", "full_name"])
        .default("updated")
        .describe("Sort order"),
      direction: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
      perPage: z.number().default(20).describe("Number of repositories to return (max 100)"),
    },
    async ({ type, sort, direction, perPage }) => {
      try {
        const repos = await listUserRepos({ type, sort, direction, perPage });
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: repos.length, repositories: repos }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to list repositories: ${error.message}` }],
        };
      }
    }
  );

  // 5. github_manage_issue
  server.tool(
    "github_manage_issue",
    "Creates, lists, gets, comments on, or closes issues on a GitHub repository.",
    {
      action: z
        .enum(["list", "get", "create", "close", "comment"])
        .describe("Action to perform on issues"),
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      issueNumber: z
        .number()
        .optional()
        .describe("Issue number (required for 'get', 'close', and 'comment')"),
      title: z.string().optional().describe("Issue title (required for 'create')"),
      body: z.string().optional().describe("Issue description or comment text"),
      state: z
        .enum(["open", "closed", "all"])
        .default("open")
        .describe("Filter state when listing issues"),
      labels: z
        .array(z.string())
        .optional()
        .describe("Labels to apply when creating or filtering issues"),
    },
    async ({ action, owner, repo, issueNumber, title, body, state, labels }) => {
      try {
        const result = await manageIssue({
          action,
          owner,
          repo,
          issueNumber,
          title,
          body,
          state,
          labels,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to manage issue: ${error.message}` }],
        };
      }
    }
  );

  // 6. github_create_pull_request
  server.tool(
    "github_create_pull_request",
    "Creates a pull request on GitHub between two branches.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      title: z.string().describe("Pull request title"),
      head: z.string().describe("Branch name containing your changes (e.g. 'feature/new-login')"),
      base: z.string().default("main").describe("Target branch to merge into (e.g. 'main')"),
      body: z.string().describe("Detailed description of the pull request changes"),
      draft: z.boolean().default(false).describe("Whether to open the PR as a draft"),
    },
    async ({ owner, repo, title, head, base, body, draft }) => {
      try {
        const pr = await createPullRequest({
          owner,
          repo,
          title,
          head,
          base,
          body,
          draft,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Pull Request #${pr.number} opened successfully!`,
                  pullRequest: pr,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to create pull request: ${error.message}` }],
        };
      }
    }
  );

  // 7. github_create_branch
  server.tool(
    "github_create_branch",
    "Creates a new branch on GitHub from a reference source branch.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      newBranch: z.string().describe("Name of the new branch to create"),
      fromBranch: z
        .string()
        .optional()
        .describe("Source branch to fork from (defaults to repository default branch)"),
    },
    async ({ owner, repo, newBranch, fromBranch }) => {
      try {
        const result = await createBranch({
          owner,
          repo,
          newBranch,
          fromBranch,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `Branch '${newBranch}' created successfully!`,
                  details: result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to create branch: ${error.message}` }],
        };
      }
    }
  );

  // 8. github_commit_file
  server.tool(
    "github_commit_file",
    "Commits (creates or updates) a file directly into a GitHub repository branch.",
    {
      owner: z.string().describe("Repository owner"),
      repo: z.string().describe("Repository name"),
      path: z.string().describe("Path to the file in the repository (e.g. 'src/index.ts')"),
      content: z.string().describe("The file text content to commit"),
      message: z.string().describe("Git commit message"),
      branch: z.string().default("main").describe("Target branch to commit to"),
    },
    async ({ owner, repo, path: filePath, content, message, branch }) => {
      try {
        const result = await commitFileToGitHub({
          owner,
          repo,
          path: filePath,
          content,
          message,
          branch,
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  message: `File '${filePath}' ${result.action} on branch '${branch}'.`,
                  commit: result,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to commit file to GitHub: ${error.message}` }],
        };
      }
    }
  );
}
