# FactCheck Live — resumo

**O que faz:** extensão Chrome que captura áudio da aba escolhida, transcreve, agrupa assuntos e apresenta checagens de afirmações num painel. A checagem automática usa Gemini com Grounding with Google Search; não é o Google AI Mode. O modo manual apenas abre a consulta para o usuário.

**Arquitetura:** extensão MV3 (service worker, documento offscreen e painel React) → backend local Fastify → Gemini API/modelo e busca web. Código da extensão em `src/`, backend em `server/src/`, testes em `tests/`.

**Agents, harness e prompts:** não há framework de agentes nem agente autônomo. O backend executa tarefas LLM predefinidas com prompts distintos (transcrição, assuntos, afirmações e checagem). O harness é o código que monta chamadas e contexto, valida entradas e JSON com Zod, controla timeout/retries, cache e erros. A extensão (`SessionManager`) orquestra a sequência e a fila; só a etapa de checagem usa a busca web. Prompts em `server/src/` são de runtime; `.github/prompts/` orienta agentes de desenvolvimento.

**É fácil?** Moderadamente fácil para quem já usa Node e Chrome: requer Node 22.9+, Chrome 116+, chave da Gemini API, backend em execução e instalação unpacked da pasta `dist/`.

**É seguro?** Usa captura iniciada por ação explícita e backend local em `127.0.0.1` por padrão. Porém, envia áudio, transcrições e afirmações a provedores externos; há custo e questões de retenção. Não use com material sensível sem revisar as políticas dos provedores. Limite os créditos da chave. Resultados de IA podem estar errados e precisam de verificação humana. DRM pode bloquear captura.

**Executar:** `npm install`; copiar `.env.example` para `.env` sem sobrescrever e preencher `GOOGLE_API_KEY`; `npm run server`; em outro terminal, `npm run build`; carregar `dist/` em `chrome://extensions`. Iniciar pelo ícone na aba pretendida e pelo botão do painel.

**Validar código:** `npm test`, `npm run typecheck`, `npm run build`.

**Atenção:** transcrição e checagem usam provedores externos e podem gerar custo/latência. Consulte o [guia principal](./explorar.md), o [README](../README.md) e a [nota de integração Google](./google-integration.md).
