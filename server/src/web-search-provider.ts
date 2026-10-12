import { z } from 'zod';
import type { CheckRequest, CheckResult, CheckStatus, Evidence } from '../../src/shared/schemas';
import { buildContextualQuery } from '../../src/shared/aimode';
import { normalizeText } from '../../src/shared/text';
import { extractJson, LlmError, type Citation, type TextGenerator } from './llm';
import { SECURITY_RULES } from './prompts';
import { TtlCache } from './cache';

export interface FactCheckProvider {
  readonly id: string;
  readonly name: string;
  check(req: CheckRequest, signal?: AbortSignal): Promise<CheckResult>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly kind: 'parse' | 'timeout' | 'http' | 'config' | 'aborted') {
    super(message);
  }
}

const SYSTEM = `Você é um verificador de fatos. Use a busca na web para checar a afirmação em <afirmacao>, considerando <contexto>.
Critérios:
- "supported": fontes confiáveis sustentam a afirmação;
- "contradicted": fontes confiáveis relevantes a contradizem;
- "partial": é parcialmente correta, imprecisa ou enganosa (explique o que falta);
- "insufficient": não encontrou evidência suficiente. Ausência de resultado NÃO é contradição.
Nunca invente fontes, números ou datas. Cite apenas o que a pesquisa retornou.
Responda SOMENTE com JSON: {"verdict":"supported|contradicted|partial|insufficient","summary":"2-3 frases em português","dataDate":"data ou período dos dados, se houver","evidence":[{"source":"domínio da fonte","quote":"trecho curto da fonte"}],"limitations":["..."]}
${SECURITY_RULES}`;

const RawVerdict = z.object({
  verdict: z.enum(['supported', 'contradicted', 'partial', 'insufficient']),
  summary: z.string().min(1).max(1500),
  dataDate: z.string().max(120).optional(),
  evidence: z.array(z.object({ source: z.string().default(''), quote: z.string().max(600).default('') })).default([]),
  limitations: z.array(z.string().max(300)).default([]),
});
export type RawVerdict = z.infer<typeof RawVerdict>;

const domainOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

/**
 * Regras de reconciliação (puras e testáveis):
 * - Evidências vêm SOMENTE das citações retornadas pela pesquisa, nunca de URLs ditas pelo modelo.
 * - Sem nenhuma citação, um veredito de sustentação/contradição é rebaixado para "insufficient".
 */
export function reconcileVerdict(raw: RawVerdict, citations: Citation[]): Pick<CheckResult, 'status' | 'summary' | 'evidence' | 'dataDate' | 'limitations'> {
  const seen = new Set<string>();
  const evidence: Evidence[] = [];
  for (const c of citations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    if (!/^https?:\/\//i.test(c.url)) continue;
    const dom = normalizeText(c.title);
    const quote = raw.evidence.find((e) => e.quote && e.source && (dom.includes(normalizeText(e.source)) || normalizeText(e.source).includes(dom)));
    evidence.push({ url: c.url, title: c.title || domainOf(c.url), snippet: quote?.quote });
  }
  const limitations = [...raw.limitations];
  let status: CheckStatus = raw.verdict;
  if (evidence.length === 0 && status !== 'insufficient') {
    status = 'insufficient';
    limitations.push('O modelo emitiu um veredito, mas a pesquisa não retornou fontes citáveis; o resultado foi rebaixado para "insuficiente".');
  } else if (evidence.length === 1 && status !== 'insufficient') {
    limitations.push('Apenas uma fonte foi citada; considere confirmar em outras.');
  }
  return { status, summary: raw.summary, evidence, dataDate: raw.dataDate || undefined, limitations };
}

export class WebSearchProvider implements FactCheckProvider {
  readonly id = 'web-search';
  readonly name = 'Gemini com busca web (não é o Google AI Mode)';
  private cache: TtlCache<CheckResult>;

  constructor(private gen: TextGenerator, cacheTtlMs: number, private now: () => number = Date.now) {
    this.cache = new TtlCache(cacheTtlMs, 500, now);
  }

  async check(req: CheckRequest, signal?: AbortSignal): Promise<CheckResult> {
    const key = normalizeText(`${req.claim}|${req.period ?? ''}|${req.region ?? ''}`);
    const hit = this.cache.get(key);
    if (hit) return { ...hit, fromCache: true };

    const query = buildContextualQuery({ text: req.claim, context: req.context, topic: req.topic, period: req.period, region: req.region });
    const input = `<afirmacao>${req.claim.replace(/[<>]/g, ' ')}</afirmacao>\n<contexto>${[req.topic, req.period, req.region, req.context].filter(Boolean).join(' | ').replace(/[<>]/g, ' ').slice(0, 1200)}</contexto>`;
    let out;
    try {
      out = await this.gen.generate({ system: SYSTEM, input, webSearch: true, temperature: 0, maxTokens: 2000, reasoning: 'low', signal });
    } catch (e) {
      if (e instanceof LlmError) throw new ProviderError(e.message, e.kind);
      throw e;
    }
    let raw: RawVerdict;
    try {
      raw = RawVerdict.parse(extractJson(out.text));
    } catch {
      throw new ProviderError('Não foi possível interpretar a resposta do verificador', 'parse');
    }
    const result: CheckResult = {
      ...reconcileVerdict(raw, out.citations),
      provider: { id: this.id, name: this.name },
      query,
      checkedAt: this.now(),
    };
    this.cache.set(key, result);
    return result;
  }
}
