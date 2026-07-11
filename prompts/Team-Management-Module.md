MODULO: MOD-03 TEAMS / GESTAO DE EQUIPES

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

* Definir entidades, relacionamentos e constraints de equipes.
* Modelar lider, membros, turnos vinculados e soft delete.
* Nao criar backend ou frontend.

BACKEND_IMPLEMENTATION:

* Criar APIs de criar, editar, inativar e excluir logicamente equipe.
* Criar regras para movimentar analistas entre equipes.
* Aplicar RBAC e multiempresa.
* Nao alterar schema.
* Nao criar frontend.

FRONTEND_IMPLEMENTATION:

* Criar telas e componentes de gestao de equipes.
* Criar fluxos visuais de movimentacao de analistas.
* Nao alterar APIs.
* Nao alterar banco.

INTEGRATION:

* Conectar telas aos endpoints existentes.
* Validar criacao, edicao, inativacao, exclusao logica e movimentacao.
* Nao criar novas regras de negocio.

---

REQUISITOS FUNCIONAIS

Permitir:

* Criar equipe
* Editar equipe
* Inativar equipe
* Excluir logicamente
* Movimentar analistas entre equipes

Campos:

* Nome
* Descricao
* Cor
* Lider
* SLA padrao
* Turnos vinculados

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
