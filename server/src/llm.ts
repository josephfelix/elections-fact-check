/** Tipos e utilidades comuns a qualquer cliente de LLM usado pelo backend. */
export class LlmError extends Error {
  constructor(message: string, readonly kind: 'http' | 'parse' | 'timeout' | 'config', readonly status?: number) {
    super(message);
  }
}

export interface Citation {
  url: string;
  title: string;
  startIndex?: number;
  endIndex?: number;
}

export interface LlmOutput {
  text: string;
  citations: Citation[];
}

export type LlmPart = { type: 'text'; text: string } | { type: 'audio'; data: string; format: string };

export interface GenerateOptions {
  system?: string;
  input: string | LlmPart[];
  /** Habilita busca na web no provedor de geração configurado. */
  webSearch?: boolean;
  /** Teto de tokens de saída (inclui raciocínio, nos modelos que o têm). Evita custo descontrolado. */
  maxTokens?: number;
  /** Esforço de raciocínio. Tarefas mecânicas (transcrever, extrair JSON) não precisam de "pensar". */
  reasoning?: 'minimal' | 'low'| 'medium';
  temperature?: number;
  signal?: AbortSignal;
}

export interface TextGenerator {
  generate(opts: GenerateOptions): Promise<LlmOutput>;
}

/** Extrai o primeiro objeto JSON de um texto (tolera cercas ```json). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) throw new LlmError('Resposta sem JSON', 'parse');
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    throw new LlmError('JSON inválido na resposta do modelo', 'parse');
  }
}
