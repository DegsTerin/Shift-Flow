MODULO: MOD-09 DASHBOARD_EXECUTIVO

REGRA DE OURO

Nenhum prompt pode criar ou alterar estado. Apenas a State Machine pode.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


NATUREZA DO PROMPT

Este prompt e um modulo funcional.
Ele nao e estado da State Machine.
Ele so pode ser executado dentro da camada permitida pelo estado atual.

ANTES DE EXECUTAR:

* Consultar Start-Here.md.
* Consultar Prompt-System-Readme.md.
* Consultar Prompt-Index.md.
* Consultar Current-State.md.
* Consultar Project-Snapshot.md.
* Consultar Project-Memory-System.md.
* Consultar Canonical-State-And-Module-IDs.md.
* Consultar Allowed-Commands-By-State.md.
* Consultar Acceptance-Criteria-By-State.md.
* Consultar Execution-Protocol.md.
* Consultar Evidence-Standard.md.
* Consultar Global-Definition-Of-Done.md.
* Consultar Module-Phase-Matrix.md.
* Consultar Blocked-State-Protocol.md se houver bloqueio.

---

QUEBRA POR FASE

DATABASE_MODELING:

* Definir entidades, views ou campos necessarios para KPIs.
* Definir indices para consultas do dashboard.
* Nao criar backend ou frontend.

BACKEND_IMPLEMENTATION:

* Criar endpoints e services de KPIs.
* Implementar filtros e agregacoes.
* Garantir RBAC e multiempresa.
* Expor agregacoes por equipe, cliente, turno, prioridade e evolucao temporal.
* Expor indicadores de SLA em risco e atividades criticas.
* Nao criar componentes React.
* Nao alterar schema.

FRONTEND_IMPLEMENTATION:

* Criar componentes React do dashboard.
* Criar filtros, cards, graficos e lista operacional.
* Criar visao executiva com totalizadores e graficos corporativos.
* Criar modo TV/monitoramento com cards grandes, tela limpa e auto refresh.
* Nao alterar APIs.
* Nao alterar banco.

INTEGRATION:

* Conectar UI aos endpoints existentes.
* Validar filtros, contratos e dados em tempo real.
* Validar consistencia entre KPIs, graficos, lista operacional e kanban.
* Validar auto refresh no modo monitoramento.
* Nao criar novas regras de negocio.

---

REQUISITOS FUNCIONAIS

Inspirado em:

* Splunk
* ServiceNow
* Jira

KPIs:

* Total de atividades
* Pendentes
* Em andamento
* Finalizadas
* Criticas
* SLA em risco

Graficos:

* Atividades por equipe
* Atividades por cliente
* Atividades por prioridade
* SLA por equipe
* Incidentes por turno
* Evolucao temporal
* Produtividade por analista

Lista operacional em tempo real.

Modo TV/monitoramento:

* Auto atualizacao
* Tela limpa
* Cards grandes
* Atividades criticas destacadas
* SLA em risco destacado
* Kanban ou lista operacional em tempo real quando aplicavel

Filtros:

* Equipe
* Analista
* Cliente
* Prioridade
* Status
* Turno
* Data inicial
* Data final

---

FORMATO PADRAO DE ENCERRAMENTO

STATUS:
CONCLUIDO:
NAO CONCLUIDO:
EVIDENCIAS:
DEPENDENCIAS:
RISCOS:
BLOQUEIOS:
PROXIMA ACAO:
TRANSICAO DE ESTADO:

TRANSICAO DE ESTADO e apenas recomendacao.
A State Machine decide a transicao real.
