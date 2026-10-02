import fs from "node:fs";
import path from "node:path";
import { resolveProjectsDirectory } from "../config.js";

export interface ProjectMetadata {
  name: string;
  relativePath: string;
  absolutePath: string;
  detectedStack: string[];
  hasGit: boolean;
  lastModified: string;
  sizeBytes?: number;
  description?: string;
}

/**
 * Detects the tech stack of a project by inspecting key manifest and configuration files.
 */
export function detectStack(projectPath: string): string[] {
  const stack: string[] = [];
  try {
    const files = new Set(fs.readdirSync(projectPath));

    if (files.has("package.json")) {
      stack.push("Node.js");
      if (files.has("tsconfig.json")) {
        stack.push("TypeScript");
      }
      try {
        const pkgRaw = fs.readFileSync(path.join(projectPath, "package.json"), "utf8");
        const pkg = JSON.parse(pkgRaw);
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        if (deps["react"]) stack.push("React");
        if (deps["next"]) stack.push("Next.js");
        if (deps["vue"]) stack.push("Vue");
        if (deps["express"]) stack.push("Express");
        if (deps["@modelcontextprotocol/sdk"]) stack.push("MCP Server");
        if (deps["@octokit/rest"]) stack.push("Octokit");
      } catch {
        // Ignored if package.json has parsing errors
      }
    }

    if (
      files.has("pyproject.toml") ||
      files.has("requirements.txt") ||
      files.has("Pipfile") ||
      files.has("setup.py")
    ) {
      stack.push("Python");
    }

    if (files.has("Cargo.toml")) {
      stack.push("Rust");
    }

    if (files.has("go.mod")) {
      stack.push("Go");
    }

    if (files.has("pom.xml")) {
      stack.push("Java (Maven)");
    }

    if (files.has("build.gradle") || files.has("build.gradle.kts")) {
      stack.push("Gradle");
    }

    if (files.has("Dockerfile") || files.has("docker-compose.yml") || files.has("compose.yaml")) {
      stack.push("Docker");
    }
  } catch {
    // If directory cannot be read, return whatever was found
  }

  return stack.length > 0 ? stack : ["Generic / Unknown"];
}

/**
 * Extracts a brief project description from README.md or package.json if present.
 */
function extractDescription(projectPath: string): string | undefined {
  try {
    const pkgPath = path.join(projectPath, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
      if (pkg.description && typeof pkg.description === "string" && pkg.description.trim()) {
        return pkg.description.trim();
      }
    }

    const readmePath = path.join(projectPath, "README.md");
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, "utf8");
      const lines = readme.split("\n").map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("#") && line.length > 10) {
          return line.slice(0, 160) + (line.length > 160 ? "..." : "");
        }
      }
    }
  } catch {
    // Graceful fallback
  }
  return undefined;
}

/**
 * Scans a folder for local projects.
 */
export async function listLocalProjects(
  customDir?: string,
  includeHidden: boolean = false
): Promise<ProjectMetadata[]> {
  const baseDir = resolveProjectsDirectory(customDir);
  const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
  const projects: ProjectMetadata[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!includeHidden && entry.name.startsWith(".")) continue;

    // Skip node_modules or system directories if present in base dir
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;

    const fullPath = path.join(baseDir, entry.name);
    try {
      const stat = await fs.promises.stat(fullPath);
      const hasGit = fs.existsSync(path.join(fullPath, ".git"));
      const detectedStack = detectStack(fullPath);
      const description = extractDescription(fullPath);

      projects.push({
        name: entry.name,
        relativePath: path.relative(baseDir, fullPath),
        absolutePath: fullPath,
        detectedStack,
        hasGit,
        lastModified: stat.mtime.toISOString(),
        description,
      });
    } catch {
      // Skip unreadable directories
    }
  }

  // Sort by last modified descending
  return projects.sort((a, b) => b.lastModified.localeCompare(a.lastModified));
}
