import 'dotenv/config';

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export interface AppConfig {
  port: number;
  host: string;
  difyApiKey: string;
  difyApiBaseUrl: string;
  difyTimeoutMs: number;
  trialActionLimit: number;
  trialTimeLimitMs: number;
  dataDirectory: string;
}

export function getConfig(): AppConfig {
  const apiBase = process.env.DIFY_API_BASE_URL || 'https://api.dify.ai/v1';
  let parsedBase: URL;
  try {
    parsedBase = new URL(apiBase);
  } catch {
    throw new Error('DIFY_API_BASE_URL must be an absolute URL.');
  }
  const isLocalHttp = parsedBase.protocol === 'http:' &&
    (parsedBase.hostname === 'localhost' || parsedBase.hostname === '127.0.0.1');
  if (
    (parsedBase.protocol !== 'https:' && !isLocalHttp) ||
    parsedBase.username ||
    parsedBase.password
  ) {
    throw new Error('DIFY_API_BASE_URL must use HTTPS, except for localhost testing, and contain no credentials.');
  }

  return {
    port: readPositiveInteger(process.env.PORT, 3001),
    host: process.env.HOST || '127.0.0.1',
    difyApiKey: process.env.DIFY_API_KEY?.trim() ?? '',
    difyApiBaseUrl: parsedBase.toString().replace(/\/+$/, ''),
    difyTimeoutMs: readPositiveInteger(process.env.DIFY_TIMEOUT_MS, 45_000),
    trialActionLimit: readPositiveInteger(process.env.TRIAL_ACTION_LIMIT, 12),
    trialTimeLimitMs: readPositiveInteger(process.env.TRIAL_TIME_LIMIT_MS, 180_000),
    dataDirectory: process.env.LABYRINTH_DATA_DIR || 'data',
  };
}
