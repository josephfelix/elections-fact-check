# FactCheck Live — visão visual

## Componentes e fluxo

```mermaid
flowchart LR
    U[Usuário] -->|clica na extensão e inicia| P[Painel lateral React]
    P <-->|comandos e estado| SW[Service worker]
    SW -->|solicita permissão de aba| TC[Chrome tabCapture]
    TC --> OF[Documento offscreen]
    OF -->|reproduz áudio normalmente| A[Saída de áudio]
    OF -->|trechos WAV com fala| B[Backend local Fastify]
    B -->|transcrição, assuntos e afirmações| OR[Gemini API / modelo]
    B -->|checagem automática e busca web| OR
    OR -->|texto e citações| B
    B -->|JSON validado| SW
    SW -->|persiste sessão| ST[chrome.storage.local]
    ST --> P
    P -->|ação manual do usuário| G[Google AI Mode no navegador]
```

## Harness e chamadas ao modelo

```mermaid
flowchart TD
    SM[SessionManager na extensão<br/>orquestração por regras] -->|texto novo| TOP[Prompt: classificar assuntos]
    TOP -->|JSON validado| CLAIM[Prompt: extrair afirmações]
    CLAIM -->|factual| Q[Fila limitada de checagens]
    Q --> CHECK[Prompt: checar afirmação]
    AUDIO[Áudio recebido pela API] --> TRANSCRIBE[Prompt: transcrever]
    TRANSCRIBE -->|texto| SM
    TOP --> H[Harness do backend]
    CLAIM --> H
    CHECK --> H
    TRANSCRIBE --> H
    H -->|validação, limites, timeout,<br/>cancelamento e erros| OR[Gemini API / modelo]
    CHECK -->|plugin web explícito| WEB[Busca web]
    WEB --> OR
```

**Leitura do diagrama:** os prompts definem tarefas individuais. A sequência é definida pelo código da extensão e do backend, não planejada autonomamente pelo modelo. O harness é a camada de código que prepara, limita, valida e integra as chamadas. A busca web só é solicitada na checagem factual.

## Ciclo de execução local

```mermaid
flowchart TD
    R[Node.js 22.9+ e npm] --> I[npm install]
    I --> E[Configurar .env e GOOGLE_API_KEY]
    E --> S[npm run server]
    I --> C[npm run build]
    C --> D[Carregar dist/ em chrome://extensions]
    S --> H[Conferir backend conectado no painel]
    D --> T[Selecionar aba e iniciar monitoramento]
    H --> T
    T --> X[Pausar ou encerrar pelo painel]
```

## Confiança e limites

```mermaid
flowchart LR
    L[Execução local] -->|áudio e texto saem da máquina| O[Google AI e provedores]
    O --> W[Busca web]
    W --> R[Fontes e veredito sujeitos a erro]
    R --> V[Revisão humana necessária]
    DRM[Proteção DRM] -. pode impedir .-> L
```

**Resumo:** fácil de experimentar para quem conhece npm e extensões unpacked; não é inteiramente local. Requer chave e pode gerar custos. Use apenas com conteúdo que possa ser enviado aos provedores externos, limite gastos e confira as fontes. O modo automático não é o Google AI Mode.
