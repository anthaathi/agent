import type { FastifyInstance } from 'fastify';
import { AuthStorage, ModelRegistry } from '@mariozechner/pi-coding-agent';
import { logger } from '../utils/logger.js';

const authStorage = new AuthStorage();
const modelRegistry = new ModelRegistry(authStorage);

export async function modelRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async (_request, reply) => {
    try {
      modelRegistry.refresh();
      const models = await modelRegistry.getAvailable();
      return { models };
    } catch (err) {
      logger.error('Failed to get models', { error: (err as Error).message });
      reply.status(500);
      return { error: (err as Error).message };
    }
  });
}
