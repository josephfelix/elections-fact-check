# Tasks

## 1 — Dependências e configuração

- [x] 1.1 Instalar `@google/adk` e confirmar que `zod` já é dependência direta — verificar: `npm install @google/adk` sem erros, `package.json` atualizado.
- [x] 1.2 Atualizar `server/src/config.ts`: substituir vars `OPENROUTER_*` por `GOOGLE_API_KEY` (string, default `''`) e `GEMINI_MODEL` (string, default `'gemini-3.5-flash-lite'`); remover `OPENROUTER_REASONING`, `OPENROUTER_WEB_MAX_RESULTS`, `OPENROUTER_WEB_ENGINE` — verificar: `npm run typecheck` sem erros.
- [x] 1.3 Atualizar `.env.example` e README refletindo as novas variáveis — verificar: documentação legível e coerente com `config.ts`.

## 2 — Adaptador `AdkGenerator`

- [x] 2.1 Criar `server/src/adk-generator.ts` implementando `TextGenerator`: usa `LlmAgent` + `Runner` com `InMemorySessionService`; sessão efêmera por chamada; suporte a `input: string | LlmPart[]` (converte `LlmPart` de áudio para `inlineData` Gemini) — verificar: `npm run typecheck` sem erros.
- [x] 2.2 Mapear `GenerateOptions.webSearch` para `GOOGLE_SEARCH` tool na `AdkGenerator` de forma opcional (só quando `webSearch: true`), expondo `Citation[]` a partir dos `groundingChunks` retornados — verificar: `npm run typecheck` sem erros.
- [x] 2.3 Adicionar `AdkGenerator.configured` (getter boolean: `apiKey.length > 0`) para compatibilidade com `AppDeps.configured` — verificar: `npm run typecheck` sem erros.

## 3 — Provider ADK com `GOOGLE_SEARCH`

- [x] 3.1 Criar `server/src/adk-fact-check-provider.ts` implementando `FactCheckProvider`: usa `LlmAgent` com `GOOGLE_SEARCH` tool, reutiliza `reconcileVerdict` de `web-search-provider.ts` sem modificá-la — verificar: `npm run typecheck` sem erros.
- [x] 3.2 Garantir que `AdkFactCheckProvider` mantém o mesmo cache TTL via `TtlCache` (importado de `cache.ts`) — verificar: `npm run typecheck` sem erros.

## 4 — Wiring em `index.ts`

- [x] 4.1 Atualizar `server/src/index.ts`: instanciar `AdkGenerator` com a config ADK; passar `AdkGenerator` para `LlmTranscriber`, `LlmTopicClassifier`, `LlmClaimExtractor`; instanciar `AdkFactCheckProvider` no lugar de `WebSearchProvider` — verificar: `npm run typecheck` sem erros; `npm test` passa (todos os testes usam mocks de `TextGenerator`).
- [x] 4.2 Confirmar que a mensagem de startup em `index.ts` reflete o novo provider (ex.: `ADK/Gemini configurado`) — verificar: comportamento visual no `npm start` local.

## 5 — Validação de integração

- [x] 5.1 Smoke test manual: iniciar o backend com `GOOGLE_API_KEY` real; chamar `/health` (deve retornar `ok: true`); chamar `/v1/transcribe` com áudio real; chamar `/v1/check` com uma afirmação — verificar: respostas coerentes, sem erros 5xx.
- [x] 5.2 Remover `server/src/openrouter.ts` após smoke test confirmado — verificar: `npm run typecheck` e `npm test` ainda passam sem o arquivo.
