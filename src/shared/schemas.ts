import { z } from 'zod';
import type { Feed } from './types.js';

export type FeedInput = Omit<Feed, 'id' | 'createdAt' | 'updatedAt' | 'lastRunAt' | 'nextRunAt'>;

export const SECRET_NAMES = ['anthropicApiKey', 'nvdApiKey', 'ntfyToken'] as const;
export type SecretName = (typeof SECRET_NAMES)[number];

export const secretPutSchema = z.object({ value: z.string().min(1).max(512) });

const OSV_ECOSYSTEMS = ['PyPI', 'npm', 'Go', 'crates.io', 'Maven', 'NuGet', 'RubyGems', 'Packagist'] as const;

const httpUrl = z
  .string({ error: 'URL requise.' })
  .max(2048, { error: 'URL trop longue.' })
  .refine(
    (v) => {
      try {
        const u = new URL(v);
        return u.protocol === 'http:' || u.protocol === 'https:';
      } catch {
        return false;
      }
    },
    { error: 'URL http(s) valide requise.' },
  );

const rssParams = z.object({
  urls: z
    .array(httpUrl, { error: 'Liste d’URL requise.' })
    .min(1, { error: 'Au moins une URL est requise.' })
    .max(20, { error: '20 URL au maximum.' }),
});

const osvParams = z.object({
  packages: z
    .array(
      z.object({
        name: z.string({ error: 'Nom requis.' }).trim().min(1, { error: 'Nom du paquet requis.' }).max(200, { error: 'Nom trop long.' }),
        ecosystem: z.enum(OSV_ECOSYSTEMS, { error: 'Écosystème inconnu.' }),
      }),
      { error: 'Liste de paquets requise.' },
    )
    .min(1, { error: 'Au moins un paquet est requis.' })
    .max(50, { error: '50 paquets au maximum.' }),
});

const nvdParams = z.object({
  keywords: z
    .array(z.string().trim().min(1, { error: 'Mot-clé vide.' }).max(100, { error: 'Mot-clé trop long.' }), {
      error: 'Liste de mots-clés requise.',
    })
    .min(1, { error: 'Au moins un mot-clé est requis.' })
    .max(20, { error: '20 mots-clés au maximum.' }),
  minSeverity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], { error: 'Sévérité inconnue.' }).optional(),
});

const priority = z.enum(['high', 'medium', 'low'], { error: 'Priorité invalide.' });

const common = {
  name: z.string({ error: 'Nom requis.' }).trim().min(1, { error: 'Nom requis.' }).max(120, { error: '120 caractères maximum.' }),
  instructions: z
    .string({ error: 'Instructions requises.' })
    .trim()
    .min(1, { error: 'Instructions requises.' })
    .max(4000, { error: '4000 caractères maximum.' }),
  frequencyHours: z
    .number({ error: 'Nombre requis.' })
    .int({ error: 'Entier requis.' })
    .min(1, { error: 'Au moins 1 heure.' })
    .max(720, { error: '720 heures au maximum.' }),
  freshnessDays: z
    .number({ error: 'Nombre requis.' })
    .int({ error: 'Entier requis.' })
    .min(1, { error: 'Au moins 1 jour.' })
    .max(90, { error: '90 jours au maximum.' }),
  enabled: z.boolean().default(true),
  notify: z.boolean().default(false),
  notifyThreshold: priority.default('high'),
  ntfyServer: httpUrl.nullable().default(null),
  ntfyTopic: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/, { error: 'Topic invalide (lettres, chiffres, _ et -, 64 max).' })
    .nullable()
    .default(null),
  model: z
    .string()
    .regex(/^[a-z0-9.-]{1,64}$/, { error: 'Modèle invalide.' })
    .default('sonnet'),
  budgetUsd: z
    .number({ error: 'Nombre requis.' })
    .min(0.01, { error: 'Au moins 0,01 $.' })
    .max(50, { error: '50 $ au maximum.' })
    .default(1),
};

export const feedInputSchema = z.discriminatedUnion(
  'sourceType',
  [
    z.object({ ...common, sourceType: z.literal('rss'), sourceParams: rssParams }),
    z.object({ ...common, sourceType: z.literal('osv'), sourceParams: osvParams }),
    z.object({ ...common, sourceType: z.literal('nvd'), sourceParams: nvdParams }),
  ],
  { error: 'Type de source inconnu.' },
) as unknown as z.ZodType<FeedInput, unknown>;

export const feedPatchSchema = z
  .object({
    ...Object.fromEntries(Object.entries(common).map(([k, v]) => [k, (v as z.ZodType).optional()])),
    sourceType: z.enum(['rss', 'osv', 'nvd'], { error: 'Type de source inconnu.' }).optional(),
    sourceParams: z.unknown().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.sourceType === undefined) {
      if (v.sourceParams !== undefined) ctx.addIssue({ code: 'custom', path: ['sourceType'], message: 'Type de source requis avec les paramètres.' });
      return;
    }
    if (v.sourceParams === undefined) {
      ctx.addIssue({ code: 'custom', path: ['sourceParams'], message: 'Paramètres de source requis.' });
      return;
    }
    const schema = { rss: rssParams, osv: osvParams, nvd: nvdParams }[v.sourceType];
    const r = schema.safeParse(v.sourceParams);
    if (!r.success) {
      for (const i of r.error.issues) ctx.addIssue({ code: 'custom', path: ['sourceParams', ...i.path], message: i.message });
    }
  });

export const feedExportSchema = z.object({
  version: z.literal(1, { error: 'Version d’export non supportée.' }),
  exportedAt: z.string(),
  feeds: z.array(feedInputSchema, { error: 'Liste de flux requise.' }).max(500, { error: 'Trop de flux.' }),
});

function isIana(tz: string): boolean {
  try {
    return (Intl.supportedValuesOf('timeZone') as string[]).includes(tz) || tz === 'UTC';
  } catch {
    return false;
  }
}

export const settingsPatchSchema = z
  .object({
    ntfyServer: httpUrl,
    ntfyTopic: z.string().regex(/^([A-Za-z0-9_-]{1,64})?$/, { error: 'Topic invalide.' }),
    publicUrl: z.union([z.literal(''), httpUrl]),
    timezone: z.string().refine(isIana, { error: 'Fuseau horaire IANA inconnu.' }),
    maxConcurrentRuns: z.number().int({ error: 'Entier requis.' }).min(1, { error: 'Au moins 1.' }).max(8, { error: '8 au maximum.' }),
    retentionDays: z.number().int({ error: 'Entier requis.' }).min(0, { error: '0 ou plus.' }).max(3650, { error: '3650 au maximum.' }),
  })
  .partial();

/** Flattens zod issues to { "path.dot": "message" } for 400 validation_error. */
export function zodFields(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join('.') || '_';
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}
