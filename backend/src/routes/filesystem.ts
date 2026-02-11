import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FileSystemService } from '../services/FileSystemService.js';
import { logger } from '../utils/logger.js';

interface QueryPath {
  path: string;
}

interface BodyPath {
  path: string;
  content?: string;
}

interface SearchQuery {
  path: string;
  query: string;
}

export async function fileSystemRoutes(fastify: FastifyInstance): Promise<void> {
  const fsService = FileSystemService.getInstance();

  // GET /api/fs/home - Get current user's home directory
  fastify.get('/home', async () => {
    return { path: fsService.getHomeDirectory() };
  });

  // GET /api/fs/ls - List directory
  fastify.get('/ls', async (request: FastifyRequest<{ Querystring: QueryPath }>, reply) => {
    try {
      const { path } = request.query;
      
      if (!path) {
        reply.status(400);
        return { error: 'Missing required query parameter: path' };
      }

      const entries = await fsService.listDirectory(path);
      return { entries };
    } catch (err) {
      logger.error('Failed to list directory', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // GET /api/fs/read - Read file
  fastify.get('/read', async (request: FastifyRequest<{ Querystring: QueryPath }>, reply) => {
    try {
      const { path } = request.query;
      
      if (!path) {
        reply.status(400);
        return { error: 'Missing required query parameter: path' };
      }

      const content = await fsService.readFile(path);
      return { content };
    } catch (err) {
      logger.error('Failed to read file', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // POST /api/fs/write - Write file
  fastify.post('/write', async (request: FastifyRequest<{ Body: BodyPath }>, reply) => {
    try {
      const { path, content } = request.body;
      
      if (!path || content === undefined) {
        reply.status(400);
        return { error: 'Missing required fields: path, content' };
      }

      await fsService.writeFile(path, content);
      reply.status(201);
      return { success: true };
    } catch (err) {
      logger.error('Failed to write file', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // GET /api/fs/search - Search files
  fastify.get('/search', async (request: FastifyRequest<{ Querystring: SearchQuery }>, reply) => {
    try {
      const { path, query } = request.query;
      
      if (!path || !query) {
        reply.status(400);
        return { error: 'Missing required query parameters: path, query' };
      }

      const results = await fsService.searchFiles(path, query);
      return { results };
    } catch (err) {
      logger.error('Failed to search files', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });

  // GET /api/fs/git-info - Check if path is git repo
  fastify.get('/git-info', async (request: FastifyRequest<{ Querystring: QueryPath }>, reply) => {
    try {
      const { path } = request.query;
      
      if (!path) {
        reply.status(400);
        return { error: 'Missing required query parameter: path' };
      }

      const gitInfo = await fsService.getGitInfo(path);
      return { gitInfo };
    } catch (err) {
      logger.error('Failed to get git info', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });
}
