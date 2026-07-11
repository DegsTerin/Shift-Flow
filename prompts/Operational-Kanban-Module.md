MODULO: MOD-10 KANBAN_OPERACIONAL

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

* Garantir campos de status, prioridade, SLA e historico.
* Garantir status Pendente, Em Andamento, Aguardando Cliente, Aguardando Terceiros, Monitoramento, Finalizada e Cancelada.
* Definir indices para filtros e ordenacao.
* Nao criar backend ou frontend.

BACKEND_IMPLEMENTATION:

* Criar endpoints para listar, mover e atualizar atividades.
* Registrar historico de movimentacao.
* Registrar timeline append-only para comentario, atualizacao, mudanca de status, mudanca de responsavel, anexo, exclusao, reabertura e encerramento.
* Calcular ou expor prioridade e SLA conforme regra definida.
* Implementar filtros e busca por ID, cliente, sistema, equipe, responsavel, status e texto livre quando previsto pelo contrato.
* Nao criar UI.
* Nao alterar schema.

FRONTEND_IMPLEMENTATION:

* Criar quadro Kanban corporativo.
* Implementar drag and drop.
* Exibir cartoes e colunas.
* Exibir modal/drawer de detalhes com resumo, dados principais, descricao completa, historico, anexos, auditoria e acoes permitidas.
* Criar modo monitoramento para TV com atualizacao automatica e destaque de atividades criticas/SLA em risco.
* Nao alterar APIs.
* Nao alterar banco.

INTEGRATION:

* Conectar drag and drop aos endpoints existentes.
* Validar atualizacao em tempo real.
* Validar historico e SLA ponta a ponta.
* Validar filtros simultaneos, busca global, detalhe de registro e preservacao do historico.

---

REQUISITOS FUNCIONAIS

Colunas:

* Pendente
* Em Andamento
* Aguardando Cliente
* Aguardando Terceiros
* Monitoramento
* Finalizada
* Cancelada

Implementar:

* Drag and Drop
* Atualizacao em tempo real
* Prioridade automatica
* SLA
* Historico operacional imutavel
* Filtros reais
* Busca global
* Detalhe em modal/drawer
* Reabertura e encerramento quando permitidos

Cada cartao deve possuir:

* ID
* Cliente
* Sistema
* Equipe
* Responsavel
* Prioridade
* Status
* SLA
* Ultima atualizacao

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
