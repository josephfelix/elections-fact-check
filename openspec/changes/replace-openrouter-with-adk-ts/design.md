# Design

## Context

Ver `proposal.md - Why` para motivação. O ponto de partida técnico relevante:

- `server/src/index.ts` instancia `OpenRouterClient` e o injeta em todos os módulos via a interface `TextGenerator`.
- `WebSearchProvider` recebe um `TextGenerator` e chama `generate({ webSearch: true })` — o flag `webSearch` é interpretado pelo `OpenRouterClient` como o plugin `web` do OpenRouter.
- O ADK TypeScript (`@google/adk`) não implementa `TextGenerator`; precisamos de um adaptador.

## Goals / Non-Goals

**Goals:**
- Substituir `OpenRouterClient` por um adaptador ADK que satisfaça a interface `TextGenerator` existente.
- Substituir `WebSearchProvider` por uma implementação ADK que use `GOOGLE_SEARCH` built-in — sem alterar a interface `FactCheckProvider`.
- Manter todos os testes existentes verdes ao longo de cada passo.
- Manter `app.ts` e todos os endpoints HTTP inalterados.

**Non-Goals:**
- Reescrever testes ou aumentar cobertura.
- Orquestração multi-agente ou sessões persistentes do ADK (Runner com InMemorySessionService é suficiente).
- Migrar a extensão Chrome.
- Suporte a modelos não-Gemini via ADK.

## Decisions

### D1 — Adaptador `TextGenerator` sobre ADK `LlmAgent`

**Decisão:** Criar `AdkGenerator` em `server/src/adk-generator.ts` que implementa `TextGenerator` usando `LlmAgent` + `Runner` do ADK, rodado de forma stateless (nova sessão por chamada).

**Alternativa descartada:** Reescrever `LlmTopicClassifier`, `LlmClaimExtractor` e `LlmTranscriber` para usar ADK diretamente — quebraria os testes existentes que mockam `TextGenerator`, além de ampliar o escopo.

**Por quê:** O adaptador é o menor corte possível; os módulos de negócio não sabem da troca.

---

### D2 — `FactCheckProvider` ADK separado

**Decisão:** Criar `AdkFactCheckProvider` em `server/src/adk-fact-check-provider.ts` que implementa `FactCheckProvider` usando duas chamadas: pesquisa em texto livre com `GOOGLE_SEARCH`, seguida por formatação JSON sem busca. A resposta JSON-only mostrou-se capaz de evitar a ferramenta e inventar fontes; a separação garante que as citações venham apenas da chamada grounded. Se a pesquisa não retornar citações, o provider retorna `insufficient` sem uma segunda chamada. A lógica de `reconcileVerdict` (pura, bem testada) é reutilizada sem modificação.

**Alternativa descartada:** Colocar o parsing do veredito e a política de evidências dentro de `AdkGenerator` — isso acoplaria a interface genérica de geração ao domínio de fact-check. O provider dedicado usa o adaptador com `webSearch: true`, mas mantém pesquisa, parsing, reconciliação e cache sob responsabilidade do `FactCheckProvider`.

**Por quê:** `reconcileVerdict` já está testado; só precisamos alimentá-la com `Citation[]` correto. A segunda chamada aumenta custo/latência quando há fontes, mas evita depender de uma única resposta JSON que pode não acionar a busca.

---

### D3 — Sessão stateless por requisição

**Decisão:** Usar `InMemorySessionService` com `userId` e `sessionId` fixos e efêmeros (gerados por chamada ou constantes). O ADK exige sessão para rodar um agente; não há necessidade de persistência entre requisições aqui.

**Por quê:** O backend atual é stateless por design; manter esse contrato é mais simples e elimina gerenciamento de estado.

---

### D4 — Variáveis de ambiente

| Atual | Nova |
|---|---|
| `OPENROUTER_API_KEY` | `GOOGLE_API_KEY` |
| `OPENROUTER_MODEL` | `GEMINI_MODEL` (default: `gemini-3.5-flash-lite`) |
| `OPENROUTER_REASONING` | removida (ADK gerencia internamente) |
| `OPENROUTER_WEB_MAX_RESULTS` | removida |
| `OPENROUTER_WEB_ENGINE` | removida |

`config.ts` é atualizado; `.env.example` e README são atualizados junto. `gemini-2.0-flash`, o default proposto inicialmente, retornou 404 na validação real; `gemini-3.5-flash-lite` foi escolhido pelo usuário e passou smoke test de áudio e busca grounded.

---

### D5 — Áudio (`LlmTranscriber`)

**Decisão:** `AdkGenerator.generate()` com `input: LlmPart[]` contendo `type: 'audio'` converte para o formato de `InlineData` do ADK (`mimeType` + `data` base64). Gemini suporta áudio nativo via `inlineData`.

**Por quê:** Elimina a dependência de `input_audio` do formato OpenRouter; o Gemini nativo é o caminho de longo prazo.

## Risks / Trade-offs

| Risco | Mitigação |
|---|---|
| A API do ADK pode mudar | O adaptador `AdkGenerator` isola o risco; uma troca futura é cirúrgica |
| `GOOGLE_SEARCH` pode não ser acionado em uma resposta JSON-only | A pesquisa é solicitada em texto livre numa etapa separada; citações vêm somente dos metadados grounded dessa chamada |
| `GOOGLE_SEARCH` retorna `groundingChunks`; mapeamento para `Citation[]` | Smoke test confirmou citações grounded e reconciliação na checagem |
| `LlmPart` de áudio: formato de `inlineData` pode diferir do esperado | Smoke test confirmou transcrição de áudio sintético via integração real |
| Testes do `OpenRouterClient` ficam dormentes | Não quebram; podem ser removidos num cleanup futuro |

## Migration Plan

1. Instalar `@google/adk` + confirmar que `zod` já é dependência direta.
2. Criar `AdkGenerator` implementando `TextGenerator` — testes existentes passam com mock, verificar compilação.
3. Criar `AdkFactCheckProvider` implementando `FactCheckProvider` — reutiliza `reconcileVerdict`.
4. Atualizar `config.ts` com novas env vars.
5. Atualizar `index.ts`: trocar `OpenRouterClient` por `AdkGenerator`; trocar `WebSearchProvider` por `AdkFactCheckProvider`.
6. Rodar `npm test` — todos os testes devem passar (implementações mockadas, não reais).
7. Atualizar `.env.example` e README.
8. Smoke test manual com `GOOGLE_API_KEY` real.
9. Remover `openrouter.ts` (os testes dormentes ficam; não quebram).

**Rollback:** `openrouter.ts` não é deletado até o smoke test confirmar; reverter `index.ts` restaura o estado anterior em um commit.
