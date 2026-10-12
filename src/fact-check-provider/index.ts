import { backendRequest, type BackendOptions } from '../shared/backend';
import { CheckResponse, type CheckRequest, type CheckResult } from '../shared/schemas';
import { buildAiModeUrl, buildContextualQuery } from '../shared/aimode';

/**
 * Mecanismo de pesquisa e verificação. Substituível sem alterar a extensão.
 * Ordem de preferência (ver docs/google-integration.md):
 *  1. Integração oficial com o Google AI Mode — NÃO EXISTE API pública; não implementada.
 *  2. Alternativa oficial do Google: Gemini API + Grounding with Google Search (BackendWebSearchProvider).
 *  3. Consulta manual no Google AI Mode (ManualAiModeProvider).
 */
export interface FactCheckProvider {
  readonly id: string;
  readonly name: string;
  check(req: CheckRequest, signal?: AbortSignal): Promise<CheckResult>;
}

export class BackendWebSearchProvider implements FactCheckProvider {
  readonly id = 'gemini-grounded-web-search';
  readonly name = 'Gemini + Grounding with Google Search (não é o Google AI Mode)';
  constructor(private backend: BackendOptions) {}

  async check(req: CheckRequest, signal?: AbortSignal): Promise<CheckResult> {
    const r = await backendRequest(this.backend, '/v1/check', { body: JSON.stringify(req), contentType: 'application/json', signal, timeoutMs: 60_000 }, CheckResponse);
    return r.result;
  }
}

/** Não pesquisa nada: apenas sinaliza que a checagem deve ser feita pelo usuário no AI Mode. */
export class ManualAiModeProvider implements FactCheckProvider {
  readonly id = 'manual-google-ai-mode';
  readonly name = 'Google AI Mode (consulta manual)';

  async check(req: CheckRequest): Promise<CheckResult> {
    const query = buildContextualQuery({ text: req.claim, context: req.context, topic: req.topic, period: req.period, region: req.region });
    return {
      status: 'manual',
      summary: 'Nenhuma verificação automática foi feita. Abra o Google AI Mode para consultar esta afirmação; a resposta dele não é lida pela extensão.',
      evidence: [],
      limitations: ['Resultado disponível apenas na interface do Google, sem captura pela extensão.'],
      provider: { id: this.id, name: this.name },
      query,
      checkedAt: Date.now(),
    };
  }
}

export { buildAiModeUrl };
