import { loadConfig } from './config';
import { AdkGenerator } from './adk-generator';
import { LlmTranscriber } from './transcriber';
import { LlmTopicClassifier } from './topic-classifier';
import { LlmClaimExtractor } from './claim-extractor';
import { AdkFactCheckProvider } from './adk-fact-check-provider';
import { buildApp } from './app';

const cfg = loadConfig();
const adk = new AdkGenerator({
  apiKey: cfg.GOOGLE_API_KEY,
  model: cfg.GEMINI_MODEL,
  timeoutMs: cfg.REQUEST_TIMEOUT_MS,
});

const app = buildApp({
  token: cfg.BACKEND_TOKEN,
  model: cfg.GEMINI_MODEL,
  configured: adk.configured,
  transcriber: new LlmTranscriber(adk),
  classifier: new LlmTopicClassifier(adk),
  extractor: new LlmClaimExtractor(adk),
  provider: new AdkFactCheckProvider(adk, cfg.CHECK_CACHE_TTL_S * 1000),
});

app.listen({ host: cfg.HOST, port: cfg.PORT }).then(() => {
  console.log(`FactCheck Live backend em http://${cfg.HOST}:${cfg.PORT} (ADK/Gemini ${adk.configured ? 'configurado' : 'NÃO configurado'}, modelo ${cfg.GEMINI_MODEL})`);
});
