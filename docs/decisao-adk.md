# Discussão sobre o uso do ADK no backend

**Data:** 12/10/2026

## Contexto

O backend do projeto foi migrado de OpenRouter para Google ADK. A conversa explorou se o ADK é uma boa direção considerando também o objetivo de estudar e ganhar experiência prática com essa tecnologia.

## Conclusão da exploração

O ADK é adequado para a camada de integração e orquestração de IA, mas não precisa ser entendido como substituto automático do servidor HTTP. A recomendação discutida foi preservar a API e os contratos existentes da extensão e avaliar mudanças de forma incremental, evitando reescrever componentes que não se beneficiem do runtime de agentes.

Esse princípio é compatível com a arquitetura atual: a extensão continua usando o backend HTTP, enquanto o ADK atende as tarefas de IA no servidor. Esta nota registra a conclusão da conversa; não propõe uma nova migração nem altera o escopo do backend já implementado.
