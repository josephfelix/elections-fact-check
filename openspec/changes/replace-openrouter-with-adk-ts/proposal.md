# Proposal

## Why

O backend usa OpenRouter como proxy para Gemini + busca web, mas o projeto quer adotar o **Google Agent Development Kit (ADK) para TypeScript** (`@google/adk`) — eliminando o intermediário e aprendendo a orquestração de agentes diretamente com o SDK oficial do Google.

## What Changes

- Adicionar dependência `@google/adk` e `zod` (peer dep do ADK) ao `package.json`.
- Criar `server/src/adk-generator.ts`: implementação de `TextGenerator` que usa `LlmAgent` do ADK com Gemini nativo.
- Criar `server/src/adk-fact-check-provider.ts`: implementação de `FactCheckProvider` que usa `LlmAgent` com a tool `GOOGLE_SEARCH` built-in do ADK (substitui o plugin web do OpenRouter).
- Atualizar `server/src/index.ts`: trocar `OpenRouterClient` pelas novas implementações ADK; atualizar variáveis de ambiente (`GOOGLE_API_KEY` / `GEMINI_MODEL` em vez de `OPENROUTER_*`).
- Atualizar `server/src/config.ts`: novas variáveis de configuração para ADK.
- Remover `server/src/openrouter.ts` após migração validada pelos testes existentes.

**O que NÃO muda:**
- `server/src/app.ts` (Fastify + endpoints) — inalterado.
- Todos os contratos HTTP com a extensão Chrome — inalterados.
- Interfaces `TextGenerator`, `FactCheckProvider`, `Transcriber`, `TopicClassifier`, `ClaimExtractor` — inalteradas.
- Nenhum arquivo do `src/` (extensão Chrome) é tocado.
- Nenhum teste novo é escrito; os existentes passam em verde como gate de cada passo.

## Capabilities

### New Capabilities

Nenhuma. Esta mudança não introduz comportamento observável novo para a extensão Chrome.

### Modified Capabilities

Nenhuma. As interfaces e os endpoints HTTP não mudam; apenas a implementação interna dos clientes LLM é trocada.

> Esta mudança é uma substituição de infraestrutura (refactor de implementação). Marcada com `skip_specs: true` no `.openspec.yaml` — nenhum requisito de spec muda.

## Impact

- **Dependências removidas**: `openrouter.ts` e todas as referências a `OPENROUTER_*` env vars.
- **Dependências adicionadas**: `@google/adk`, `zod` (se não já presente).
- **Variáveis de ambiente**: `OPENROUTER_API_KEY` + `OPENROUTER_MODEL` → `GOOGLE_API_KEY` + `GEMINI_MODEL` (atualizar `.env.example` e README).
- **Testes afetados**: `tests/provider.test.ts` — remover os testes do `OpenRouterClient` junto com a implementação removida; manter os testes existentes do `WebSearchProvider` e `reconcileVerdict`. Não adicionar testes nesta mudança.
- **Áudio**: `LlmTranscriber` usa `TextGenerator.generate()` com input de áudio; a nova implementação ADK precisa suportar `LlmPart` do tipo `audio`.
