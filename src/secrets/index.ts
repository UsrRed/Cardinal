import type { SecretName } from '../shared/schemas.js';
import type { SecretState } from '../shared/types.js';

export class SecretsStore {
  constructor(_o: { dataDir: string; env: Partial<Record<SecretName, string | null>> }) {}
  get(_name: SecretName): string | null {
    throw new Error('not implemented');
  }
  state(_name: SecretName): SecretState {
    throw new Error('not implemented');
  }
  set(_name: SecretName, _value: string): void {
    throw new Error('not implemented');
  }
  clear(_name: SecretName): void {
    throw new Error('not implemented');
  }
}
