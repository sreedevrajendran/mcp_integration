import fs from "node:fs";
import path from "node:path";
import { resolveProjectsDirectory } from "../config.js";

/**
 * Validates and safely resolves a project root directory inside the workspace.
 */
export function getSafeProjectPath(projectName: string, customBaseDir?: string): string {
  const baseDir = resolveProjectsDirectory(customBaseDir);
  const resolved = path.resolve(baseDir, projectName);

  // Security check: ensure path is inside baseDir
  const relative = path.relative(baseDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Access denied: Invalid project path outside workspace (${projectName})`);
  }

  if (!fs.existsSync(resolved)) {
    throw new Error(`Project directory not found: ${projectName} (looked in ${resolved})`);
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    throw new Error(`Target is not a directory: ${projectName}`);
  }

  return resolved;
}

/**
 * Safely resolves a file path within a given project directory.
 */
export function getSafeFilePath(projectPath: string, relativeFilePath: string): string {
  const resolved = path.resolve(projectPath, relativeFilePath);
  const relative = path.relative(projectPath, resolved);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Access denied: File path outside project boundaries (${relativeFilePath})`);
  }

  return resolved;
}

/**
 * Reads a project file with safeguards against massive binaries.
 */
export async function readProjectFile(
  projectName: string,
  relativeFilePath: string,
  maxSizeBytes: number = 250_000
): Promise<{ path: string; content: string; size: number; truncated: boolean }> {
  const projectDir = getSafeProjectPath(projectName);
  const targetFile = getSafeFilePath(projectDir, relativeFilePath);

  if (!fs.existsSync(targetFile)) {
    throw new Error(`File not found: ${relativeFilePath} in project ${projectName}`);
  }

  const stat = await fs.promises.stat(targetFile);
  if (stat.isDirectory()) {
    throw new Error(`Target path is a directory, not a file: ${relativeFilePath}`);
  }

  const isTruncated = stat.size > maxSizeBytes;
  const buffer = Buffer.alloc(Math.min(stat.size, maxSizeBytes));
  const fileHandle = await fs.promises.open(targetFile, "r");
  try {
    await fileHandle.read(buffer, 0, buffer.length, 0);
  } finally {
    await fileHandle.close();
  }

  const content = buffer.toString("utf8");
  return {
    path: relativeFilePath,
    content,
    size: stat.size,
    truncated: isTruncated,
  };
}

/**
 * Creates or writes to a file in a project workspace.
 */
export async function writeProjectFile(
  projectName: string,
  relativeFilePath: string,
  content: string,
  overwrite: boolean = true
): Promise<{ path: string; bytesWritten: number }> {
  const projectDir = getSafeProjectPath(projectName);
  const targetFile = getSafeFilePath(projectDir, relativeFilePath);

  if (fs.existsSync(targetFile) && !overwrite) {
    throw new Error(`File already exists at ${relativeFilePath}. Set overwrite: true to replace.`);
  }

  // Ensure parent directory exists
  await fs.promises.mkdir(path.dirname(targetFile), { recursive: true });
  await fs.promises.writeFile(targetFile, content, "utf8");

  return {
    path: relativeFilePath,
    bytesWritten: Buffer.byteLength(content, "utf8"),
  };
}
