import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CheckRequest } from '../src/shared/schemas';
import { AdkFactCheckProvider } from '../server/src/adk-fact-check-provider';
import { AdkGenerator } from '../server/src/adk-generator';
import { LlmError, type LlmOutput } from '../server/src/llm';
import { ProviderError } from '../server/src/web-search-provider';

const request: CheckRequest = {
  claim: 'A inflação caiu em 2023',
  context: '',
  topic: 'Economia',
};
const citation = { url: 'https://example.com/inflation', title: 'example.com' };
const verdict = JSON.stringify({
  verdict: 'supported',
  summary: 'A fonte sustenta a afirmação.',
  evidence: [{ source: 'example.com', quote: 'A inflação caiu no período.' }],
  limitations: [],
});

function setup() {
  const generator = new AdkGenerator({ apiKey: '', model: 'test-model', timeoutMs: 60_000 });
  const generate = vi.spyOn(generator, 'generate');
  const provider = new AdkFactCheckProvider(generator, 60_000, () => 100);
  return { generate, provider };
}

afterEach(() => vi.restoreAllMocks());

describe('AdkFactCheckProvider', () => {
  it('runs grounded research before verdict formatting and reconciles evidence to grounded citations', async () => {
    const { generate, provider } = setup();
    generate
      .mockResolvedValueOnce({ text: 'Pesquisa factual e grounded.', citations: [citation] })
      .mockResolvedValueOnce({ text: verdict, citations: [{ url: 'https://invented.example/', title: 'invented.example' }] });

    const result = await provider.check(request);

    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0]?.[0]).toMatchObject({ webSearch: true, temperature: 0, maxTokens: 2000 });
    expect(generate.mock.calls[1]?.[0]).toMatchObject({ temperature: 0, maxTokens: 2000 });
    expect(generate.mock.calls[1]?.[0].webSearch).toBeUndefined();
    expect(String(generate.mock.calls[1]?.[0].input)).toContain('Pesquisa factual e grounded.');
    expect(String(generate.mock.calls[1]?.[0].input)).toContain(citation.url);
    expect(result.status).toBe('supported');
    expect(result.evidence).toEqual([{
      url: citation.url,
      title: citation.title,
      snippet: 'A inflação caiu no período.',
    }]);
    expect(result.provider.id).toBe('adk-google-search');
  });

  it('returns cached insufficient when grounded research has no citations and skips verdict formatting', async () => {
    const { generate, provider } = setup();
    generate.mockResolvedValue({ text: 'No sources returned.', citations: [] });

    const first = await provider.check(request);
    const second = await provider.check(request);

    expect(first.status).toBe('insufficient');
    expect(second.fromCache).toBe(true);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('does not cache generator failures and propagates the provider error', async () => {
    const { generate, provider } = setup();
    generate
      .mockRejectedValueOnce(new LlmError('temporary failure', 'http'))
      .mockResolvedValueOnce({ text: 'No sources returned.', citations: [] } satisfies LlmOutput);

    await expect(provider.check(request)).rejects.toMatchObject({ kind: 'http' });
    const recovered = await provider.check(request);

    expect(recovered.status).toBe('insufficient');
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('reports malformed verdict output as a parse ProviderError', async () => {
    const { generate, provider } = setup();
    generate
      .mockResolvedValueOnce({ text: 'Research complete.', citations: [citation] })
      .mockResolvedValueOnce({ text: 'not JSON', citations: [] })
      .mockResolvedValueOnce({ text: 'Research complete.', citations: [citation] })
      .mockResolvedValueOnce({ text: verdict, citations: [] });

    await expect(provider.check(request)).rejects.toMatchObject({ kind: 'parse' });
    expect((await provider.check(request)).status).toBe('supported');
    expect(generate).toHaveBeenCalledTimes(4);
  });

  it('forwards the caller abort signal and propagates cancellation', async () => {
    const { generate, provider } = setup();
    const abortController = new AbortController();
    abortController.abort();
    const signal = abortController.signal;
    generate
      .mockResolvedValueOnce({ text: 'Research complete.', citations: [citation] })
      .mockRejectedValueOnce(new Error('caller aborted'));

    await expect(provider.check(request, signal)).rejects.toThrow('caller aborted');

    expect(generate.mock.calls[0]?.[0].signal).toBe(signal);
    expect(generate.mock.calls[1]?.[0].signal).toBe(signal);
    expect(generate.mock.calls[1]?.[0].signal?.aborted).toBe(true);
  });
});
