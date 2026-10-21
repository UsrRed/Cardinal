import { ConfigError, loadConfig, type Config } from './config/index.js';

async function main(): Promise<void> {
  let config: Config;
  try {
    config = loadConfig(process.env);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error('Personnal Flux: configuration invalide: ' + e.issues.join('; '));
      process.exit(1);
    }
    throw e;
  }
  const { createDeps } = await import('./deps.js');
  const { buildApp } = await import('./app.js');
  const { Scheduler } = await import('./scheduler/index.js');
  const { acquireLock } = await import('./scheduler/lock.js');

  const deps = createDeps(config);
  const app = await buildApp(deps);
  const lock = acquireLock(config.dataDir);
  let scheduler: InstanceType<typeof Scheduler> | null = null;
  if (lock) {
    deps.queue.recover();
    scheduler = new Scheduler({
      feeds: deps.repos.feeds,
      runs: deps.repos.runs,
      queue: deps.queue,
      clock: deps.clock,
      tickMs: config.schedulerTickS * 1000,
      logger: deps.logger,
    });
    scheduler.start();
  } else {
    deps.logger.warn('another instance holds the scheduler lock; scheduler disabled');
  }

  const shutdown = async () => {
    scheduler?.stop();
    lock?.release();
    await app.close();
    deps.db.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown());
  process.on('SIGINT', () => void shutdown());

  await app.listen({ host: config.host, port: config.port });
}

void main();
