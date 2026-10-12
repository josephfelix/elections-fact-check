import { z } from 'zod';

const Env = z.object({
  GOOGLE_API_KEY: z.string().default(''),
  GEMINI_MODEL: z.string().default('gemini-3.5-flash-lite'),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().default(8787),
  BACKEND_TOKEN: z.string().default(''),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().default(60000),
  CHECK_CACHE_TTL_S: z.coerce.number().int().default(21600),
});

export type Config = z.infer<typeof Env>;
export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => Env.parse(env);
