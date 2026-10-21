import { z } from 'zod';
import type { Feed } from './types.js';

export type FeedInput = Omit<Feed, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt'>;

export const SECRET_NAMES = ['anthropicApiKey', 'nvdApiKey', 'ntfyToken'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export const secretPutSchema = z.object({ value: z.string().min(1).max(512) });

// TODO: feedInputSchema, feedPatchSchema, feedExportSchema, settingsPatchSchema (cf. docs/INTERFACES.md §2)
