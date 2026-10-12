import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdkGenerator } from '../server/src/adk-generator';
import { LlmError } from '../server/src/llm';

const adk = vi.hoisted(() => ({
  googleSearch: { name: 'google-search' },
  sessionService: {
    createSession: vi.fn(),
    deleteSession: vi.fn(),
  },
  Gemini: vi.fn(),
  LlmAgent: vi.fn(),
  Runner: vi.fn(),
  isFinalResponse: vi.fn(),
  stringifyContent: vi.fn(),
  runAsync: vi.fn(),
}));

vi.mock('@google/adk', () => ({
  Gemini: adk.Gemini,
  GOOGLE_SEARCH: adk.googleSearch,
  InMemorySessionService: class {
    createSession = adk.sessionService.createSession;
    deleteSession = adk.sessionService.deleteSession;
  },
  LlmAgent: adk.LlmAgent,
  Runner: adk.Runner,
  isFinalResponse: adk.isFinalResponse,
  stringifyContent: adk.stringifyContent,
}));

const config = { apiKey: 'unit-test-placeholder', model: 'test-model', timeoutMs: 60_000 };

describe('AdkGenerator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    adk.sessionService.createSession.mockResolvedValue({});
    adk.sessionService.deleteSession.mockResolvedValue({});
    adk.Runner.mockImplementation(function () {
      return { runAsync: adk.runAsync };
    });
    adk.isFinalResponse.mockImplementation((event: { final?: boolean }) => event.final === true);
    adk.stringifyContent.mockImplementation((event: { text?: string }) => event.text ?? '');
    adk.runAsync.mockImplementation(async function* () {
      yield { final: true, text: 'generated text' };
    });
  });

  it('maps generation configuration and only enables Google Search when requested', async () => {
    const generator = new AdkGenerator(config);

    await generator.generate({ input: 'plain input', temperature: 0.2, maxTokens: 400 });
    expect(adk.Gemini).toHaveBeenCalledWith({ model: 'test-model', apiKey: config.apiKey });
    expect(adk.LlmAgent).toHaveBeenCalledWith(expect.objectContaining({
      instruction: '',
      tools: [],
      generateContentConfig: { temperature: 0.2, maxOutputTokens: 400 },
    }));

    adk.LlmAgent.mockClear();
    await generator.generate({ input: 'search input', system: 'instructions', webSearch: true });
    expect(adk.LlmAgent).toHaveBeenCalledWith(expect.objectContaining({
      instruction: 'instructions',
      tools: [adk.googleSearch],
    }));
  });

  it('maps text and audio parts and returns citations from final grounded metadata', async () => {
    adk.runAsync.mockImplementationOnce(async function* () {
      yield { final: false, text: 'intermediate' };
      yield {
        final: true,
        text: 'grounded response',
        groundingMetadata: {
          groundingChunks: [
            { web: { uri: 'https://example.com/source', title: 'Example' } },
            { web: { title: 'No URL' } },
          ],
        },
      };
    });

    const generator = new AdkGenerator(config);
    const result = await generator.generate({
      input: [
        { type: 'text', text: 'transcribe this' },
        { type: 'audio', data: 'cmlmZg==', format: 'wav' },
      ],
      webSearch: true,
    });

    expect(adk.Runner).toHaveBeenCalledWith(expect.objectContaining({
      sessionService: expect.objectContaining({
        createSession: adk.sessionService.createSession,
        deleteSession: adk.sessionService.deleteSession,
      }),
    }));
    const runnerOptions = adk.runAsync.mock.calls[0]?.[0] as { newMessage: { parts: unknown[] } };
    expect(runnerOptions.newMessage.parts).toEqual([
      { text: 'transcribe this' },
      { inlineData: { data: 'cmlmZg==', mimeType: 'audio/wav' } },
    ]);
    expect(result).toEqual({
      text: 'grounded response',
      citations: [{ url: 'https://example.com/source', title: 'Example' }],
    });
    expect(adk.stringifyContent).toHaveBeenCalledTimes(1);
    expect(adk.sessionService.createSession).toHaveBeenCalledTimes(1);
    expect(adk.sessionService.deleteSession).toHaveBeenCalledTimes(1);
  });

  it('maps ADK error events to LlmError without exposing the configured key', async () => {
    adk.runAsync.mockImplementationOnce(async function* () {
      yield { errorCode: '429', errorMessage: 'Rejected unit-test-placeholder' };
    });
    const generator = new AdkGenerator(config);
    const result = generator.generate({ input: 'input' }).catch((error: unknown) => error);
    const error = await result;

    expect(error).toBeInstanceOf(LlmError);
    expect(error).toMatchObject({ kind: 'http', status: 429 });
    expect((error as Error).message).not.toContain(config.apiKey);
    expect(adk.sessionService.deleteSession).toHaveBeenCalled();
  });

  it('reports an empty final response as a parse error and deletes the session', async () => {
    adk.stringifyContent.mockReturnValueOnce('   ');
    const generator = new AdkGenerator(config);

    await expect(generator.generate({ input: 'input' })).rejects.toMatchObject({ kind: 'parse' });
    expect(adk.sessionService.deleteSession).toHaveBeenCalledTimes(1);
  });

  it('reports configured timeout and cleans up the temporary session', async () => {
    adk.runAsync.mockImplementationOnce(async function* ({ abortSignal }: { abortSignal: AbortSignal }) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      if (abortSignal.aborted) throw new Error('aborted');
      yield { final: true, text: 'late response' };
    });
    const generator = new AdkGenerator({ ...config, timeoutMs: 1 });

    await expect(generator.generate({ input: 'input' })).rejects.toMatchObject({ kind: 'timeout' });
    expect(adk.sessionService.deleteSession).toHaveBeenCalledTimes(1);
  });

  it('preserves caller abort rejection and deletes the temporary session', async () => {
    const abortError = new Error('caller aborted');
    adk.runAsync.mockImplementationOnce(async function* ({ abortSignal }: { abortSignal: AbortSignal }) {
      if (abortSignal.aborted) throw abortError;
      yield { final: true, text: 'unexpected response' };
    });
    const abortController = new AbortController();
    abortController.abort();
    const generator = new AdkGenerator(config);

    await expect(generator.generate({ input: 'input', signal: abortController.signal })).rejects.toBe(abortError);
    expect(adk.sessionService.deleteSession).toHaveBeenCalledTimes(1);
  });
});
