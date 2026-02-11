import type { FastifyInstance } from 'fastify';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

interface PackageUpdate {
  name: string;
  currentVersion: string | null;
  latestVersion: string | null;
  hasUpdate: boolean;
}

const PACKAGE_NAMES = ['@mariozechner/pi-coding-agent', '@mariozechner/pi-ai'];

function getInstalledVersion(packageName: string): string | null {
  try {
    const pkg = require(`${packageName}/package.json`) as { version?: string };
    return pkg.version || null;
  } catch {
    return null;
  }
}

async function getLatestVersion(packageName: string): Promise<string | null> {
  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`);
    if (!response.ok) {
      return null;
    }
    const data = await response.json() as { 'dist-tags'?: { latest?: string } };
    return data['dist-tags']?.latest || null;
  } catch {
    return null;
  }
}

export async function updateRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/', async () => {
    const updates: PackageUpdate[] = [];

    for (const packageName of PACKAGE_NAMES) {
      const currentVersion = getInstalledVersion(packageName);
      const latestVersion = await getLatestVersion(packageName);
      updates.push({
        name: packageName,
        currentVersion,
        latestVersion,
        hasUpdate: Boolean(currentVersion && latestVersion && currentVersion !== latestVersion),
      });
    }

    return {
      packages: updates,
      checkedAt: new Date().toISOString(),
    };
  });
}
