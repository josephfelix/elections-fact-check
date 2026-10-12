# Exploração do FactCheck Live

## O que é

FactCheck Live é uma extensão experimental do Chrome (Manifest V3) que acompanha o áudio de uma aba escolhida pelo usuário. Um painel lateral exibe transcrições recentes, agrupa assuntos e apresenta afirmações com checagem automática baseada em busca na web, ou um fluxo manual que abre uma consulta no Google AI Mode.

Não é um produto do Google nem uma interface para a API do Google AI Mode. A checagem automática usa Gemini com Grounding with Google Search e identifica-se na interface como checagem automática com busca web.

## Como as partes se conectam

- `src/background/`: service worker, comandos do painel e coordenação da sessão.
- `src/offscreen/` e `src/audio-capture/`: documento offscreen autorizado pelo Chrome para obter o áudio da aba, preservar a reprodução e produzir trechos WAV.
- `src/session-manager/`: estado persistente da sessão, análise do texto, deduplicação e fila de checagens.
- `src/sidepanel/`: interface React; lê e apresenta o estado salvo no armazenamento local do Chrome.
- `src/shared/`: esquemas Zod, tipos e funções compartilhadas.
- `server/src/`: backend Fastify. Recebe transcrição, classificação, extração e checagem; usa a Gemini API para as chamadas ao modelo e à busca web.
- `tests/`: testes unitários e de integração para extensão, backend, sessão, provedores, esquemas e tópicos.

O fluxo de dados é: clique explícito em **Iniciar monitoramento** → captura de áudio da aba → trechos de cerca de 12 segundos → backend local → Gemini API/modelo para transcrição e análise → checagens com busca web → resultados no painel. A análise é disparada em blocos de texto, não a cada palavra. As checagens usam uma fila limitada; o código limita o histórico de segmentos mantidos na sessão.

## Modelo, prompts, harness e agentes

O backend **não usa um framework de agentes nem implementa um agente autônomo**. Ele executa chamadas a um modelo em tarefas predefinidas. O código determina a sequência, os dados enviados e o formato esperado; o modelo não escolhe sozinho o próximo passo.

- **Modelo:** integração com ADK/Gemini (`server/src/adk-generator.ts`) implementa a interface `TextGenerator` e envia as requisições ao modelo configurado.
- **Prompts:** há instruções de sistema distintas para transcrever fala, classificar assuntos, extrair afirmações e checar fatos. `server/src/prompts.ts` centraliza regras comuns para tratar transcrições e conteúdo web como dados não confiáveis.
- **Harness do backend:** `server/src/app.ts` expõe as rotas e valida as entradas; os serviços montam prompts, limites de tokens e parâmetros; respostas estruturadas são extraídas e validadas com Zod. A integração ADK controla timeout, cancelamento e tratamento de erros.
- **Orquestração da sessão:** `src/session-manager/` decide quando analisar texto, primeiro chamando classificação e depois extração. Afirmações factuais entram numa fila de checagem com concorrência limitada; opiniões, previsões e promessas não recebem veredito factual.
- **Ferramenta de busca:** só a etapa de checagem ativa Grounding with Google Search. É uma etapa explícita, não uma ferramenta escolhida livremente pelo modelo.

Neste contexto, **harness** significa a infraestrutura determinística que envolve as chamadas ao modelo: contratos, prompts, contexto, validação, estado, filas, timeouts, cancelamento, cache e tratamento de erros. O `SessionManager` é um orquestrador baseado em regras, não um agente com planejamento autônomo. Os prompts de `server/src/` são prompts de execução; instruções em `.github/prompts/` são voltadas ao agente de desenvolvimento e não são carregadas pelo backend.

Essa arquitetura tende a ser mais previsível e testável do que um agente aberto, mas ainda depende da qualidade do modelo e da busca. A validação de formato e a reconciliação de citações reduzem alguns erros, mas não provam que o modelo interpretou corretamente as fontes. Conteúdo malicioso pode tentar influenciar o modelo; as instruções e a sanitização são defesas, não uma garantia contra prompt injection.

## Dependências e serviços externos

- Node.js 22.9+ e npm.
- Chrome 116+.
- Conta Google AI e chave da API (`GOOGLE_API_KEY`) com créditos para usar o modelo configurado.
- Conexão à internet durante transcrição, classificação, extração e checagem.
- O modo manual abre uma consulta no Google AI Mode no navegador; não retorna dados automaticamente para a extensão.

O backend padrão escuta apenas em `127.0.0.1:8787`. A chave fica no `.env` do backend, não na extensão. `BACKEND_TOKEN` é opcional, mas pode ser configurado como proteção adicional entre extensão e backend. Mantenha o endereço de escuta local; não configure `HOST=0.0.0.0` sem compreender e proteger a exposição resultante.

## É tranquilo, perigoso ou fácil de rodar?

**Relativamente simples de executar localmente, mas exige configuração.** Há passos separados para instalar dependências, adicionar uma chave paga, iniciar o backend, compilar e carregar a extensão sem compactação. Não é um aplicativo de um clique, e a primeira instalação requer familiaridade básica com terminal e configurações do Chrome.

**Risco moderado de privacidade e custo, não uma ferramenta para conteúdo sensível.** O projeto envia áudio falado, transcrições e afirmações ao backend local e, a partir dele, ao provedor do modelo e ao mecanismo de busca usado. O projeto declara que os trechos são mantidos em memória e que o estado da sessão fica em `chrome.storage.local`; isso não equivale a uma garantia sobre retenção dos provedores externos. Revise os termos e configurações de dados desses serviços e use uma chave com limite de créditos.

O acesso à captura é condicionado à ação explícita do usuário: clicar no ícone na aba pretendida e depois iniciar pelo painel. O código reconecta o áudio à saída para continuar ouvindo, descarta trechos sem fala e para/cancela trabalho ao encerrar. Ainda assim, confira visualmente o estado de captura, pause ou encerre quando não precisar e não monitore conteúdo privado sem autorização.

Não há garantia de precisão factual: resultados dependem do reconhecimento de fala, do modelo, das fontes encontradas e do contexto. Um resultado insuficiente não deve ser interpretado como falso ou verdadeiro. Confira as fontes e a afirmação original antes de tirar conclusões. Conteúdo de transmissões pode conter instruções maliciosas; o projeto trata entradas como dados não confiáveis, mas isso não elimina todo risco de erro do modelo.

Limitações documentadas:

- Conteúdo com DRM pode impedir captura; não há contorno intencional.
- A qualidade do reconhecimento de fala e da checagem depende da disponibilidade e do comportamento do provedor externo.
- Fechar o painel não encerra a sessão; a sessão é restaurada pelo service worker.
- Uso automático consome créditos e a busca web pode ter cobrança por requisição.

## Instalação e primeiro uso

Na raiz do repositório:

```bash
npm install
cp -n .env.example .env
```

Edite `.env` e preencha `GOOGLE_API_KEY`. Não compartilhe nem versione esse arquivo. Mantenha `HOST=127.0.0.1`; opcionalmente defina um `BACKEND_TOKEN` e configure o mesmo token nas configurações da extensão.

Em um terminal, inicie o backend:

```bash
npm run server
```

Em outro, compile a extensão:

```bash
npm run build
```

Abra `chrome://extensions`, habilite o modo do desenvolvedor e use **Carregar sem compactação** para selecionar `dist/`. Abra uma transmissão autorizada, clique no ícone da extensão nessa aba, confira a conexão ao backend e só então clique em **Iniciar monitoramento**.

Para parar, use **Pausar** ou **Encerrar** no painel. Para remover os dados locais da sessão, encerre e use **Nova sessão**. Parar a extensão ou fechar apenas o painel não deve ser tratado como substituto de encerrar explicitamente a captura.

## Comandos úteis

```bash
npm test
npm run typecheck
npm run build
npm run dev:server
```

`npm run dev:server` reinicia o backend ao detectar mudanças; não é necessário para o uso normal. `npm run build` gera `dist/`, que deve ser recarregada em `chrome://extensions` após alterações.

## Referências do repositório

- [README.md](../README.md): instruções completas, solução de problemas, custos e privacidade.
- [docs/google-integration.md](./google-integration.md): distinção entre integração automática e Google AI Mode.
- `package.json`: scripts e requisitos de runtime.
- `public/manifest.json`: permissões e pontos de entrada da extensão.
- `server/src/config.ts`: padrões de configuração do backend.
- `server/src/app.ts`: rotas HTTP, autenticação opcional e validação de entradas.
- `server/src/prompts.ts` e os serviços em `server/src/`: prompts de execução e chamadas ao modelo.
- `src/session-manager/index.ts`: orquestração determinística da análise e da fila de checagens.
