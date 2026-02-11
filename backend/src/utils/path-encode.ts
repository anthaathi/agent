import { join } from 'node:path';
import { homedir } from 'node:os';

const PI_SESSIONS_DIR = join(homedir(), '.pi', 'agent', 'sessions');

/**
 * Encode a file path for safe use in directory names.
 * Matches pi-coding-agent's encoding:
 * --home-user-project--
 */
export function encodePathForDirectory(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

/**
 * Decode a directory name back to a path (approximate).
 */
export function decodePathFromDirectory(encoded: string): string {
  return encoded.replace(/^--/, "").replace(/--$/, "").replace(/-/g, "/");
}

/**
 * Resolve a relative session path to an absolute file path.
 * e.g., "--home-user-project--/2026-01-28T05-24-53-939Z_xxx.jsonl"
 *       -> "/home/user/.pi/agent/sessions/--home-user-project--/2026-01-28T05-24-53-939Z_xxx.jsonl"
 */
export function resolveSessionPath(relativePath: string): string {
  // If already absolute, return as-is
  if (relativePath.startsWith('/')) {
    return relativePath;
  }
  return join(PI_SESSIONS_DIR, relativePath);
}

/**
 * For logging - just returns the path as-is since it's already readable.
 * Kept for backwards compatibility.
 */
export function decodeSessionPath(sessionPath: string): string {
  return sessionPath;
}