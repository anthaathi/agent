import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { ProjectManager } from '../managers/ProjectManager.js';
import { logger } from '../utils/logger.js';

interface CreateProjectBody {
  name: string;
  path: string;
}

interface UpdateProjectBody {
  name?: string;
  path?: string;
}

interface ProjectParams {
  id: string;
}

interface SessionsQuery {
  limit?: string;
  offset?: string;
}

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  const projectManager = ProjectManager.getInstance();

  // GET /api/projects - List all projects
  fastify.get('/', async (_request, reply) => {
    try {
      const projects = projectManager.getAllProjects();
      return { projects };
    } catch (err) {
      logger.error('Failed to list projects', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to list projects' };
    }
  });

  // POST /api/projects - Create project
  fastify.post('/', async (request: FastifyRequest<{ Body: CreateProjectBody }>, reply) => {
    try {
      const { name, path } = request.body;
      
      if (!name || !path) {
        reply.status(400);
        return { error: 'Missing required fields: name, path' };
      }

      const project = projectManager.createProject(name, path);
      reply.status(201);
      return { project };
    } catch (err) {
      logger.error('Failed to create project', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to create project' };
    }
  });

  // GET /api/projects/:id - Get project
  fastify.get('/:id', async (request: FastifyRequest<{ Params: ProjectParams }>, reply) => {
    try {
      const { id } = request.params;
      const project = projectManager.getProject(id);
      
      if (!project) {
        reply.status(404);
        return { error: 'Project not found' };
      }

      return { project };
    } catch (err) {
      logger.error('Failed to get project', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to get project' };
    }
  });

  // PATCH /api/projects/:id - Update project
  fastify.patch('/:id', async (request: FastifyRequest<{ Params: ProjectParams; Body: UpdateProjectBody }>, reply) => {
    try {
      const { id } = request.params;
      const updates = request.body;
      
      const project = projectManager.updateProject(id, updates);
      return { project };
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        reply.status(404);
        return { error: 'Project not found' };
      }
      logger.error('Failed to update project', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to update project' };
    }
  });

  // DELETE /api/projects/:id - Delete project
  fastify.delete('/:id', async (request: FastifyRequest<{ Params: ProjectParams }>, reply) => {
    try {
      const { id } = request.params;
      await projectManager.deleteProject(id);
      reply.status(204);
    } catch (err) {
      if ((err as Error).message.includes('not found')) {
        reply.status(404);
        return { error: 'Project not found' };
      }
      logger.error('Failed to delete project', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to delete project' };
    }
  });

  // GET /api/projects/:id/sessions - List project sessions (lazy loaded with pagination)
  fastify.get('/:id/sessions', async (request: FastifyRequest<{ Params: ProjectParams; Querystring: SessionsQuery }>, reply) => {
    try {
      const { id } = request.params;
      const project = projectManager.getProject(id);
      
      if (!project) {
        reply.status(404);
        return { error: 'Project not found' };
      }

      // Parse pagination params
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 100);
      const offset = parseInt(request.query.offset || '0', 10);

      // Lazy load sessions for this project with pagination
      const result = await projectManager.loadProjectSessionsPaginated(id, limit, offset);
      return result;
    } catch (err) {
      logger.error('Failed to list project sessions', { error: (err as Error).message });
      reply.status(500);
      return { error: 'Failed to list project sessions' };
    }
  });
}
