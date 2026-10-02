# Antigravity & GitHub Bridge MCP Server for Gemini

A Model Context Protocol (MCP) server written in TypeScript/Node.js that seamlessly bridges **Gemini**, **local Antigravity project workspaces**, and **GitHub**.

It allows Gemini to discover and inspect local projects, analyze file structures, detect stacks, view git status, read/write project files, and perform full repository management on GitHub (create repos, edit settings, manage issues, open PRs, create branches, and commit files).

---

## Features

### 1. Antigravity Local Workspace Operations
- **Project Discovery (`list_local_projects`):** Lists all project folders in the workspace, automatically detecting technology stacks (Node.js, TypeScript, Python, Rust, Go, Docker, etc.) and git repository states.
- **Deep Context Inspection (`get_project_context`):** Produces ASCII file trees (configurable depth), extracts configuration contents (`package.json`, `pyproject.toml`, etc.), reads `README.md`, scans source files for pending `TODO`/`FIXME` items, and inspects local git status.
- **Safe File Operations (`read_project_file`, `write_project_file`):** Reads and writes project files with built-in path-traversal protection.
- **Git & GitHub Linking (`link_project_to_github`):** Automatically initializes git if missing, sets or updates the remote origin URL, and prepares the repository for syncing.

### 2. GitHub Integration Operations
- **Repository Metadata (`github_get_repo_info`):** Fetches stats (stars, forks, open issues), default branch, active branches, and recent commits.
- **Repository Creation (`github_create_repository`):** Creates new public or private repositories under user or organization accounts.
- **Repository Settings (`github_edit_repository`):** Modifies descriptions, homepage URLs, privacy settings, topics/tags, and feature flags (issues, wikis).
- **Listing Repositories (`github_list_user_repos`):** Lists repositories accessible to the authenticated user.
- **Issue Management (`github_manage_issue`):** Lists, inspects, creates, comments on, and closes GitHub issues.
- **Pull Requests (`github_create_pull_request`):** Opens standard or draft pull requests across branches.
- **Branch Management (`github_create_branch`):** Creates new branches from any reference branch.
- **Direct Commits (`github_commit_file`):** Directly creates or updates files in a GitHub branch without needing local git installed or configured.

---

## Project Structure

```text
mcp_antigravity_with_github_on_gemini/
├── package.json                   # Dependencies & npm scripts
├── tsconfig.json                  # TypeScript NodeNext configuration
├── .env.example                   # Environment configuration template
├── .gitignore                     # Ignored files
├── gemini_mcp_config.json         # Gemini MCP client registration snippet
├── README.md                      # Documentation & reference
└── src/
    ├── index.ts                   # Stdio MCP server entry point
    ├── config.ts                  # Environment variables & path resolver
    ├── local/
    │   ├── scanner.ts             # Workspace scanner & stack detection
    │   ├── context.ts             # Deep context extractor (tree, configs, TODOs)
    │   ├── git.ts                 # Local git inspector and remote config
    │   └── files.ts               # Path traversal protection & file I/O
    ├── github/
    │   ├── client.ts              # Octokit client & auth verification
    │   └── services.ts            # GitHub API operations
    └── tools/
        ├── local-tools.ts         # Local MCP tool registrations
        └── github-tools.ts        # GitHub MCP tool registrations
```

---

## Getting Started

### 1. Prerequisites
- **Node.js**: v18.0.0 or later (v20+ recommended)
- **npm** or **pnpm**
- **Git** installed locally
- A **GitHub Personal Access Token** ([Generate here](https://github.com/settings/tokens)):
  - Classic token: `repo` scope.
  - Fine-grained token: Permissions for Administration (write), Contents (write), Issues (write), and Pull Requests (write).

### 2. Installation & Build
```bash
# Clone or navigate to the project directory
cd /path/to/mcp_antigravity_with_github_on_gemini

# Install dependencies
npm install

# Build TypeScript to ./dist
npm run build
```

### 3. Environment Configuration
Create a `.env` file from the example:
```bash
cp .env.example .env
```
Edit `.env` and fill in your values:
```env
GITHUB_PERSONAL_ACCESS_TOKEN=ghp_yourActualTokenHere
ANTIGRAVITY_PROJECTS_DIR=/home/sreedevrajendran/Documents/Projects
```

---

## Registering with Gemini

Add this server to your Gemini MCP configuration file (e.g. `gemini_mcp_config.json` or within your Gemini client settings):

```json
{
  "mcpServers": {
    "antigravity-github-bridge": {
      "command": "node",
      "args": [
        "/home/sreedevrajendran/Documents/Projects/mcp_antigravity_with_github_on_gemini/dist/index.js"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_yourActualTokenHere",
        "ANTIGRAVITY_PROJECTS_DIR": "/home/sreedevrajendran/Documents/Projects"
      }
    }
  }
}
```

---

## Tool Reference

### Antigravity Local Tools

| Tool Name | Parameters | Description |
|---|---|---|
| `list_local_projects` | `directoryPath` (opt), `includeHidden` (opt) | Discovers all project directories in the Antigravity workspace, detecting tech stacks and git states. |
| `get_project_context` | `projectName`, `includeGitStatus`, `maxFileTreeDepth`, `extractTodos`, `includeConfigs` | Gathers file tree, configuration files, README, git status, and TODOs for a project. |
| `read_project_file` | `projectName`, `filePath` | Reads the content of a file within a project workspace safely. |
| `write_project_file` | `projectName`, `filePath`, `content`, `overwrite` | Creates or updates a file inside a local project folder. |
| `link_project_to_github` | `projectName`, `repoUrl`, `defaultBranch` | Initializes Git locally and configures the `origin` remote. |

### GitHub Integration Tools

| Tool Name | Parameters | Description |
|---|---|---|
| `github_get_repo_info` | `owner`, `repo`, `includeRecentCommits` | Retrieves repository stats, default branch, recent commits, and active branch list. |
| `github_create_repository` | `name`, `description`, `private`, `autoInit`, `org`, `hasIssues`, `hasWiki` | Creates a new repository on GitHub (personal or organization). |
| `github_edit_repository` | `owner`, `repo`, `description`, `homepage`, `private`, `topics`, etc. | Edits repository metadata and settings on GitHub. |
| `github_list_user_repos` | `type`, `sort`, `direction`, `perPage` | Lists repositories accessible to the authenticated user. |
| `github_manage_issue` | `action` ("list"\|"get"\|"create"\|"close"\|"comment"), `owner`, `repo`, etc. | Full issue management and commenting. |
| `github_create_pull_request` | `owner`, `repo`, `title`, `head`, `base`, `body`, `draft` | Creates a pull request between branches on GitHub. |
| `github_create_branch` | `owner`, `repo`, `newBranch`, `fromBranch` | Creates a new git branch from an existing reference branch. |
| `github_commit_file` | `owner`, `repo`, `path`, `content`, `message`, `branch` | Commits (creates or updates) a file directly into a GitHub branch. |

---

## Example Prompts for Gemini

Once registered, you can ask Gemini natural language requests such as:

1. **"What projects do I have in my Antigravity workspace?"**
   *(Calls `list_local_projects`)*
2. **"Inspect my local project `data-analyzer` and give me a summary of its architecture and any open TODOs."**
   *(Calls `get_project_context`)*
3. **"Create a new private GitHub repository named `data-analyzer` and link my local project to it."**
   *(Calls `github_create_repository` then `link_project_to_github`)*
4. **"Check open issues on `facebook/react` or create an issue in my repo for a bug."**
   *(Calls `github_manage_issue`)*
5. **"Open a pull request from `feature/login` to `main` with summary notes."**
   *(Calls `github_create_pull_request`)*
