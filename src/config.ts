import 'dotenv/config';

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return n;
}

export const config = {
  port: int('PORT', 3000),
  host: process.env['HOST'] ?? '127.0.0.1',
  /** Canonical public URI of this server. Required later by OAuth 2.1 resource indicators. */
  publicUrl: process.env['PUBLIC_URL'] ?? `http://127.0.0.1:${int('PORT', 3000)}`,
  /** Where household state is persisted. */
  statePath: process.env['STATE_PATH'] ?? '.state/households.json',
  /** Language backend: "echo" for local development, "bedrock" once model access lands. */
  languageProvider: process.env['LANGUAGE_PROVIDER'] ?? 'echo',
  /** OAuth 2.1 is on unless explicitly disabled for local iteration. */
  authEnabled: (process.env['AUTH_ENABLED'] ?? 'true') !== 'false',
  /** Translation cache file. Empty disables persistence; the cache stays in memory. */
  translationCachePath: process.env['TRANSLATION_CACHE_PATH'] ?? '.state/translations.json',
  awsRegion: process.env['AWS_REGION'] ?? 'us-west-2',
  /**
   * Bedrock model id. On-demand throughput requires an **inference profile**, so the
   * id needs a `us.` or `global.` prefix — a bare `anthropic.claude-opus-5` is
   * rejected with "Invocation ... with on-demand throughput isn't supported".
   */
  bedrockModelId: process.env['BEDROCK_MODEL_ID'] ?? 'us.anthropic.claude-opus-5',
  awsProfile: process.env['AWS_PROFILE'],
} as const;
