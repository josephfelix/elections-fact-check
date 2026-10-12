# Regras do repositório

## Fonte de verdade

Este arquivo é a fonte única de regras para agentes. Consulte também os contratos de domínio e a documentação em `docs/` quando a tarefa envolver esses assuntos.

## Projeto

- Extensão Chrome Manifest V3 em TypeScript/React e backend Node.js/TypeScript.
- Código da extensão em `src/`, backend em `server/src/` e testes em `tests/`.
- Preserve a separação entre extensão e backend; não exponha segredos do backend à extensão.

## Fluxo SDLC obrigatório: OpenSpec + OpenSPDD

Este fluxo é a orientação compartilhada para mudanças de produto. OpenSpec governa a exploração e a definição da change; OpenSPDD transforma essa definição em análise estratégica, prompt executável, revisão de alinhamento e implementação. Não pule fases silenciosamente. Cada handoff depende do artefato da fase anterior.

### 0. Setup e preflight

- Confirme que a CLI OpenSpec está disponível (`rtk openspec --version`) e que `rtk openspec list --json` retorna uma raiz OpenSpec válida para este repositório.
- Confirme que os workflows OpenSPDD estão disponíveis no host atual: `.github/skills/` no Copilot; comandos correspondentes em `.claude/commands/` no Claude Code. No Codex, siga este `AGENTS.md` e leia os arquivos de workflow referenciados nas fases abaixo; esses arquivos não são registrados como skills/atalhos nativos do Codex neste repositório.
- OpenSPDD neste projeto é fornecido por workflows/skills versionados, não por um pacote npm separado.
- Se uma dependência estiver ausente ou não for descoberta pelo host, pare e explique como configurá-la. Não instale ferramentas nem inicialize OpenSpec automaticamente.

### 1. Exploração — OpenSpec

- Use `/openspec-explore` para investigar o problema, os requisitos, o código e as alternativas sem implementar.
- Saída: escopo compreendido e decisões relevantes esclarecidas. Não escreva código nesta fase.

### 2. Proposta — OpenSpec

- Use `/openspec-propose` para criar a change OpenSpec e os artifacts necessários, incluindo tarefas.
- Saída: `proposal.md`, `design.md`, `tasks.md` e specs quando houver mudanças de comportamento. Use `skip_specs` apenas quando não houver requisito comportamental novo/alterado.
- A proposta completa não autoriza implementação. O próximo handoff é a análise OpenSPDD.

### 3. Análise — OpenSPDD

- Use `/spdd-analysis @openspec/changes/<change-name>/` para analisar a change e o contexto do repositório.
- Saída: um documento estratégico em `spdd/analysis/`; preserve nele requisitos, conceitos, decisões, riscos e ambiguidades.
- Se houver ambiguidade material, pare e peça decisão antes de gerar o prompt.

### 4. REASONS Canvas — OpenSPDD

- Use `/spdd-reasons-canvas @spdd/analysis/<analysis-file>.md`.
- Saída: prompt completo em `spdd/prompt/`, com Requirements, Entities, Approach, Structure, Operations, Norms e Safeguards.
- Esta fase ainda é planejamento. Após criar o prompt, encaminhe para a revisão/alinhamento da fase 5; não implemente diretamente.

### 5. Revisão e alinhamento OpenSpec ↔ OpenSPDD

- Use `/sdlc-alignment` com a pasta da change OpenSpec, a análise e o prompt REASONS Canvas.
- Confira se objetivo, escopo, capacidades/requisitos, critérios de aceitação e tarefas OpenSpec estão representados sem contradição em Requirements, Approach, Operations, Norms e Safeguards.
- Confira se cada tarefa OpenSpec tem cobertura correspondente em Operations e se os quality gates estão definidos.
- Se encontrar divergência, ambiguidade material ou tarefa sem cobertura, declare o gate **BLOCKED** e indique quais artifacts precisam de revisão. Não edite artifacts nem código implicitamente.
- Se tudo estiver coerente, declare **READY FOR APPROVAL** e peça aprovação explícita do usuário para iniciar a fase 6. A revisão aprovada é um gate de processo, não um bloqueio computacional.

### 6. Implementação — OpenSPDD

- Só comece após o gate da fase 5 estar aprovado e o usuário autorizar explicitamente a implementação.
- Use `/spdd-generate @spdd/prompt/<prompt-file>.md`; implemente Operations na ordem definida e respeite Norms/Safeguards.
- Mantenha `tasks.md` OpenSpec como rastreamento: marque uma tarefa concluída somente após implementar e verificar seu comportamento.
- Se a implementação exigir desvio de escopo ou mudar comportamento, pare, alinhe primeiro os artifacts e só depois prossiga com autorização.
- Execute `npm test`, `npm run typecheck` e `npm run build`. Se o código divergir do prompt por uma decisão aprovada, sincronize os artifacts com `/spdd-sync`. Arquivar a change é uma ação separada, após revisão.

**Enforcement atual:** este fluxo é orientação obrigatória nos entrypoints e skills. O gate de escrita por fase em `harness.config.json` permanece desativado; hooks não devem ser descritos como bloqueando fases.

## Regras operacionais

- Não faça `git push`, `git reset --hard`, `git clean -f`, exclusão forçada de branches ou `rm -rf` sem confirmação explícita do usuário. Os hooks bloqueiam esses comandos por padrão.
- Nunca escreva credenciais em arquivos versionados, logs ou eventos. Não leia nem altere valores de `.env` sem necessidade explícita.
- Valide entradas nas fronteiras do sistema e mantenha os tipos e schemas sincronizados.
- Evite capturas amplas de exceções e fallbacks silenciosos; erros devem permanecer observáveis.
- Mantenha testes para mudanças de comportamento e siga os padrões existentes do módulo.

## Quality gates

Para mudanças de código, execute os verificadores relevantes:

```bash
npm test
npm run typecheck
npm run build
```

O hook de segurança do harness não implementa gate de fase; revisão e validação continuam necessárias.
