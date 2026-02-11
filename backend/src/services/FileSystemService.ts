import { readdir, readFile, stat, writeFile, access, constants } from 'node:fs/promises';
import { join, resolve, relative } from 'node:path';
import { homedir } from 'node:os';
import { spawn } from 'node:child_process';
import { logger } from '../utils/logger.js';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  mtime: number;
}

export interface GitInfo {
  isRepo: boolean;
  branch?: string;
  remoteUrl?: string;
  worktreePath?: string;
}

export class FileSystemService {
  private static instance: FileSystemService;

  static getInstance(): FileSystemService {
    if (!FileSystemService.instance) {
      FileSystemService.instance = new FileSystemService();
    }
    return FileSystemService.instance;
  }

  getHomeDirectory(): string {
    return homedir();
  }

  async listDirectory(dirPath: string): Promise<FileEntry[]> {
    try {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const result: FileEntry[] = [];

      for (const entry of entries) {
        const fullPath = join(dirPath, entry.name);
        let type: 'file' | 'directory' | 'symlink' = 'file';
        let size = 0;
        let mtime = 0;

        try {
          const stats = await stat(fullPath);
          size = stats.size;
          mtime = stats.mtimeMs;

          if (entry.isDirectory()) {
            type = 'directory';
          } else if (entry.isSymbolicLink()) {
            type = 'symlink';
          }
        } catch {
          // Skip entries we can't stat
          continue;
        }

        result.push({
          name: entry.name,
          path: fullPath,
          type,
          size,
          mtime,
        });
      }

      // Sort: directories first, then alphabetically
      return result.sort((a, b) => {
        if (a.type === 'directory' && b.type !== 'directory') return -1;
        if (a.type !== 'directory' && b.type === 'directory') return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (err) {
      logger.error(`Failed to list directory ${dirPath}`, { error: (err as Error).message });
      throw new Error(`Failed to list directory: ${(err as Error).message}`);
    }
  }

  async readFile(filePath: string): Promise<string> {
    try {
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch (err) {
      logger.error(`Failed to read file ${filePath}`, { error: (err as Error).message });
      throw new Error(`Failed to read file: ${(err as Error).message}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      await writeFile(filePath, content, 'utf-8');
    } catch (err) {
      logger.error(`Failed to write file ${filePath}`, { error: (err as Error).message });
      throw new Error(`Failed to write file: ${(err as Error).message}`);
    }
  }

  async getGitInfo(dirPath: string): Promise<GitInfo> {
    return new Promise((resolve) => {
      const proc = spawn('git', ['rev-parse', '--git-dir'], {
        cwd: dirPath,
      });

      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', async (code) => {
        if (code !== 0) {
          resolve({ isRepo: false });
          return;
        }

        const gitDir = output.trim();
        const worktreePath = gitDir.endsWith('.git') 
          ? gitDir.slice(0, -4) || dirPath 
          : dirPath;

        // Get branch
        const branch = await this.execGitCommand(dirPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
        
        // Get remote URL
        const remoteUrl = await this.execGitCommand(dirPath, ['remote', 'get-url', 'origin']).catch(() => undefined);

        resolve({
          isRepo: true,
          branch: branch || 'main',
          remoteUrl,
          worktreePath,
        });
      });
    });
  }

  private execGitCommand(cwd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', args, { cwd });
      let output = '';
      let errorOutput = '';

      proc.stdout.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(errorOutput || `Git command failed with code ${code}`));
        } else {
          resolve(output.trim());
        }
      });
    });
  }

  async searchFiles(dirPath: string, query: string): Promise<string[]> {
    // Simple file search - could be enhanced with ripgrep or similar
    const results: string[] = [];
    
    try {
      const entries = await this.listDirectory(dirPath);
      
      for (const entry of entries) {
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(entry.path);
        }
        
        if (entry.type === 'directory' && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          try {
            const subResults = await this.searchFiles(entry.path, query);
            results.push(...subResults);
          } catch {
            // Skip directories we can't access
          }
        }
      }
    } catch {
      // Ignore errors during search
    }
    
    return results.slice(0, 100); // Limit results
  }

  async pathExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}
