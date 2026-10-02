import { FunctionDeclaration, GoogleGenAI, Type } from "@google/genai";
import { formatTreeToString, getProjectContext } from "../local/context.js";
import { getSafeProjectPath, readProjectFile, writeProjectFile } from "../local/files.js";
import { configureRemoteOrigin, initGit } from "../local/git.js";
import { listLocalProjects } from "../local/scanner.js";
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

export interface ToolLog {
  name: string;
  args: any;
  result: any;
}

export interface AgentResponse {
  text: string;
  toolCalls: ToolLog[];
}

export const GEMINI_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: "list_local_projects",
    description: "Lists all local project directories in the Antigravity workspace, detecting tech stacks and git status.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        directoryPath: { type: Type.STRING, description: "Optional directory path override" },
        includeHidden: { type: Type.BOOLEAN, description: "Whether to include hidden folders" },
      },
    },
  },
  {
    name: "get_project_context",
    description: "Gathers comprehensive context for a local project: directory tree, config files, README, TODOs, and local git status.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING, description: "Project directory name" },
        includeGitStatus: { type: Type.BOOLEAN, description: "Include git status and recent commits" },
        maxFileTreeDepth: { type: Type.NUMBER, description: "Max depth for the directory tree (1-4)" },
        extractTodos: { type: Type.BOOLEAN, description: "Scan source files for TODO and FIXME comments" },
      },
      required: ["projectName"],
    },
  },
  {
    name: "read_project_file",
    description: "Reads a specific source or configuration file within a local Antigravity project.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING, description: "Project directory name" },
        filePath: { type: Type.STRING, description: "Relative file path inside the project" },
      },
      required: ["projectName", "filePath"],
    },
  },
  {
    name: "write_project_file",
    description: "Creates or updates a file inside a local project directory.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING, description: "Project directory name" },
        filePath: { type: Type.STRING, description: "Relative file path" },
        content: { type: Type.STRING, description: "File contents to write" },
        overwrite: { type: Type.BOOLEAN, description: "Overwrite if already exists" },
      },
      required: ["projectName", "filePath", "content"],
    },
  },
  {
    name: "link_project_to_github",
    description: "Initializes local Git if missing and sets/updates the remote origin pointing to GitHub.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        projectName: { type: Type.STRING, description: "Project directory name" },
        repoUrl: { type: Type.STRING, description: "GitHub clone URL (HTTPS or SSH)" },
        defaultBranch: { type: Type.STRING, description: "Initial branch name" },
      },
      required: ["projectName", "repoUrl"],
    },
  },
  {
    name: "github_get_repo_info",
    description: "Fetches repository stats, stars, forks, default branch, recent commits, and active branch list from GitHub.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING, description: "Repository owner username" },
        repo: { type: Type.STRING, description: "Repository name" },
        includeRecentCommits: { type: Type.BOOLEAN, description: "Fetch last 5 commits on default branch" },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_create_repository",
    description: "Creates a new repository on GitHub (public or private) for authenticated user or organization.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: "Repository name" },
        description: { type: Type.STRING, description: "Short description" },
        private: { type: Type.BOOLEAN, description: "Whether the repo is private" },
        autoInit: { type: Type.BOOLEAN, description: "Initialize with README" },
        org: { type: Type.STRING, description: "Organization name if creating under an org" },
      },
      required: ["name"],
    },
  },
  {
    name: "github_edit_repository",
    description: "Updates repository metadata (description, homepage, private/public visibility, topics/tags).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING, description: "Repository owner" },
        repo: { type: Type.STRING, description: "Repository name" },
        description: { type: Type.STRING, description: "New description" },
        homepage: { type: Type.STRING, description: "New homepage URL" },
        private: { type: Type.BOOLEAN, description: "Change visibility" },
        topics: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "List of topics/tags",
        },
      },
      required: ["owner", "repo"],
    },
  },
  {
    name: "github_list_user_repos",
    description: "Lists repositories accessible to the authenticated GitHub user.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        perPage: { type: Type.NUMBER, description: "Number of repos to return (max 100)" },
      },
    },
  },
  {
    name: "github_manage_issue",
    description: "Manages GitHub issues (create, list, get, close, comment).",
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: "Action to perform: 'list', 'get', 'create', 'close', or 'comment'",
        },
        owner: { type: Type.STRING, description: "Repository owner" },
        repo: { type: Type.STRING, description: "Repository name" },
        issueNumber: { type: Type.NUMBER, description: "Issue number (for get, close, comment)" },
        title: { type: Type.STRING, description: "Issue title (for create)" },
        body: { type: Type.STRING, description: "Issue description or comment body" },
        state: { type: Type.STRING, description: "Filter state: 'open', 'closed', 'all'" },
      },
      required: ["action", "owner", "repo"],
    },
  },
  {
    name: "github_create_pull_request",
    description: "Creates a pull request on GitHub between two branches.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING, description: "Repository owner" },
        repo: { type: Type.STRING, description: "Repository name" },
        title: { type: Type.STRING, description: "PR title" },
        head: { type: Type.STRING, description: "Source branch with changes" },
        base: { type: Type.STRING, description: "Target branch to merge into" },
        body: { type: Type.STRING, description: "PR description markdown" },
        draft: { type: Type.BOOLEAN, description: "Whether to create as draft" },
      },
      required: ["owner", "repo", "title", "head"],
    },
  },
  {
    name: "github_create_branch",
    description: "Creates a new git branch on GitHub from a reference branch.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING, description: "Repository owner" },
        repo: { type: Type.STRING, description: "Repository name" },
        newBranch: { type: Type.STRING, description: "New branch name" },
        fromBranch: { type: Type.STRING, description: "Source branch name" },
      },
      required: ["owner", "repo", "newBranch"],
    },
  },
  {
    name: "github_commit_file",
    description: "Directly creates or updates a file on a GitHub branch.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        owner: { type: Type.STRING, description: "Repository owner" },
        repo: { type: Type.STRING, description: "Repository name" },
        path: { type: Type.STRING, description: "File path in repository" },
        content: { type: Type.STRING, description: "Content of file" },
        message: { type: Type.STRING, description: "Commit message" },
        branch: { type: Type.STRING, description: "Target branch" },
      },
      required: ["owner", "repo", "path", "content", "message"],
    },
  },
];

/**
 * Executes a tool by name with arguments.
 */
export async function executeTool(name: string, args: any): Promise<any> {
  switch (name) {
    case "list_local_projects":
      return await listLocalProjects(args.directoryPath, args.includeHidden);

    case "get_project_context": {
      const ctx = await getProjectContext(args.projectName, {
        includeGitStatus: args.includeGitStatus ?? true,
        maxFileTreeDepth: args.maxFileTreeDepth ?? 2,
        extractTodos: args.extractTodos ?? true,
      });
      return { ...ctx, formattedTree: formatTreeToString(ctx.fileTree) };
    }

    case "read_project_file":
      return await readProjectFile(args.projectName, args.filePath);

    case "write_project_file":
      return await writeProjectFile(
        args.projectName,
        args.filePath,
        args.content,
        args.overwrite ?? true
      );

    case "link_project_to_github": {
      const projectDir = getSafeProjectPath(args.projectName);
      const initStatus = await initGit(projectDir, args.defaultBranch ?? "main");
      const remote = await configureRemoteOrigin(projectDir, args.repoUrl);
      return { success: true, initStatus, remote };
    }

    case "github_get_repo_info":
      return await getRepoInfo(args.owner, args.repo, args.includeRecentCommits ?? true);

    case "github_create_repository":
      return await createRepository(args);

    case "github_edit_repository":
      return await editRepository(args);

    case "github_list_user_repos":
      return await listUserRepos({ perPage: args.perPage ?? 20 });

    case "github_manage_issue":
      return await manageIssue(args);

    case "github_create_pull_request":
      return await createPullRequest(args);

    case "github_create_branch":
      return await createBranch(args);

    case "github_commit_file":
      return await commitFileToGitHub(args);

    default:
      throw new Error(`Unknown tool name: ${name}`);
  }
}

/**
 * Runs the Gemini agent with autonomous tool execution loop.
 */
export async function runGeminiAgent(params: {
  apiKey: string;
  message: string;
  history?: Array<{ role: "user" | "model"; parts: any[] }>;
  model?: string;
}): Promise<AgentResponse> {
  const { apiKey, message, history = [], model = "gemini-3.8-flash" } = params;

  const ai = new GoogleGenAI({ apiKey });
  const toolLogs: ToolLog[] = [];

  // Build contents array starting with conversation history
  const contents: any[] = [...history];
  contents.push({
    role: "user",
    parts: [{ text: message }],
  });

  const systemInstruction = `You are a high-capability AI coding assistant and operations agent.
You have direct access to tools for inspecting local Antigravity project workspaces on the user's computer and performing full GitHub operations (repositories, issues, pull requests, branches, commits).
When a user asks about local projects or GitHub tasks, proactively call the appropriate tools.
Summarize your actions clearly and format responses with clean markdown.`;

  // Autonomous tool loop (up to 8 turns)
  for (let turn = 0; turn < 8; turn++) {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: GEMINI_TOOL_DECLARATIONS }],
      },
    });

    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      // Final textual response reached
      return {
        text: response.text || "Task completed.",
        toolCalls: toolLogs,
      };
    }

    // Add model's tool call turn to conversation history
    const candidateParts = response.candidates?.[0]?.content?.parts || [];
    contents.push({
      role: "model",
      parts: candidateParts,
    });

    // Execute each function call and collect responses
    const functionResponseParts: any[] = [];

    for (const call of functionCalls) {
      if (!call.name) continue;
      const toolName = call.name;
      try {
        const result = await executeTool(toolName, call.args || {});
        toolLogs.push({
          name: toolName,
          args: call.args,
          result,
        });

        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            response: { result },
          },
        });
      } catch (err: any) {
        toolLogs.push({
          name: toolName,
          args: call.args,
          result: { error: err.message },
        });

        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            response: { error: err.message },
          },
        });
      }
    }

    // Feed function responses back to the model
    contents.push({
      role: "user",
      parts: functionResponseParts,
    });
  }

  return {
    text: "Completed maximum tool execution steps.",
    toolCalls: toolLogs,
  };
}
