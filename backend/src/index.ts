import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';
import { fileSystemRoutes } from './routes/filesystem.js';
import { gitRoutes } from './routes/git.js';
import { modelRoutes } from './routes/models.js';
import { websocketRoutes } from './routes/websocket.js';
import { terminalRoutes } from './routes/terminal.js';
import { updateRoutes } from './routes/updates.js';
import { WebSocketService } from './services/WebSocketService.js';
import { ProjectManager } from './managers/ProjectManager.js';
import { logger } from './utils/logger.js';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  // Initialize ProjectManager with existing pi sessions
  const projectManager = ProjectManager.getInstance();
  await projectManager.initialize();

  const fastify = Fastify({
    logger: false,
  });

  // Register CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Register WebSocket plugin
  await fastify.register(websocket);

  // Register routes
  await fastify.register(projectRoutes, { prefix: '/api/projects' });
  await fastify.register(sessionRoutes, { prefix: '/api/sessions' });
  await fastify.register(fileSystemRoutes, { prefix: '/api/fs' });
  await fastify.register(gitRoutes, { prefix: '/api/git' });
  await fastify.register(modelRoutes, { prefix: '/api/models' });
  await fastify.register(updateRoutes, { prefix: '/api/updates' });
  await fastify.register(websocketRoutes);
  await fastify.register(terminalRoutes);

  // Health check endpoint
  fastify.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Rescan pi sessions endpoint
  fastify.post('/api/rescan', async () => {
    await projectManager.initialize();
    return { success: true };
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Shutting down...');
    WebSocketService.getInstance().stop();
    await fastify.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Shutting down...');
    WebSocketService.getInstance().stop();
    await fastify.close();
    process.exit(0);
  });

  try {
    await fastify.listen({ port: PORT, host: HOST });
    logger.info(`Server listening on ${HOST}:${PORT}`);
  } catch (err) {
    logger.error('Failed to start server', { error: (err as Error).message });
    process.exit(1);
  }
}

main();
