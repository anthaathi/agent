import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { GitService } from '../services/GitService.js';
import { logger } from '../utils/logger.js';

interface CwdQuery {
  cwd: string;
}

interface FileBody {
  cwd: string;
  path: string;
}

interface CommitBody {
  cwd: string;
  message: string;
}

interface BranchBody {
  cwd: string;
  branch: string;
}

export async function gitRoutes(fastify: FastifyInstance): Promise<void> {
  const gitService = GitService.getInstance();

  // GET /api/git/status - Get git status
  fastify.get('/status', async (request: FastifyRequest<{ Querystring: CwdQuery }>, reply) => {
    try {
      const { cwd } = request.query;
      
      if (!cwd) {
        reply.status(400);
        return { error: 'Missing required query parameter: cwd' };
      }

      const files = await gitService.getStatus(cwd);
      return { files };
    } catch (err) {
      logger.error('Failed to get git status', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // GET /api/git/diff - Get diff for file
  fastify.get('/diff', async (request: FastifyRequest<{ Querystring: { cwd: string; path: string; staged?: string } }>, reply) => {
    try {
      const { cwd, path: filePath, staged } = request.query;
      
      if (!cwd || !filePath) {
        reply.status(400);
        return { error: 'Missing required query parameters: cwd, path' };
      }

      const diff = await gitService.getDiff(cwd, filePath, staged === 'true');
      return { diff };
    } catch (err) {
      logger.error('Failed to get git diff', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // POST /api/git/stage - Stage file
  fastify.post('/stage', async (request: FastifyRequest<{ Body: FileBody }>, reply) => {
    try {
      const { cwd, path: filePath } = request.body;
      
      if (!cwd || !filePath) {
        reply.status(400);
        return { error: 'Missing required fields: cwd, path' };
      }

      await gitService.stageFile(cwd, filePath);
      return { success: true };
    } catch (err) {
      logger.error('Failed to stage file', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // POST /api/git/unstage - Unstage file
  fastify.post('/unstage', async (request: FastifyRequest<{ Body: FileBody }>, reply) => {
    try {
      const { cwd, path: filePath } = request.body;
      
      if (!cwd || !filePath) {
        reply.status(400);
        return { error: 'Missing required fields: cwd, path' };
      }

      await gitService.unstageFile(cwd, filePath);
      return { success: true };
    } catch (err) {
      logger.error('Failed to unstage file', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // POST /api/git/commit - Commit changes
  fastify.post('/commit', async (request: FastifyRequest<{ Body: CommitBody }>, reply) => {
    try {
      const { cwd, message } = request.body;
      
      if (!cwd || !message) {
        reply.status(400);
        return { error: 'Missing required fields: cwd, message' };
      }

      await gitService.commit(cwd, message);
      return { success: true };
    } catch (err) {
      logger.error('Failed to commit', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // GET /api/git/branches - List branches
  fastify.get('/branches', async (request: FastifyRequest<{ Querystring: CwdQuery }>, reply) => {
    try {
      const { cwd } = request.query;
      
      if (!cwd) {
        reply.status(400);
        return { error: 'Missing required query parameter: cwd' };
      }

      const branches = await gitService.getBranches(cwd);
      return { branches };
    } catch (err) {
      logger.error('Failed to get branches', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // POST /api/git/checkout - Checkout branch
  fastify.post('/checkout', async (request: FastifyRequest<{ Body: BranchBody }>, reply) => {
    try {
      const { cwd, branch } = request.body;
      
      if (!cwd || !branch) {
        reply.status(400);
        return { error: 'Missing required fields: cwd, branch' };
      }

      await gitService.checkoutBranch(cwd, branch);
      return { success: true };
    } catch (err) {
      logger.error('Failed to checkout branch', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });
}
