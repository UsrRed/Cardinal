import { ConfigError, loadConfig } from './config/index.js';

async function main(): Promise<void> {
  try {
    loadConfig(process.env);
  } catch (e) {
    if (e instanceof ConfigError) {
      console.error('Personnal Flux: configuration invalide: ' + e.issues.join('; '));
      process.exit(1);
    }
    throw e;
  }
  // TODO: openDb → migrate → seed → buildApp → lock+scheduler → listen
}

void main();
