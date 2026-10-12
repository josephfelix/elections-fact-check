# FactCheck Live

![FactCheck Live monitorando uma transmissão no Globoplay, com o painel lateral mostrando a checagem de uma afirmação](images/cover.png)

Extensão para Google Chrome que acompanha o áudio de uma aba (por exemplo, uma transmissão no Globoplay),
transcreve em português, organiza os **assuntos** e verifica as **afirmações** com busca na web, mostrando tudo em um
painel lateral com indicadores de veracidade e links para as fontes.

Funciona com um **backend local** (Node.js) que guarda a sua chave da Google AI (Gemini) e usa o
**Google Agent Development Kit (ADK)** para transcrição, classificação e checagem. A extensão nunca vê a chave.

> **Sobre o Google AI Mode:** o Google não oferece API pública para ele. A checagem automática usa Gemini via ADK
> com Google Search Grounding (rotulada assim na interface, **não é o AI Mode**). Cada afirmação tem o botão
> **Verificar no Google AI Mode**, que abre a consulta no navegador para você. Detalhes em
> [`docs/google-integration.md`](docs/google-integration.md).

---

## Sumário

1. [Requisitos](#1-requisitos)
2. [Obter chave da Google AI](#2-obter-chave-da-google-ai)
3. [Instalar e rodar o backend](#3-instalar-e-rodar-o-backend)
4. [Instalar a extensão no Chrome (unpacked)](#4-instalar-a-extensão-no-chrome-unpacked)
5. [Usar](#5-usar)
6. [Solução de problemas](#6-solução-de-problemas)
7. [Custo e consumo de tokens](#7-custo-e-consumo-de-tokens)
8. [Privacidade e segurança](#8-privacidade-e-segurança)
9. [Como funciona](#9-como-funciona)
10. [Desenvolvimento e testes](#10-desenvolvimento-e-testes)

---

## 1. Requisitos

| Item | Versão |
|---|---|
| **Node.js** | **22.9 ou superior** (testado com 22.16; o arquivo `.nvmrc` indica 22). O script `npm run server` usa a flag `--env-file-if-exists`, que exige uma versão recente do Node (por isso o mínimo 22.9). |
| npm | 10+ (já vem com o Node 22) |
| Google Chrome | **116 ou superior** (precisa de Side Panel e documento offscreen) |
| Conta no Google AI Studio | chave gratuita disponível (ver abaixo) |

Dica: com [nvm](https://github.com/nvm-sh/nvm), rode `nvm install 22 && nvm use` dentro da pasta do projeto.
Confira com `node -v`.

## 2. Obter chave da Google AI

1. Acesse <https://aistudio.google.com/apikey> e faça login com uma conta Google.
2. Clique em **Create API key** e selecione um projeto (ou crie um novo).
   - Copie a chave gerada (começa com `AIza…`). Guarde-a: vai no `.env` a seguir.
3. O modelo padrão é `gemini-3.5-flash-lite`, validado para **áudio, texto e Google Search Grounding**.
4. (Opcional) Revise as políticas de retenção de dados do Google AI. O áudio e os textos da transmissão passam pela API Gemini. Veja [Privacidade](#8-privacidade-e-segurança).

Guarde a chave: você vai colocá-la no arquivo `.env` no próximo passo. Não crie o `.env` agora, ele é gerado a partir do `.env.example` lá.

## 3. Instalar e rodar o backend

```bash
# dentro da pasta do projeto
npm install

# cria o .env a partir do modelo (-n: nunca sobrescreve um .env que já exista)
cp -n .env.example .env
```

Agora abra o arquivo `.env` que acabou de ser criado e preencha a chave do passo anterior:

```
GOOGLE_API_KEY=adicione-sua-chave-aqui
```

> Faça nesta ordem: primeiro o `cp`, depois a edição. Rodar o `cp` depois de preencher o `.env` sem o `-n` apagaria a chave.

Variáveis principais do `.env` (todas as outras têm padrão seguro):

| Variável | Padrão | Para que serve |
|---|---|---|
| `GOOGLE_API_KEY` | *(vazio)* | **Obrigatória.** Sua chave Gemini. Fica só no backend; o `.env` é ignorado pelo git. |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Modelo usado em tudo (transcrição, assuntos, afirmações, checagem). Precisa aceitar áudio e Google Search. |
| `BACKEND_TOKEN` | *(vazio)* | Opcional. Se definido, o backend exige esse token (configure o mesmo no painel). |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Mantenha `127.0.0.1` para não expor o backend na rede. |

Inicie o backend e **deixe-o rodando** enquanto usar a extensão:

```bash
npm run server
# FactCheck Live backend em http://127.0.0.1:8787 (ADK/Gemini configurado, modelo gemini-3.5-flash-lite)
```

Teste:

```bash
curl http://127.0.0.1:8787/health
# {"ok":true,"providers":{"grounded":true},"model":"gemini-3.5-flash-lite"}
```

`"grounded": true` significa "chave do Gemini configurada". Se vier `false`, a chave não foi lida:
confira o `.env` e reinicie.

> Alterou o `.env`? Reinicie o backend (`Ctrl+C` e `npm run server`). Para reiniciar sozinho a cada mudança no código, use `npm run dev:server`.

Depois gere a extensão:

```bash
npm run build      # cria a pasta dist/
```

## 4. Instalar a extensão no Chrome (unpacked)

A extensão não está na Chrome Web Store; ela é carregada "sem compactação" a partir da pasta `dist/`.

1. Abra o Chrome e acesse **`chrome://extensions`**.
2. Ative **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** (*Load unpacked*).
4. Selecione a pasta **`dist/`** do projeto (não a raiz do projeto).
5. O **FactCheck Live** aparece na lista. Clique no ícone de quebra-cabeça da barra do Chrome e **fixe** (📌) a extensão
   para ter o ícone sempre visível.

**Depois de mudar o código ou atualizar o projeto:** rode `npm run build` e, em `chrome://extensions`, clique no botão
**recarregar** (↻) do card da extensão.

**Erros de carregamento?** No card da extensão, clique em **Erros** (ou em "service worker" → *Inspecionar*) para ver o motivo.
A causa mais comum é ter selecionado a pasta errada (precisa conter o `manifest.json`).

## 5. Usar

1. Com o backend rodando, abra a transmissão em uma aba (Globoplay, YouTube, etc.) e deixe-a tocando.
2. **Clique no ícone da extensão *nessa aba*.** Isso abre o painel lateral e autoriza a captura *daquela* aba.
   (Para monitorar outra aba, abra-a e clique no ícone de novo.)
3. No painel, confira a faixa verde **"Backend conectado e Gemini configurado"** e clique em
   **Iniciar monitoramento**. A captura **só começa nesse clique**.
4. Acompanhe: em ~15–30 s aparecem as falas transcritas; depois os assuntos e as afirmações, que entram como ⏳ e
   viram ✓ ✕ ◐ ? conforme a pesquisa termina.
5. Clique numa afirmação para ver trecho original, contexto, explicação, fontes, data dos dados, limitações e o botão
   **Verificar no Google AI Mode**.
6. **Pausar** interrompe gravação e envio (o áudio da aba segue tocando). **Encerrar** para tudo na hora.
   **Nova sessão** limpa os resultados.

Fechar e reabrir o painel não reinicia nada: ele mostra o estado salvo.

Em **Configurações** (na tela inicial) você escolhe entre checagem **Automática** (Gemini via ADK + Google Search) e
**Manual** (só abre o Google AI Mode, sem gastar tokens de checagem), além da URL e do token do backend.

### Legenda

| Ícone | Significado |
|---|---|
| ✓ verde | Evidências sustentam a afirmação |
| ✕ vermelho | Há evidências relevantes que a contradizem |
| ◐ amarelo | Parcialmente sustentada ou enganosa |
| ⏳ cinza | Pesquisa em andamento |
| ? cinza | Evidências insuficientes (ausência de resultado **não** é "falso") |
| ! roxo | Erro técnico (use "Tentar novamente") |
| ” azul | Opinião, previsão ou promessa — sem veredito factual |
| ↗ azul | Verificação manual no Google AI Mode |

## 6. Solução de problemas

| Sintoma | Causa provável / o que fazer |
|---|---|
| Painel: **"Backend inacessível"** | O backend não está rodando. Execute `npm run server`. Confira a URL em Configurações (`http://127.0.0.1:8787`). |
| **"GOOGLE_API_KEY não configurada"** | `GOOGLE_API_KEY` vazia ou `.env` no lugar errado (deve ficar na raiz do projeto). Reinicie o backend. |
| Erro 401/403 do Gemini | Chave inválida/revogada. Gere outra em aistudio.google.com/apikey. |
| Erro 429 do Gemini | Quota excedida. Aguarde ou habilite faturamento no projeto Google Cloud. |
| Modelo não aceita áudio | Configure outro modelo com suporte a áudio e Google Search em `GEMINI_MODEL`. |
| "Token do backend inválido" | `BACKEND_TOKEN` do `.env` difere do token em Configurações do painel. |
| "Não foi possível capturar o áudio da aba" | Clique no ícone da extensão **na própria aba** da transmissão e tente de novo. Abas internas do Chrome (`chrome://`) não podem ser capturadas. |
| Aba sem som após iniciar | Recarregue a extensão e tente de novo. Veja o console do documento offscreen em `chrome://extensions` → *Inspecionar visualizações*. |
| Nenhuma fala transcrita | Só trechos com fala são enviados; confirme que o áudio está tocando. Veja `lastError` na faixa amarela do painel. |
| Transcrição "atrasada" | O backend/modelo não está acompanhando; trechos são descartados para não acumular. |
| `Transcrição: Erro interno` | Falha inesperada no backend. Atualize o projeto, reinicie o backend e veja o terminal onde ele roda. |
| `npm run server` falha com `--env-file-if-exists` | Node antigo. Use Node 22.9+. |
| Globoplay sem áudio capturado | Possível proteção DRM. Não há contorno (limite intencional). |

## 7. Custo e consumo de tokens

O padrão é o modelo `gemini-3.5-flash-lite` (troque em `GEMINI_MODEL`). Para gastar menos:

- **Tetos de saída** (`maxOutputTokens`): transcrição 1.500, assuntos 500, afirmações 2.000, checagem 2.000.
- **Menos chamadas:** análise a cada ~400 caracteres novos (janela de até 2.000); só afirmações *factuais* são pesquisadas; cache de 6 h.
- O **Google Search Grounding** é cobrado por requisição além dos tokens (consulte a página de preços da Google AI).
Quando a busca retorna fontes, a checagem automática também faz uma segunda chamada ao modelo para formatar o veredito.
- Para **zerar** o custo de checagem, use o modo **Manual** nas Configurações.

## 8. Privacidade e segurança

- A captura só começa após clicar em **Iniciar monitoramento**; uma faixa "🔴 Captura de áudio ativa" aparece enquanto grava.
- O áudio fica **só em memória**: cada trecho (~12 s, WAV 16 kHz mono, apenas com fala) é enviado e descartado. Nada é gravado em disco.
- **Para onde os dados vão:** backend local → Google AI API (Gemini + Google Search Grounding).
  Isso inclui áudio, transcrições e as afirmações. Não use com conteúdo sensível sem revisar as políticas de retenção/treino do Google.
- A chave do Gemini existe **apenas** no backend (`.env`, fora do git). Testes automatizados verificam que `src/` e `dist/` não a contêm.
- O backend escuta só em `127.0.0.1`, tem token opcional (comparação em tempo constante), logs desligados e erros que não vazam detalhes.
- Transcrições e páginas são tratadas como **dados não confiáveis**: sanitizadas, isoladas em blocos delimitados, saída validada com Zod,
  evidências somente de citações reais, links só `http(s)`. Um veredito sem fonte citada é rebaixado para "?".
- O estado da sessão (falas, afirmações, fontes) fica em `chrome.storage.local` até você clicar em **Nova sessão**.

## 9. Como funciona

```
ícone ─► service worker ─► abre o painel (não captura)
"Iniciar" ─► tabCapture.getMediaStreamId ─► documento offscreen
offscreen: áudio da aba ─► AudioContext.destination (você continua ouvindo)
           └► PCM → WAV 16 kHz mono, trechos de 12 s, só com fala ─► POST /v1/transcribe
service worker (SessionManager): fala ─► /v1/topics (reutiliza assuntos) ─► /v1/claims ─► cartão ⏳
                    └► fila (3 em paralelo, timeout, cancelável) ─► /v1/check ─► ✓ ✕ ◐ ? !
painel: lê chrome.storage.local (abre instantâneo; não reinicia nada)
```

Módulos em `src/`: `audio-capture`, `transcription`, `topic-classifier`, `claim-extractor`, `fact-check-provider`,
`session-manager`, `sidepanel`, `shared` (schemas Zod/tipos), além de `background` e `offscreen`.
Backend em `server/src` (Fastify + TypeScript). Cada serviço é uma interface (`Transcriber`, `TopicClassifier`,
`ClaimExtractor`, `FactCheckProvider`) com implementação substituível.

### Prompts, harness e agentes

O backend usa o **Google Agent Development Kit (ADK)** com `LlmAgent` e `Runner`. Cada etapa é implementada como uma chamada ao `AdkGenerator` (que implementa a interface `TextGenerator`), que cria um agente efêmero por requisição. A checagem usa o `AdkFactCheckProvider` com `GOOGLE_SEARCH` built-in. Os prompts de runtime ficam nos serviços de `server/src/`; `server/src/prompts.ts` reúne regras comuns de segurança. A extensão, por meio do `SessionManager`, decide quando classificar assuntos, extrair afirmações e enfileirar checagens.

O harness é o código que envolve o modelo: rotas Fastify, contratos e validação Zod, preparação de contexto, limites de tokens, timeout, cancelamento, cache e tratamento de erros. A busca (Google Search Grounding) só é habilitada na etapa de checagem, em uma etapa de pesquisa separada da formatação do veredito. Os prompts em `.github/prompts/` orientam agentes de desenvolvimento e não são usados pelo backend em runtime.

## 10. Desenvolvimento e testes

```bash
npm test             # 95 testes (vitest)
npm run typecheck    # tsc --strict
npm run build        # gera dist/
npm run dev:server   # backend com recarga automática
npm run icons        # regenera os ícones em public/icons
```

Os testes locais validam os contratos do backend com doubles e não substituem o smoke test com a API real. Antes de
considerar a migração de provedor concluída, confirme transcrição e checagem grounded com uma chave fornecida pelo
operador; nunca inclua a chave em logs, documentação ou arquivos versionados. Os pontos de integração ADK ficam em
`server/src/adk-generator.ts` e `server/src/adk-fact-check-provider.ts`.
