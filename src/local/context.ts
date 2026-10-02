import fs from "node:fs";
import path from "node:path";
import { getSafeProjectPath } from "./files.js";
import { inspectGitStatus, LocalGitStatus } from "./git.js";
import { detectStack } from "./scanner.js";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  "target",
  ".venv",
  "venv",
  "__pycache__",
  ".idea",
  ".vscode",
  "coverage",
]);

const CONFIG_FILENAMES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Dockerfile",
  "docker-compose.yml",
  "compose.yaml",
  ".env.example",
  "README.md",
];

export interface FileTreeNode {
  name: string;
  type: "file" | "directory";
  children?: FileTreeNode[];
}

export interface TodoItem {
  file: string;
  line: number;
  text: string;
  type: "TODO" | "FIXME" | "NOTE";
}

export interface ProjectContext {
  projectName: string;
  projectPath: string;
  detectedStack: string[];
  fileTree: FileTreeNode;
  configFiles: Record<string, string>;
  readme?: string;
  todos: TodoItem[];
  gitStatus?: LocalGitStatus;
}

/**
 * Builds a hierarchical directory tree up to maxDepth.
 */
function buildFileTree(dirPath: string, currentDepth: number, maxDepth: number): FileTreeNode {
  const dirName = path.basename(dirPath);
  const node: FileTreeNode = {
    name: dirName,
    type: "directory",
    children: [],
  };

  if (currentDepth >= maxDepth) {
    return node;
  }

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        node.children?.push(buildFileTree(fullPath, currentDepth + 1, maxDepth));
      } else if (entry.isFile()) {
        node.children?.push({
          name: entry.name,
          type: "file",
        });
      }
    }
  } catch {
    // Graceful fallback for unreadable subdirectories
  }

  return node;
}

/**
 * Formats a FileTreeNode into an ascii tree string.
 */
export function formatTreeToString(node: FileTreeNode, prefix: string = ""): string {
  let result = "";
  if (!node.children || node.children.length === 0) return result;

  node.children.forEach((child, index) => {
    const isLast = index === (node.children?.length ?? 0) - 1;
    const connector = isLast ? "└── " : "├── ";
    result += `${prefix}${connector}${child.name}${child.type === "directory" ? "/" : ""}\n`;
    if (child.type === "directory" && child.children && child.children.length > 0) {
      const childPrefix = prefix + (isLast ? "    " : "│   ");
      result += formatTreeToString(child, childPrefix);
    }
  });

  return result;
}

/**
 * Scans key source files for TODO and FIXME comments.
 */
function findTodos(dirPath: string, maxFiles: number = 50): TodoItem[] {
  const todos: TodoItem[] = [];
  let filesScanned = 0;

  function traverse(currentDir: string) {
    if (filesScanned >= maxFiles) return;

    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        if (filesScanned >= maxFiles) break;
        if (IGNORED_DIRS.has(entry.name)) continue;

        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (
          entry.isFile() &&
          /\.(ts|js|tsx|jsx|py|rs|go|java|md|json|yaml|yml)$/.test(entry.name)
        ) {
          filesScanned++;
          try {
            const content = fs.readFileSync(fullPath, "utf8");
            const lines = content.split("\n");
            lines.forEach((line, idx) => {
              const match = line.match(/\b(TODO|FIXME|NOTE)\b[:\s]*(.*)/i);
              if (match) {
                todos.push({
                  file: path.relative(dirPath, fullPath),
                  line: idx + 1,
                  type: match[1].toUpperCase() as "TODO" | "FIXME" | "NOTE",
                  text: match[2]?.trim() || line.trim(),
                });
              }
            });
          } catch {
            // Skip file if read fails
          }
        }
      }
    } catch {
      // Skip directory
    }
  }

  traverse(dirPath);
  return todos.slice(0, 30); // Cap at 30 items
}

/**
 * Reads project context including configs, README, file tree, git status, and TODOs.
 */
export async function getProjectContext(
  projectName: string,
  options: {
    includeGitStatus?: boolean;
    maxFileTreeDepth?: number;
    extractTodos?: boolean;
    includeConfigs?: boolean;
  } = {}
): Promise<ProjectContext> {
  const {
    includeGitStatus = true,
    maxFileTreeDepth = 2,
    extractTodos = true,
    includeConfigs = true,
  } = options;

  const projectPath = getSafeProjectPath(projectName);
  const detectedStack = detectStack(projectPath);
  const fileTree = buildFileTree(projectPath, 0, Math.min(maxFileTreeDepth, 4));

  const configFiles: Record<string, string> = {};
  let readme: string | undefined;

  if (includeConfigs) {
    for (const filename of CONFIG_FILENAMES) {
      const fullPath = path.join(projectPath, filename);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, "utf8");
          if (filename === "README.md") {
            readme = content.length > 5000 ? content.slice(0, 5000) + "\n\n...[truncated]" : content;
          } else {
            configFiles[filename] =
              content.length > 3000 ? content.slice(0, 3000) + "\n...[truncated]" : content;
          }
        } catch {
          // Skip unreadable
        }
      }
    }
  }

  const todos = extractTodos ? findTodos(projectPath) : [];
  const gitStatus = includeGitStatus ? await inspectGitStatus(projectPath) : undefined;

  return {
    projectName,
    projectPath,
    detectedStack,
    fileTree,
    configFiles,
    readme,
    todos,
    gitStatus,
  };
}
