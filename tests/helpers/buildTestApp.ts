import { loadConfig, type Config } from '../../src/config/index.js';
import { buildApp } from '../../src/app.js';
import { createDeps, type AppDeps } from '../../src/deps.js';
import { createLogger } from '../../src/log/logger.js';
import { tmpDataDir } from './tmpDataDir.js';

export async function buildTestApp(env: Record<string, string> = {}) {
  const { dir, cleanup } = tmpDataDir();
  const config: Config = loadConfig(
    { PFLUX_DATA_DIR: dir, PFLUX_CLAUDE_RUNNER: 'fake', ...env } as NodeJS.ProcessEnv,
    { inContainer: false },
  );
  const logger = createLogger('silent');
  const deps: AppDeps = createDeps(config, { logger });
  const app = await buildApp(deps);
  return {
    app,
    deps,
    dir,
    close: async () => {
      await app.close();
      deps.db.close();
      cleanup();
    },
  };
}
