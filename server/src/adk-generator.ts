import { Gemini, GOOGLE_SEARCH, InMemorySessionService, LlmAgent, Runner, isFinalResponse, stringifyContent } from '@google/adk';
import type { Content } from '@google/genai';
import { randomUUID } from 'node:crypto';
import { LlmError, type Citation, type GenerateOptions, type LlmOutput, type LlmPart, type TextGenerator } from './llm';

const AUDIO_MIME: Record<string, string> = {
  wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg',
  flac: 'audio/flac', aac: 'audio/aac', m4a: 'audio/mp4', aiff: 'audio/aiff',
};

function safeErrorDetail(value: unknown, secret: string): string {
  const message = value instanceof Error ? value.message : String(value);
  return message
    .replaceAll(secret, '[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export interface AdkGeneratorConfig {
  apiKey: string;
  model: string;
  timeoutMs: number;
}

export class AdkGenerator implements TextGenerator {
  private readonly sessionService = new InMemorySessionService();

  constructor(private readonly cfg: AdkGeneratorConfig) {}

  get configured(): boolean {
    return this.cfg.apiKey.length > 0;
  }

  async generate(opts: GenerateOptions): Promise<LlmOutput> {
    if (!this.configured) throw new LlmError('GOOGLE_API_KEY não configurada no backend', 'config');

    const gemini = new Gemini({ model: this.cfg.model, apiKey: this.cfg.apiKey });
    const tools = opts.webSearch ? [GOOGLE_SEARCH] : [];
    const agent = new LlmAgent({
      name: 'adk-gen',
      model: gemini,
      instruction: opts.system ?? '',
      tools,
      generateContentConfig: {
        temperature: opts.temperature ?? 0,
        maxOutputTokens: opts.maxTokens,
      },
    });

    const appName = 'factcheck-live';
    const userId = 'backend';
    const sessionId = randomUUID();

    const runner = new Runner({ appName, agent, sessionService: this.sessionService });

    const parts: Content['parts'] = typeof opts.input === 'string'
      ? [{ text: opts.input }]
      : opts.input.map((p: LlmPart) =>
          p.type === 'text'
            ? { text: p.text }
            : { inlineData: { data: p.data, mimeType: AUDIO_MIME[p.format] ?? `audio/${p.format}` } }
        );

    const newMessage: Content = { role: 'user', parts };

    const timeout = AbortSignal.timeout(this.cfg.timeoutMs);
    const abortSignal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

    let text = '';
    const citations: Citation[] = [];

    try {
      await this.sessionService.createSession({ appName, userId, sessionId });
      for await (const event of runner.runAsync({ userId, sessionId, newMessage, abortSignal })) {
        if (event.errorCode) {
          const detail = safeErrorDetail(event.errorMessage ?? event.errorCode, this.cfg.apiKey);
          const status = Number(event.errorCode);
          throw new LlmError(
            `ADK/Gemini retornou ${event.errorCode}${detail ? `: ${detail}` : ''}`,
            'http',
            Number.isInteger(status) ? status : undefined,
          );
        }
        if (!isFinalResponse(event)) continue;
        text = stringifyContent(event);
        for (const chunk of event.groundingMetadata?.groundingChunks ?? []) {
          const web = chunk.web;
          if (!web?.uri) continue;
          citations.push({ url: web.uri, title: web.title ?? web.uri });
        }
      }
    } catch (e) {
      if (timeout.aborted) throw new LlmError('Tempo esgotado ao consultar o ADK/Gemini', 'timeout');
      if (opts.signal?.aborted) throw e;
      if (e instanceof LlmError) throw e;
      const detail = safeErrorDetail(e, this.cfg.apiKey);
      throw new LlmError(`Erro ao consultar o ADK/Gemini${detail ? `: ${detail}` : ''}`, 'http');
    } finally {
      await this.sessionService.deleteSession({ appName, userId, sessionId });
    }

    if (!text.trim()) throw new LlmError('Resposta vazia do ADK/Gemini', 'parse');
    return { text, citations };
  }
}
