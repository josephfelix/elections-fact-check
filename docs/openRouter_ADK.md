# OpenRouter → Google ADK: implementação e harness

**Data da análise:** 12/10/2026  
**Escopo:** comparar o plano da migração de OpenRouter para Google ADK com o código presente e avaliar separadamente o harness de desenvolvimento e o runtime ADK.  
**Conclusão curta:** a migração funcional foi implementada e integrada. O ADK está sendo usado como runtime de um agente Gemini por chamada, mas o produto não foi transformado em um sistema multiagente. O harness de desenvolvimento tem guias, testes locais e hooks conectados ao Claude Code; ainda não há gate de fase ativo, nem evidência de execução obrigatória dos quality gates em CI.

## Comparação direta: OpenRouter vs Google ADK neste projeto

Não são alternativas equivalentes: **OpenRouter é uma API agregadora para acessar modelos/provedores**, enquanto **Google ADK é um framework/runtime para construir e executar agentes**, aqui conectado ao Gemini. A migração substituiu a integração do backend; não foi apenas uma troca de URL.

| Aspecto | OpenRouter (antes) | Google ADK (implementado) |
|---|---|---|
| Papel | API gateway/aggregator para chamar modelos de diferentes provedores por uma interface. | SDK/framework de runtime para definir e executar agentes e ferramentas; neste caso, `LlmAgent` + `Runner`. |
| Modelo/provedor neste projeto | Gemini era acessado pela API OpenRouter; o modelo era escolhido via configuração OpenRouter. | Gemini é chamado pela integração Google; `GEMINI_MODEL` define o modelo, com `gemini-3.5-flash-lite` como padrão. |
| Portabilidade entre modelos | Maior escolha de provedores/modelos por meio do catálogo e da API OpenRouter, sujeita a compatibilidade e disponibilidade de cada modelo. | Implementação atual é específica de Gemini/Google ADK. Trocar de provedor tende a exigir outro adaptador ou runtime. |
| Contrato interno do backend | `OpenRouterClient` implementava `TextGenerator`. | `AdkGenerator` implementa a mesma interface `TextGenerator`; transcriber, classifier e extractor mantêm seus contratos. |
| Busca na checagem | Plugin de busca web do OpenRouter, controlado pelo caminho antigo de geração. | Ferramenta `GOOGLE_SEARCH` do ADK, habilitada explicitamente na chamada de pesquisa do fact-check. |
| Evidências/citações | A resposta do cliente antigo fornecia citações consumidas pelo provider comum. | URLs são extraídas de `groundingMetadata.groundingChunks`; a checagem usa uma chamada de pesquisa grounded e reconcilia somente essas citações. |
| Fluxo de fact-check | Provider anterior fazia a chamada de geração com busca e interpretava sua resposta estruturada. | `AdkFactCheckProvider` separa pesquisa grounded e formatação JSON; sem citações, retorna `insufficient`. |
| Áudio | O backend passava a entrada de áudio ao cliente OpenRouter no formato aceito pelo adaptador anterior. | O adaptador converte `LlmPart` em `inlineData` com MIME type e base64 para o Gemini. |
| Credencial | `OPENROUTER_API_KEY`. | `GOOGLE_API_KEY`, mantida no backend e não enviada à extensão. |
| Controle e estado de execução | Cliente de API encapsulado no `TextGenerator`; sem runtime ADK no fluxo. | Sessão ADK efêmera em memória por chamada, excluída em `finally`; a orquestração de produto continua determinística no TypeScript. |
| Dependência principal | Cliente/código de integração OpenRouter, removido ao concluir a migração. | `@google/adk`, declarado nas dependências do projeto. |
| Custo e latência | Dependiam do modelo, da rota/provedor e da busca configurados no OpenRouter. | Dependem do Gemini e do Google Search Grounding; a checagem agora pode fazer duas chamadas quando há fontes. Não há base nesta comparação para afirmar que uma opção seja sempre mais barata ou rápida. |
| Acoplamento e trade-off | Mais flexibilidade para trocar entre modelos/provedores; dependência do gateway e de suas capacidades/configurações. | Integração mais direta com ferramentas e metadados do Google; maior acoplamento ao ecossistema Google/Gemini. |

**Resumo da escolha:** OpenRouter favorecia flexibilidade de acesso a modelos; ADK foi escolhido para integrar diretamente o runtime Gemini e o Google Search Grounding. Para este produto, a decisão mantém a lógica de domínio isolada atrás de `TextGenerator` e `FactCheckProvider`, mas deixa o adaptador atual dependente de Gemini. Preços, limites, disponibilidade e retenção devem ser avaliados nas condições atuais de cada conta e modelo, não inferidos pelo nome do SDK.

## 1. Não confundir os dois harnesses

O projeto tem dois contextos diferentes:

| Contexto | Quem governa | O que faz neste projeto |
|---|---|---|
| **Harness de desenvolvimento** | Claude Code, GitHub Copilot e, por instruções, ferramentas compatíveis com `AGENTS.md` | Orienta agentes de codificação, protege operações locais e define como validar alterações. |
| **Harness de runtime** | Aplicação Node.js com Google ADK | Executa tarefas Gemini solicitadas pelo backend: transcrição, classificação, extração e pesquisa/checagem. |

`AGENTS.md`, `CLAUDE.md`, skills, comandos SPDD e hooks de desenvolvimento **não são carregados pelo agente ADK**. Inversamente, o ADK não impõe regras ao agente que edita o repositório. A conexão entre os contextos é feita por engenharia e testes do projeto, não por uma integração automática.

## 2. O que foi preparado e o que foi implementado

O plano da change OpenSpec propôs manter os contratos existentes, trocar o adaptador do modelo, introduzir um provider de checagem ADK, mudar a configuração e fazer smoke test real antes de remover o cliente antigo. As tarefas registradas em [`openspec/changes/replace-openrouter-with-adk-ts/tasks.md`](../openspec/changes/replace-openrouter-with-adk-ts/tasks.md) estão marcadas como concluídas.

| Preparado no plano | Estado observado no código | Avaliação |
|---|---|---|
| `AdkGenerator` preservando a interface `TextGenerator` | [`server/src/adk-generator.ts`](../server/src/adk-generator.ts) implementa o adaptador com `LlmAgent`, `Runner`, sessão em memória, conteúdo textual/áudio e erro tipado. | Implementado. Mantém classifier, extractor e transcriber independentes do SDK. |
| Tool de busca somente quando solicitada | `GenerateOptions.webSearch` seleciona `GOOGLE_SEARCH`; sem a opção, o agente é criado sem essa ferramenta. | Implementado e com menor superfície de ferramenta nas chamadas que não precisam pesquisar. |
| Provider de fact-check ADK | [`server/src/adk-fact-check-provider.ts`](../server/src/adk-fact-check-provider.ts) faz pesquisa grounded, depois formata o veredito sem ferramenta; sem citações, retorna `insufficient`. | Implementado. A divisão evita depender de uma chamada JSON que talvez não acione a busca. |
| Citações originadas da busca e reconciliação do veredito | Citações são extraídas de `groundingMetadata.groundingChunks` e repassadas a `reconcileVerdict` de [`server/src/web-search-provider.ts`](../server/src/web-search-provider.ts). | Implementado. A resposta de formatação não pode introduzir URLs como evidência por conta própria. |
| Troca de variáveis e modelo | [`server/src/config.ts`](../server/src/config.ts) e [`.env.example`](../.env.example) usam `GOOGLE_API_KEY` e `GEMINI_MODEL`; o default é `gemini-3.5-flash-lite`. | Implementado. Variáveis específicas do OpenRouter foram removidas. |
| Wiring sem alterar as rotas HTTP | [`server/src/index.ts`](../server/src/index.ts) injeta `AdkGenerator` nos serviços atuais e usa `AdkFactCheckProvider`; `app.ts` e os endpoints permanecem na fronteira existente. | Implementado; a mudança ficou concentrada no backend e nos adaptadores. |
| Smoke test real antes de remover o cliente | O OpenSpec registra smoke test de `/health`, transcrição e checagem com chave real; [`server/src/openrouter.ts`](../server/src/openrouter.ts) foi removido. | Realizado conforme a trilha da change. A validação externa é manual, não reproduzida pela suíte unitária. |

### Mudança comportamental mais importante

A checagem automática agora é uma sequência deliberada:

1. Uma chamada de pesquisa usa Google Search Grounding e reúne texto e citações do metadado grounded.
2. Se não houver citações, o provider encerra com `insufficient`.
3. Havendo citações, uma segunda chamada sem ferramenta produz o JSON do veredito.
4. A reconciliação final aceita evidências somente das citações da pesquisa.

Isso altera custo e latência em relação a uma única chamada; em contrapartida, torna a origem das fontes explícita e reduz a chance de apresentar citações inventadas. Essa é uma decisão documentada em [`design.md`](../openspec/changes/replace-openrouter-with-adk-ts/design.md), não uma propriedade automática do ADK.

## 3. Há agentes? É necessário usar mais?

**Sim, há um `LlmAgent` do ADK no runtime. Não há um sistema multiagente.**

O `AdkGenerator` instancia um `LlmAgent` e um `Runner` por geração, com sessão efêmera. As tarefas continuam definidas pelo backend e pelos prompts. O fluxo de sessão, a ordem das chamadas e a validação JSON continuam em código TypeScript. Apenas a chamada de pesquisa recebe `GOOGLE_SEARCH`; não há indicação de que o agente possa escolher livremente novos agentes ou alterar a sequência do produto.

Isso é uma escolha adequada para o escopo atual:

- A aplicação tem uma sequência conhecida de tarefas (transcrever, classificar, extrair e, quando aplicável, checar), que já é orquestrada pelo código.
- O uso de busca é localizado na pesquisa de fact-check e não é necessário para todas as chamadas.
- Parsing, schema, cache, reconciliação de citações, fila e estado da sessão ficam sob controle explícito do backend.
- Um supervisor, agentes especializados em cadeia ou delegação autônoma adicionariam coordenação, estado, custo, latência e mais caminhos de falha sem necessidade demonstrada.

**Recomendação:** manter o modelo atual — ADK como camada de execução de chamadas e ferramenta de busca limitada, com orquestração determinística em TypeScript. Só considerar multiagentes se surgir uma necessidade verificável, como etapas independentes que possam ser executadas em paralelo, revisão adversarial com papéis distintos ou roteamento dinâmico que não fique mais simples como código comum. Mesmo nesse caso, medir qualidade, custo e latência contra a abordagem atual antes de adotar.

## 4. Harness de desenvolvimento: inventário e estado

O estado abaixo foi classificado pelos arquivos presentes e seus pontos de conexão, não pela intenção descrita em documentos.

| Artefato | Estado | O que realmente fornece |
|---|---|---|
| [`AGENTS.md`](../AGENTS.md) | Presente; entrada de instruções do repositório | Regras compartilhadas e quality gates recomendados. As regras são orientação ao agente, não bloqueios computacionais por si sós. |
| [`CLAUDE.md`](../CLAUDE.md) | Presente e conectado ao Claude Code | Encaminha para `AGENTS.md`; evita duplicar o conjunto principal de regras. |
| [`.claude/settings.json`](../.claude/settings.json) e [`scripts/hooks/`](../scripts/hooks/) | Presentes e registrados para Claude Code | Hooks de início de sessão e de pré-uso de ferramentas Bash/Write/Edit. Os scripts também entendem formatos de payload de Copilot, mas isso não os registra no Copilot. |
| [`harness.config.json`](../harness.config.json) | Presente e lido pelos hooks Claude | Configura nomes sensíveis e padrões bloqueados. Não define `planning_write_prefixes` nem `code_prefixes`; portanto **o gate de fase está desativado**. |
| [`scripts/harness/phase_cli.py`](../scripts/harness/phase_cli.py) | Presente | CLI para estado de fase, mas sem configuração de prefixos o estado não habilita bloqueio de escrita. |
| [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) | Presente | Instruções Copilot para o fluxo SDLC OpenSpec + OpenSPDD, com referências para prompts e skills existentes. |
| [`.github/skills/`](../.github/skills/), [`.claude/skills/`](../.claude/skills/) e [`.claude/commands/`](../.claude/commands/) | Presentes em caminhos reconhecíveis por esses hosts | Skills e workflows de desenvolvimento, incluindo análise, REASONS Canvas, alinhamento da fase 5 e geração condicionada à aprovação. Não são prompts de runtime do ADK. |
| [`.github/agents/openspec.agent.md`](../.github/agents/openspec.agent.md) | Presente | Agente de desenvolvimento voltado a OpenSpec; não é um agente de produto nem um subagente do ADK. |
| `.github/hooks/` | Ausente | Não há hooks de ciclo de vida de Copilot conectados. Os scripts existentes, sozinhos, não são hooks de Copilot. |
| `.codex/` e `.agents/` | Ausentes no inventário | Não há configuração ou skills específicas nesses diretórios. `AGENTS.md` continua sendo o guia raiz para hosts que o descobrem. |
| Testes e scripts npm em [`package.json`](../package.json) | Presentes, executáveis localmente | `npm test`, `npm run typecheck` e `npm run build` verificam código no loop local; não são executados automaticamente por todo agente só por estarem declarados. |
| `.github/workflows/` | Presente, mas sem workflow de quality gates | O workflow encontrado prepara OpenSpec para o coding agent; não executa a suíte, typecheck ou build como gate de PR. |

### Precisão sobre os hooks e as regras de segurança

Os hooks atuais estão ligados ao **Claude Code** por `.claude/settings.json`. Portanto, dizer genericamente em `AGENTS.md` que “os hooks bloqueiam” comandos perigosos exagera a cobertura entre hosts: essa proteção não está registrada em `.github/hooks/` para Copilot, nem em configuração Codex. Os scripts têm algumas regras embutidas e outras vêm de `harness.config.json`; bloqueio por fase não está ativo.

O harness é útil como feedback rápido e como contexto para agentes, mas não deve ser apresentado como controle universal de política, nem como substituto de revisão, quality gates em CI ou proteção de branch.

## 5. Sensores de runtime ADK e evidências de validação

| Controle | Evidência implementada | Limite atual |
|---|---|---|
| Configuração e chave no backend | `GOOGLE_API_KEY` é carregada no servidor e a extensão não recebe a chave; a configuração expõe se o backend está configurado. | Não substitui controle de acesso ao processo/host nem políticas de retenção do provedor externo. |
| Ferramenta de busca restrita | O adaptador só inclui `GOOGLE_SEARCH` quando `webSearch` é true; o provider de fact-check usa a busca na etapa de pesquisa. | A chamada ainda depende do comportamento/serviço Google e pode retornar zero citações. |
| Tempo limite e cancelamento | `AbortSignal.timeout` e sinal do chamador são combinados na chamada do Runner. | Comportamento real de cancelamento do SDK externo merece teste automatizado de contrato. |
| Sessão efêmera | ID aleatório por geração, sessão em `InMemorySessionService` e exclusão em `finally`. | Não há persistência entre chamadas nem necessidade atual de memória conversacional. |
| Veredito e evidências | Schema Zod valida JSON; `reconcileVerdict` limita fontes às citações grounded, deduplica URLs e rebaixa veredito sem evidências. | Grounding prova a origem da citação retornada, não que a interpretação ou o veredito estejam corretos. |
| Proteção de prompt | Regras em [`server/src/prompts.ts`](../server/src/prompts.ts), entradas delimitadas e resultados de busca tratados como dados não confiáveis. | Mitigação, não garantia contra prompt injection ou erro do modelo. |

### O que os testes provam — e o que não provam

O estado da change registra `npm test`, `npm run typecheck` e `npm run build` aprovados, além do smoke test manual. A suíte exercita regras de provider, reconciliação de evidências, contratos e aplicação usando geradores mockados.

Na suíte atual **não foi localizada cobertura direta de `AdkGenerator` nem de `AdkFactCheckProvider`**. Em particular, os testes de provider existentes exercitam `WebSearchProvider`, não o fluxo novo de duas chamadas do provider ADK. Assim:

- os testes locais dão confiança às regras de domínio e aos contratos existentes;
- typecheck/build provam compatibilidade estática e compilação;
- o smoke test dá evidência de integração real nas chamadas testadas;
- nenhum desses itens substitui testes automatizados para o mapeamento de eventos ADK, extração de grounding, limpeza de sessão, falha/timeout e sequência de duas chamadas.

## 6. Lacunas prioritárias e ações recomendadas

### P0 — Fechar a validação do código novo

Adicionar testes unitários com doubles do gerador/runtime para `AdkFactCheckProvider`, cobrindo: sequência pesquisa→JSON, ausência de segunda chamada sem citações, reconciliação apenas com citações grounded, cache e propagação de falha/abort. Para `AdkGenerator`, testar mapeamento de opções, áudio, eventos/citações, timeout e exclusão de sessão. Manter um smoke test de integração separado e explicitamente opt-in, sem chave em CI.

**Por quê:** o risco principal após a migração não é a escolha do ADK em si; é a falta de sensores reproduzíveis sobre a integração nova, justamente onde a API externa e os eventos do SDK diferem dos mocks existentes.

### P1 — Fazer os quality gates serem gates

Criar workflow de CI para pull requests que rode `npm ci`, `npm run typecheck`, `npm test` e `npm run build`. Configurar branch protection separadamente no GitHub se a intenção for tornar os checks obrigatórios. O workflow Copilot existente não substitui isso.

### P1 — Alinhar cobertura do harness aos hosts declarados

Decidir explicitamente quais hosts são suportados:

- Para Claude Code, manter os hooks atuais e testar suas entradas/saídas com casos representativos.
- Para Copilot, portar/registrar hooks em `.github/hooks/` somente se bloqueios determinísticos no host forem necessários.
- Para Codex, criar `.codex/hooks.json`/scripts apenas se houver requisito de enforcement nesse host; `AGENTS.md` sozinho é orientação.
- Manter as referências do fluxo SDLC sincronizadas entre `AGENTS.md`, as instruções do Copilot e os comandos/skills do Claude Code; a orientação permanece não determinística, sem gate de fase nos hooks.
- Ajustar a afirmação em `AGENTS.md` sobre hooks para especificar o host e o conjunto realmente bloqueado.

### P2 — Decidir sobre gate de fase e redundâncias

Se o projeto quer bloquear código antes da aprovação do planejamento, preencher e testar `planning_write_prefixes`/`code_prefixes`, criar/validar o estado de fase e exercitar o CLI. Caso contrário, manter o gate desativado, mas evitar sugerir que a fase é aplicada automaticamente.

Não remover OpenSpec/SPDD ou materiais de harness apenas por OpenRouter ter sido removido: são ferramentas do processo de desenvolvimento, sem dependência do provider de runtime. Remover esses diretórios só faz sentido se o projeto abandonar deliberadamente os workflows correspondentes. Da mesma forma, `LlmGenerator`/`TextGenerator`, Zod, cache e `reconcileVerdict` continuam sendo abstrações/regras úteis e não são resíduos do OpenRouter.

## 7. Parecer final

**Migração OpenRouter → ADK:** concluída conforme o desenho registrado. O ponto de integração foi trocado no backend, a API da extensão permaneceu estável e a checagem ganhou uma separação explícita entre pesquisa grounded e formatação.

**Uso de agentes:** proporcional. O ADK fornece a abstração de execução `LlmAgent`, mas a aplicação mantém o fluxo determinístico; multiagentes não são necessários para o comportamento atual e tenderiam a ampliar superfície e custo sem benefício demonstrado.

**Harness de desenvolvimento:** útil, mas assimétrico. Há instruções e automação local, com hooks conectados ao Claude Code; não há enforcement equivalente conectado aos outros hosts nem CI de qualidade. Gate de fase está preparado parcialmente, mas desligado.

**Prioridade recomendada:** antes de expandir agentes ou apagar infraestrutura de processo, adicionar cobertura automatizada para os dois módulos ADK e levar os quality gates existentes para CI. Isso fecha o maior hiato entre “migração executada e smoke-tested” e “comportamento da migração continuamente verificado”.
