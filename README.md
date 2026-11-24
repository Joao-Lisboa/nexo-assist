# Nexo Assist

Agent de atendimento do service desk de TI da Nexo. O funcionário descreve o problema num chat, e o agent decide o que fazer: responder uma dúvida pela central de ajuda, consultar ou complementar um chamado, abrir um chamado novo (sempre com confirmação) ou chamar um analista. Do outro lado, o analista tem um console para assumir as conversas transferidas.

**O ponto central da entrega é a transparência.** Acima de cada resposta aparecem as ações que o agent executou (_consultou seus chamados · classificou a prioridade · montou o rascunho_). Em **"Por que fiz isso?"** dá para ver o que ele entendeu, a intenção, a confiança, a ação tomada, o motivo, as regras do service desk aplicadas e cada consulta, com entrada, saída e tempo.

---

## Como rodar

Requisitos: **Node.js 20.9+** e uma chave da API do Gemini (gratuita em [aistudio.google.com](https://aistudio.google.com) → _Get API key_).

```bash
npm install
cp .env.example .env        # no Windows: copy .env.example .env
# edite .env e preencha GOOGLE_GENERATIVE_AI_API_KEY
npm run dev
```

Abra <http://localhost:3000>. Os bancos SQLite são criados em `./data` na primeira execução, já com os dados de exemplo.

| Perfil | E-mail | Para ver |
|---|---|---|
| Funcionária | `ana.souza@nexo.com.br` | Chat: tem chamados abertos, um vencido, um resolvido há 4 dias |
| Analista N2 | `rafael.lima@nexo.com.br` | Console com conversas transferidas |
| Analista N1 | `julia.costa@nexo.com.br` | Mesmo console, para testar dois analistas |

**Qualquer senha funciona.** A tela de login tem atalhos para esses usuários. Outros funcionários: `carla.mendes`, `bruno.tavares`, `diego.ramos`, `elisa.prado`, `fabio.nunes`, `gabriela.rocha` (todos `@nexo.com.br`).

### Roteiro de teste sugerido (como Ana)

1. _"Qual o status do meu chamado?"_ → seletor com os 3 abertos → escolha o INC-20311 → card com **prazo vencido** e oferta de analista.
2. _"Meu notebook não conecta na VPN desde ontem. Aparece o erro 809."_ → o agent busca a central, percebe que o artigo vale só para Windows 10 (o da Ana é Windows 11) e pergunta quem é afetado.
3. _"Só eu. Tenho reunião às 14h."_ → rascunho com **prioridade alta** calculada pela regra → **Confirmar** (ou ⌘/Ctrl+Enter, ou responder "sim").
4. _"Quero falar com um analista"_ → conversa transferida e agent pausado. Entre como Rafael em outra janela anônima, **assuma**, responda e **devolva ao agent**.
5. Para ver as recusas: _"Como está o INC-20325?"_ (chamado de outra pessoa) ou _"Como peço férias?"_ (fora de TI).

### Outros comandos

```bash
npm test            # 33 testes: regras do service desk e fluxos completos da conversa (sem LLM)
npm run eval        # 13 cenários com o modelo de verdade; gera docs/avaliacao.md
npm run typecheck   # TypeScript estrito
npm run lint
npm run db:reset    # apaga os bancos; na próxima execução são recriados com os dados de exemplo
```

---

## Arquitetura

```
src/
├── app/                    Interface (Next.js App Router) e rotas da API
│   ├── login, chat, perfil, console
│   └── api/                auth · chat (SSE) · drafts · console
├── components/             Chat, cards, painel de decisão, console do analista
├── agent/                  O agent (Mastra)
│   ├── tools.ts            8 ferramentas tipadas com Zod
│   ├── instructions.ts     papel, regras e guia de decisão + contexto do turno
│   ├── turn.ts             estado do turno e registro de cada passo
│   └── runner.ts           porta AgentRunner + implementação Mastra/Gemini
├── server/                 Aplicação
│   ├── conversation-service.ts   orquestra a conversa ao redor do agent
│   ├── console-service.ts        fila, assumir, devolver, encerrar
│   ├── auth.ts, db/, seed.ts, views.ts
├── services/               "Sistemas externos"
│   ├── tickets/            sistema de chamados legado simulado (banco próprio)
│   └── knowledge/          central de ajuda
└── domain/                 Regras puras: horário útil, SLA, prioridade, duplicidade
```

**Fluxo de uma mensagem:** `POST /api/chat/messages` → `ConversationService` verifica estado, limite e ritmo → monta o turno (identidade, dependências, rascunho pendente) → `MastraAgentRunner` chama o Gemini com as ferramentas → as ferramentas consultam o serviço de chamados e a central e registram cada passo → o serviço aplica as redes de segurança, grava a resposta com o rastro de decisão e transmite tudo por **Server-Sent Events** (passos e texto em tempo real).

**Separação de responsabilidades:**

- **Interface** só conversa com a API.
- **Agent** só alcança o mundo pelas ferramentas.
- **Serviço de chamados**: banco SQLite próprio (`data/tickets.db`), API com escopo por solicitante, latência e falhas simuladas. Fica separado da aplicação (`data/app.db`), como um sistema externo de verdade.
- **Regras do domínio**: funções puras e testadas.

**Persistência:** conversas, mensagens (com blocos e rastro), rascunhos, chamados e o estado de cada conversa (`agent`, `waiting_human`, `human`, `closed`) ficam em SQLite (libSQL + Drizzle) e sobrevivem a reinícios. O funcionário volta outro dia e continua de onde parou.

---

## Como o agent decide

Cada mensagem passa por três camadas.

**1. O modelo interpreta e escolhe a ação.** A primeira ferramenta de todo turno é `registrar_entendimento`: o modelo registra o que entendeu, a intenção (dúvida, consulta, complemento, abertura, analista, fora de escopo), a **confiança** de que a ação escolhida é a certa e o porquê. As instruções trazem um guia por intenção e o contexto do turno: nome, área, **equipamento**, horário e se há rascunho pendente. É por saber o equipamento que o agent percebe que o artigo do erro 809 não se aplica ao Windows 11.

| Ferramenta | O que faz |
|---|---|
| `consultar_chamados` | Lista os chamados do funcionário com situação de prazo; pode exibir o seletor |
| `consultar_chamado` | Card de um chamado (aceita só os dígitos), histórico e prazo |
| `buscar_central_de_ajuda` | Busca artigos e cita a fonte na resposta |
| `preparar_rascunho_chamado` | Verifica duplicidade, **calcula** prioridade e prazo e mostra o rascunho |
| `preparar_atualizacao_chamado` | Rascunho para complementar um chamado aberto ou reabrir um resolvido há até 7 dias |
| `transferir_para_analista` | Transfere com motivo e resumo do caso |
| `mostrar_opcoes` | Botões de resposta rápida |

**2. As regras ficam no código, não no prompt.** O modelo não consegue contorná-las:

- **Privacidade:** a identidade vem do `RequestContext` preenchido pelo servidor, nunca de um argumento do modelo. O serviço de chamados filtra por solicitante, e chamado de outra pessoa aparece como "não encontrado".
- **Prioridade e prazo:** o modelo informa os *sinais* (quem é afetado, se impede de trabalhar, se há compromisso hoje). A prioridade sai de `classifyPriority`, e o prazo, do cálculo de horas úteis (seg–sex, 8h–18h; crítico com 1 h corrida).
- **Duplicidade:** checada dentro da ferramenta de rascunho. Se já existe chamado aberto sobre o mesmo problema, ela devolve esse chamado em vez de criar outro rascunho.
- **Confirmação:** as ferramentas só montam *rascunhos*. Criar, atualizar e reabrir acontecem quando o funcionário clica em **Confirmar** ou responde "sim". Esse caminho não passa pelo modelo.

**3. Redes de segurança depois do modelo**, no `ConversationService`:

- Conversa com analista (`waiting_human` ou `human`) → **o agent nem é chamado**.
- Pedido explícito por uma pessoa ("quero falar com um analista") → transferência imediata **sem passar pelo modelo**. Funciona mesmo com o LLM fora do ar.
- Confiança **< 40%** sem pergunta de esclarecimento → transferência automática ("Agent pediu ajuda · confiança 41%" no console).
- Card de chamado **vencido** sem oferta de analista → as opções são adicionadas.
- Chamado **crítico** confirmado → transferência imediata para o plantão (N2).
- Limite de **30 mensagens por sessão**, **10 mensagens por minuto** por pessoa e **orçamento diário** de respostas do agent.

Tudo isso aparece no painel de decisão, na seção "Regras do service desk aplicadas".

---

## Como garanti a qualidade das decisões

1. **Testes determinísticos (`npm test`, 33 testes, sem LLM).**
   - Regras: horário útil (fim de semana, virada de expediente), SLA e chamado vencido, prioridade por impacto e urgência, duplicidade, janela de reabertura.
   - Integração do `ConversationService` com um **agent roteirizado que chama as ferramentas reais** num banco temporário: confirmação antes de criar, "sim" por texto, duplicidade, privacidade, chamado vencido, transferência pausando o agent e retomando com a fala do analista no histórico, confiança baixa, caso crítico, sistema de chamados fora do ar (503 com o rascunho preservado), limite de mensagens e concorrência entre analistas.
2. **Avaliação com o modelo de verdade (`npm run eval`).** São 13 cenários que cobrem as histórias do PRD. Cada um verifica o *resultado observável* do turno (blocos exibidos, transferência e motivo, rascunho e prioridade, intenção registrada), e não o texto, que varia entre execuções. O script gera `docs/avaliacao.md` com aprovação, intenção, confiança e tempo por cenário. Use-o como regressão ao mexer no prompt ou trocar de modelo.
3. **Rastro de cada resposta** gravado com a mensagem. Dá para auditar qualquer decisão depois, pelo funcionário ou pelo analista no console.

---

## Escolha do modelo

**Google Gemini 3.8 Flash** (configurável em `LLM_MODEL`), via `@ai-sdk/google` no Mastra.

- **Custo e velocidade:** é um modelo rápido e barato com bom *tool calling*. O PRD pede uso consciente do modelo pensando em custo por conversa. O "raciocínio" fica no nível baixo (`LLM_THINKING_LEVEL=low`), porque as decisões difíceis já estão nas ferramentas.
- **Plano gratuito** no AI Studio: quem avalia consegue rodar sem cartão.
- **Resiliência:** se o modelo principal estiver sobrecarregado (503), sem cota (429) ou indisponível (404), o agent tenta os modelos de `LLM_FALLBACK_MODELS`. Ele só troca de modelo se nada aconteceu no turno ainda, para não repetir ações. Modelo que não começa a responder em 15 s também é trocado, e quem falhou vai para o fim da fila por 3 minutos, para as mensagens seguintes não esperarem por ele de novo. Se todos falharem, a resposta oferece "Tentar de novo", que repete a pergunta original, e "Falar com um analista", que não depende do modelo. O modelo que respondeu aparece no painel de decisão.
- Comecei com o Gemini 2.5 Flash, mas o Google o retirou para contas novas (erro 404 pedindo o 3.8 Flash). Por isso o modelo é configurável e o runner trata as duas famílias: nível de raciocínio no 3.x, orçamento de tokens no 2.5.
- **Trocar de provedor** é trocar o modelo em `src/agent/runner.ts`. O resto do sistema depende só da interface `AgentRunner`.

Outras medidas de custo:

- Janela de histórico de 16 mensagens, com anotações curtas do que a interface mostrou em vez de reenviar os resultados das ferramentas.
- Central de ajuda por palavras-chave, sem embeddings.
- Confirmações e cancelamentos resolvidos sem LLM.
- Contagem de tokens visível em cada resposta.

---

## Principais trade-offs

- **Next.js monolítico em vez de backend separado.** Interface, API e agent num processo só deixam o projeto rodando com `npm install && npm run dev`. A separação é de módulos (`agent`, `server`, `services`, `domain`), não de processos. O serviço de chamados, por exemplo, tem banco e API próprios e pode virar um serviço HTTP sem mudar o agent.
- **SQLite em vez de Postgres:** zero infraestrutura para rodar localmente. Em produção com várias instâncias, Postgres (ou Turso, com o mesmo cliente libSQL).
- **Histórico gerenciado pela aplicação em vez da memória do Mastra:** controle exato do que vai para o modelo (custo) e um único lugar com conversas, rastros e estado de atendimento.
- **Polling (4 s) para o console e para mensagens do analista em vez de WebSocket:** simples e suficiente para o volume; as respostas do agent já usam streaming.
- **Rascunho por botão *ou* por "sim" no texto:** mais natural, mas o "sim" só confirma com um rascunho pendente e só para respostas afirmativas curtas (regex), nunca por interpretação do modelo.
- **Retry do sistema legado na criação:** a falha simulada acontece antes da escrita, então repetir é seguro. Num sistema real eu usaria uma chave de idempotência.
- **Autenticação simulada** (qualquer senha), como o PRD permite. A sessão é um cookie HttpOnly assinado com HMAC.

## O que eu faria com mais tempo

- Rodar a avaliação no CI a cada mudança de prompt, com mais cenários e conversas mais longas, e comparar modelos (Flash, Flash-Lite, outros provedores) em acerto × custo × latência.
- Busca semântica na central de ajuda quando a base crescer.
- Feedback do funcionário e do analista em cada resposta (útil/não útil) para alimentar a avaliação.
- WebSocket ou SSE também para o console e para as mensagens do analista.
- Atribuição automática por fila (N1/N2), notificações e métricas: taxa de resolução sem fila, tempo até o primeiro contato humano, custo por conversa.
- Deploy com Postgres/Turso, rate limit distribuído (Redis) e observabilidade (traces do Mastra).

## Deploy

Não publiquei uma versão. Para publicar (por exemplo no Railway ou no Render, que mantêm disco persistente para o SQLite):

1. Configure `GOOGLE_GENERATIVE_AI_API_KEY`, `SESSION_SECRET` e `DATA_DIR` (apontando para o volume persistente) como variáveis de ambiente da plataforma. As chaves nunca ficam no código.
2. Ajuste `MAX_AGENT_TURNS_PER_DAY` e use uma chave com cota limitada no Google AI Studio, para evitar abuso e custo inesperado. O limite de 30 mensagens por sessão e de 10 por minuto por pessoa já vem ativo.
3. Rode `npm run build && npm start`.

Na Vercel, o sistema de arquivos não é persistente: seria preciso trocar o SQLite local por Turso (mesmo cliente libSQL; só muda a URL).
