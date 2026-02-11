import { spawn } from 'node:child_process';
import { logger } from '../utils/logger.js';

export interface GitStatus {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U' | '?' | '!';
  staged: boolean;
  additions: number;
  deletions: number;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
}

export class GitService {
  private static instance: GitService;

  static getInstance(): GitService {
    if (!GitService.instance) {
      GitService.instance = new GitService();
    }
    return GitService.instance;
  }

  async getStatus(cwd: string): Promise<GitStatus[]> {
    const result: GitStatus[] = [];
    
    try {
      // Get short status
      const statusOutput = await this.execGit(cwd, ['status', '--porcelain']);
      const lines = statusOutput.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const indexStatus = line[0];
        const worktreeStatus = line[1];
        const filePath = line.slice(3);
        
        // Determine status (staged uses index status, unstaged uses worktree)
        const status = indexStatus !== ' ' ? indexStatus : worktreeStatus;
        const staged = indexStatus !== ' ' && indexStatus !== '?';
        
        // Get diff stats for this file
        const stats = await this.getDiffStats(cwd, filePath, staged);
        
        result.push({
          path: filePath,
          status: status as GitStatus['status'],
          staged,
          additions: stats.additions,
          deletions: stats.deletions,
        });
      }
    } catch (err) {
      logger.error(`Failed to get git status for ${cwd}`, { error: (err as Error).message });
    }
    
    return result;
  }

  async getDiff(cwd: string, filePath: string, staged: boolean): Promise<string> {
    try {
      const args = ['diff'];
      if (staged) args.push('--cached');
      args.push('--', filePath);
      
      return await this.execGit(cwd, args);
    } catch (err) {
      logger.error(`Failed to get diff for ${filePath}`, { error: (err as Error).message });
      return '';
    }
  }

  async stageFile(cwd: string, filePath: string): Promise<void> {
    await this.execGit(cwd, ['add', filePath]);
  }

  async unstageFile(cwd: string, filePath: string): Promise<void> {
    await this.execGit(cwd, ['reset', 'HEAD', filePath]);
  }

  async commit(cwd: string, message: string): Promise<void> {
    await this.execGit(cwd, ['commit', '-m', message]);
  }

  async getBranches(cwd: string): Promise<GitBranch[]> {
    const result: GitBranch[] = [];
    
    try {
      const output = await this.execGit(cwd, ['branch', '-vv']);
      const lines = output.split('\n').filter(Boolean);
      
      for (const line of lines) {
        const current = line.startsWith('*');
        const name = line.slice(2).split(' ')[0];
        const remote = line.includes('[origin/') 
          ? line.split('[origin/')[1].split(']')[0] 
          : undefined;
        
        result.push({ name, current, remote });
      }
    } catch (err) {
      logger.error(`Failed to get branches for ${cwd}`, { error: (err as Error).message });
    }
    
    return result;
  }

  async checkoutBranch(cwd: string, branch: string): Promise<void> {
    await this.execGit(cwd, ['checkout', branch]);
  }

  async createWorktree(cwd: string, branch: string, path: string): Promise<void> {
    await this.execGit(cwd, ['worktree', 'add', path, branch]);
  }

  private async getDiffStats(cwd: string, filePath: string, staged: boolean): Promise<{ additions: number; deletions: number }> {
    try {
      const args = ['diff', '--numstat'];
      if (staged) args.push('--cached');
      args.push('--', filePath);
      
      const output = await this.execGit(cwd, args);
      const line = output.split('\n')[0];
      
      if (!line) return { additions: 0, deletions: 0 };
      
      const parts = line.split('\t');
      if (parts.length < 2) return { additions: 0, deletions: 0 };
      
      const additions = parts[0] === '-' ? 0 : parseInt(parts[0], 10) || 0;
      const deletions = parts[1] === '-' ? 0 : parseInt(parts[1], 10) || 0;
      
      return { additions, deletions };
    } catch {
      return { additions: 0, deletions: 0 };
    }
  }

  private execGit(cwd: string, args: string[]): Promise<string> {
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
          resolve(output);
        }
      });
    });
  }
}
