import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { formatTreeToString, getProjectContext } from "../local/context.js";
import { readProjectFile, writeProjectFile } from "../local/files.js";
import { configureRemoteOrigin, initGit } from "../local/git.js";
import { listLocalProjects } from "../local/scanner.js";

/**
 * Registers all local Antigravity workspace inspection & management tools.
 */
export function registerLocalTools(server: McpServer): void {
  // 1. list_local_projects
  server.tool(
    "list_local_projects",
    "Discovers and lists all local project directories managed under the Antigravity workspace, detecting technology stacks and git repository states.",
    {
      directoryPath: z
        .string()
        .optional()
        .describe("Optional path override for the Antigravity projects folder"),
      includeHidden: z
        .boolean()
        .default(false)
        .describe("Whether to include hidden folders in scan"),
    },
    async ({ directoryPath, includeHidden }) => {
      try {
        const projects = await listLocalProjects(directoryPath, includeHidden);

        let summary = `Found ${projects.length} local project(s):\n\n`;
        for (const p of projects) {
          summary += `• ${p.name} [${p.detectedStack.join(", ")}]${p.hasGit ? " (git)" : ""}\n`;
          if (p.description) summary += `  Desc: ${p.description}\n`;
          summary += `  Path: ${p.absolutePath}\n`;
          summary += `  Last Modified: ${p.lastModified}\n\n`;
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ count: projects.length, projects, summary }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error listing local projects: ${error.message}` }],
        };
      }
    }
  );

  // 2. get_project_context
  server.tool(
    "get_project_context",
    "Gathers comprehensive context for a local project: directory tree, configuration files (package.json, pyproject.toml, etc.), README contents, local git status, and pending TODOs.",
    {
      projectName: z
        .string()
        .describe("Name of the project folder in your Antigravity workspace"),
      includeGitStatus: z
        .boolean()
        .default(true)
        .describe("Include local git branch, uncommitted files, and recent commit history"),
      maxFileTreeDepth: z
        .number()
        .default(2)
        .describe("Depth of directory tree to inspect (1-4)"),
      extractTodos: z
        .boolean()
        .default(true)
        .describe("Scan code files for pending TODO and FIXME markers"),
      includeConfigs: z
        .boolean()
        .default(true)
        .describe("Include contents of key configuration files"),
    },
    async ({ projectName, includeGitStatus, maxFileTreeDepth, extractTodos, includeConfigs }) => {
      try {
        const context = await getProjectContext(projectName, {
          includeGitStatus,
          maxFileTreeDepth,
          extractTodos,
          includeConfigs,
        });

        const asciiTree = formatTreeToString(context.fileTree);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  ...context,
                  formattedTree: asciiTree,
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
          content: [{ type: "text", text: `Error reading project context: ${error.message}` }],
        };
      }
    }
  );

  // 3. read_project_file
  server.tool(
    "read_project_file",
    "Reads a specific source or configuration file within a local Antigravity project.",
    {
      projectName: z.string().describe("Name of the local project directory"),
      filePath: z.string().describe("Relative path to the file inside the project"),
    },
    async ({ projectName, filePath }) => {
      try {
        const fileData = await readProjectFile(projectName, filePath);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(fileData, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error reading file: ${error.message}` }],
        };
      }
    }
  );

  // 4. write_project_file
  server.tool(
    "write_project_file",
    "Creates or updates a file inside a local Antigravity project directory.",
    {
      projectName: z.string().describe("Name of the local project directory"),
      filePath: z.string().describe("Relative path to the target file inside the project"),
      content: z.string().describe("File contents to write"),
      overwrite: z.boolean().default(true).describe("Whether to overwrite if file already exists"),
    },
    async ({ projectName, filePath, content, overwrite }) => {
      try {
        const result = await writeProjectFile(projectName, filePath, content, overwrite);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, ...result }, null, 2),
            },
          ],
        };
      } catch (error: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Error writing project file: ${error.message}` }],
        };
      }
    }
  );

  // 5. link_project_to_github
  server.tool(
    "link_project_to_github",
    "Initializes Git locally for a project (if missing) and sets/updates the remote origin pointing to GitHub.",
    {
      projectName: z.string().describe("Name of the local project directory"),
      repoUrl: z
        .string()
        .describe("GitHub repository clone URL (HTTPS or SSH, e.g. https://github.com/owner/repo.git)"),
      defaultBranch: z
        .string()
        .default("main")
        .describe("Default branch to initialize if git is missing"),
    },
    async ({ projectName, repoUrl, defaultBranch }) => {
      try {
        const { getSafeProjectPath } = await import("../local/files.js");
        const projectDir = getSafeProjectPath(projectName);

        const initMessage = await initGit(projectDir, defaultBranch);
        const remoteResult = await configureRemoteOrigin(projectDir, repoUrl);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                {
                  success: true,
                  projectName,
                  projectPath: projectDir,
                  initStatus: initMessage,
                  remote: remoteResult,
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
          content: [{ type: "text", text: `Error linking project to GitHub: ${error.message}` }],
        };
      }
    }
  );
}
