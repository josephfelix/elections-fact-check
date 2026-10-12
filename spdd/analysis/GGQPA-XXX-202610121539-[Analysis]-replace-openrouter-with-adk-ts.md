# SPDD Analysis: Replace OpenRouter with Google ADK for TypeScript

## Original Business Requirement

### Why

O backend usa OpenRouter como proxy para Gemini + busca web, mas o projeto quer adotar o **Google Agent Development Kit (ADK) para TypeScript** (`@google/adk`) — eliminando o intermediário e aprendendo a orquestração de agentes diretamente com o SDK oficial do Google.

### What Changes

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

### Capabilities

Nenhuma. Esta mudança não introduz comportamento observável novo para a extensão Chrome.

## Domain Concept Identification

### Existing Concepts (from codebase)

- **Fact-check:** avaliação de uma afirmação contextualizada, com veredito, resumo, evidências e limitações. O provider existente reconcilia o veredito com citações e reduz a conclusão para insuficiente quando não há fontes citáveis.
- **Text generation:** capacidade comum usada por transcrição, classificação de tópicos, extração de afirmações e checagem. A interface compartilhada mantém esses consumidores independentes do fornecedor de modelo.
- **Transcription:** conversão de áudio em português em texto, com tratamento explícito para ausência de fala.
- **Citation/evidence:** fontes ligadas à resposta sustentam o resultado de fact-check; evidência não deve ser fabricada a partir de texto livre do modelo.
- **Configuration and backend health:** configuração do provedor é privada ao backend e a saúde do serviço expõe se a capacidade está configurada sem revelar credenciais.
- **Cache:** resultados de checagem podem ser reutilizados por um período configurável.

### New Concepts Required

- **ADK-backed generation:** adaptador que preserva o contrato de geração existente enquanto passa a usar o SDK Google.
- **Google Search grounded fact-check:** provedor de checagem que associa respostas do modelo a fontes recuperadas pela busca, preservando as regras de reconciliação atuais.

### Conceptual Relationships

O backend recebe áudio, transcrição ou afirmações e os encaminha às capacidades de domínio. Geração de texto é compartilhada pelas capacidades que não exigem busca; checagem usa geração com busca e grounding para produzir evidências. Configuração e credenciais pertencem ao backend, enquanto a extensão continua consumindo os mesmos contratos HTTP.

### Key Business Rules

- Trocar o fornecedor não deve mudar o comportamento visível nem os contratos consumidos pela extensão.
- Credenciais Google permanecem somente no backend e são fornecidas por ambiente, nunca embutidas em código ou enviadas à extensão.
- Fontes citáveis devem vir dos resultados de grounding; sem evidências citáveis, uma conclusão afirmativa ou contraditória não pode ser apresentada como verificada.
- A checagem deve manter sua política de cache e os erros de provedor devem continuar observáveis por respostas HTTP apropriadas.
- A transcrição deve continuar fiel ao áudio em português, sem obedecer a instruções presentes no conteúdo falado.

## Strategic Approach

### Solution Direction

Substituir o provedor externo sem reestruturar os fluxos de domínio: manter os contratos internos e HTTP, migrar a configuração para Google/Gemini, e fazer o backend usar ADK para geração e busca grounded. O fact-check deve continuar apoiado nas regras de reconciliação e cache já existentes. A extensão Chrome e os endpoints permanecem fora da mudança.

### Key Design Decisions

- **Preservar as interfaces e os contratos externos:** reduz risco de regressão para classificação, extração, transcrição e extensão; recomenda-se como limite central da migração.
- **Separar geração genérica de fact-check grounded:** evita que busca e transformação de citações se espalhem pelas capacidades sem busca. O design descreve um provider específico, mas as tarefas também atribuem busca ao adaptador genérico; essa sobreposição deve ser resolvida antes de consolidar a implementação.
- **Manter as regras existentes de reconciliação e cache:** reduz alteração de comportamento e preserva a regra de segurança para resultados sem fontes; recomenda-se reutilizar a lógica existente.
- **Migrar credenciais e parâmetros de ambiente sem expô-los:** simplifica a configuração do backend, mas exige atualizar documentação e manter mensagens/health sem vazar segredos.
- **Validar a integração real antes de remover o cliente anterior:** melhora a reversibilidade, porém depende de uma estratégia explícita para smoke test com credencial válida e segura.

### Alternatives Considered

- **Reescrever todos os consumidores para ADK diretamente:** rejeitada no design por ampliar o escopo e acoplar módulos de domínio ao fornecedor; preservar `TextGenerator` é mais compatível com a arquitetura observada.
- **Continuar com OpenRouter:** mantém o proxy e não atende ao objetivo declarado de adotar o SDK oficial Google.
- **Usar o adaptador genérico também como provider de busca:** aparece como possibilidade nas tarefas, mas conflita com a decisão de um provider dedicado e torna ambígua a propriedade do mapeamento de fontes; não deve ser adotada sem alinhar os artefatos.

## Risk & Gap Analysis

### Requirement Ambiguities

- **Responsabilidade por Google Search:** design e tasks divergem quanto a concentrar busca/citações no provider dedicado ou também no gerador genérico; confirmar uma única fronteira.
- **“Os testes existentes” como gate:** a proposta exclui testes novos, mas não explicita como verificar comportamentos específicos da nova integração ADK sem credenciais externas.
- **Critério de remoção do OpenRouter:** a remoção depende de smoke test, mas não há critério de aceite definido para sucesso, falha ou indisponibilidade da credencial real.
- **Versão/API do ADK:** o design cita instabilidade da versão `0.1.x`, enquanto a dependência atualmente declarada no manifesto observado é `^2.2.1`; revisar a premissa de risco e validar contra a versão efetivamente usada.

### Edge Cases

- O modelo responde sem texto final, com JSON inválido ou sem metadados de grounding.
- O grounding retorna fontes repetidas, incompletas ou URLs inválidas; a evidência final não pode tratá-las como fontes confiáveis por inferência.
- O cliente cancela a requisição ou o tempo limite expira durante a execução do ADK.
- Áudio chega em um MIME/encoding não suportado, ou não contém fala inteligível.
- A chave está ausente ou inválida: health, erro HTTP e logs devem continuar sem revelar credenciais.
- Requisições simultâneas não podem compartilhar sessão ou contexto acidentalmente.

### Technical Risks

- **Formato e ciclo de vida dos eventos ADK:** extração de texto final e metadados de grounding pode divergir do pressuposto do adaptador; validar o resultado em execução e cobrir respostas sem grounding.
- **Citações insuficientes ou incorretas:** pode comprometer a confiança do fact-check; preservar a reconciliação existente e verificar que somente URLs grounded válidas entram na evidência.
- **Cancelamento e timeout:** se o runner não respeitar o sinal de abort, requisições abandonadas podem consumir recursos; confirmar comportamento sob cancelamento e timeout.
- **Mudança de configuração/documentação:** referências OpenRouter podem persistir depois do wiring alterado, confundindo operação e suporte; manter config, README, exemplo de ambiente e mensagens alinhados.
- **Testes atuais cobrem principalmente contratos e mocks:** a troca de SDK pode compilar sem provar suporte real a áudio ou grounding; separar validação automatizada determinística de smoke test externo.
- **Compatibilidade da versão:** o risco do design está baseado numa versão diferente da atualmente declarada; decisões de API e mitigação podem estar desatualizadas.

### Acceptance Criteria Coverage

Os artefatos de planejamento definem 12 tarefas verificáveis, mas não uma lista autônoma de critérios de aceite. A tabela mapeia os grupos de tarefas para os resultados esperados; o estado observado do OpenSpec marca 0/12 tarefas como concluídas.

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | Adotar dependências/configuração Google e atualizar documentação. | Partial | Manifesto e configuração já mostram dependência e vars Google; consistência de toda documentação ainda precisa de validação. |
| 2 | Implementar geração ADK com entrada textual e áudio e estado de configuração. | Partial | Implementação existe no worktree observado; os testes atuais exercitam o consumidor por mock, não a conversão e execução reais no ADK. |
| 3 | Usar Google Search Grounding e converter fontes em citações para fact-check. | Partial | Provider dedicado existe, mas a responsabilidade também é atribuída ao gerador em uma tarefa; grounding real não está validado. |
| 4 | Preservar cache TTL e reconciliação de veredito/evidências. | Yes | Há implementação existente reutilizada; falta evidência de teste específico cobrindo o novo caminho ADK. |
| 5 | Trocar o wiring do backend sem alterar interfaces e endpoints. | Partial | `index.ts` já aponta para as classes ADK; execução dos quality gates não foi demonstrada nesta análise. |
| 6 | Confirmar health e transcrição/checagem com a API real. | Partial | Health e contratos têm testes mockados; o smoke test real permanece pendente e requer credencial protegida. |
| 7 | Remover OpenRouter após validação sem regressões. | Partial | `openrouter.ts` e testes associados ainda existem; a condição de remoção depende do smoke test pendente. |
| 8 | Manter a extensão sem acesso direto a credenciais/API Google e contratos HTTP inalterados. | Yes | É compatível com o desenho e as verificações existentes; validar após a implementação completa. |

