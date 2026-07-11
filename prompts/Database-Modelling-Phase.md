PROMPT DE FASE DATABASE MODELING

PAPEL OPERACIONAL:

Atue como DBA Senior.

---

ESTADO DA STATE MACHINE:

STATE-03 DATABASE_MODELING

REGRA DE OURO:

Nenhum prompt pode criar ou alterar estado. Apenas a State Machine pode.

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---

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
* Consultar Module-Phase-Matrix.md para modulos que tenham parte de banco.
* Consultar Blocked-State-Protocol.md se houver bloqueio.

Crie toda a modelagem PostgreSQL utilizando Prisma.

Entidades obrigatorias:

* Companies
* Clients
* Teams
* Shifts
* Users
* Roles
* Permissions
* Activities
* ActivityHistory
* Comments
* Attachments
* Notifications
* ShiftReports
* AuditLogs

Requisitos:

* Multiempresa
* Multicliente
* Multi-equipe
* Multi-turno
* Atividade como dossie operacional completo
* Historico operacional imutavel/append-only
* Auditoria e soft delete sem perda de informacao

Atividade deve contemplar, quando aplicavel:

* ID
* Titulo
* Cliente
* Sistema
* Servico
* Equipe
* Turno
* Responsavel
* Status
* Prioridade
* Descricao inicial
* O que foi identificado
* O que foi realizado
* O que esta pendente
* Proximas acoes
* Resultado final
* Criado por/data criacao
* Ultima alteracao por/ultima alteracao em
* Excluido por/data exclusao

ActivityHistory deve armazenar:

* Usuario
* Data e hora
* Tipo de acao
* Conteudo registrado
* Valor anterior e valor novo quando aplicavel

Implementar:

* Chaves estrangeiras
* Indices
* Constraints
* Soft Delete
* Auditoria
* Indices para filtros por cliente, sistema, equipe, turno, responsavel, prioridade, status, datas e texto pesquisavel quando aplicavel

Entregue:

* Schema Prisma completo
* Explicacao dos relacionamentos
* Arquivos de migration de dominio, quando aplicavel
* Estrategia de migracao

Ao final informe no formato padrao:

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


PROIBICOES DA FASE 02

E estritamente proibido:

* Criar package.json
* Instalar dependencias
* Executar Prisma CLI para setup ou comandos fora de migration de dominio
* Aplicar migrations em ambiente de integracao ou producao
* Criar config de runtime
* Ajustar ambiente
* Criar backend ou frontend

E permitido:

* Criar ou alterar apenas o schema Prisma.
* Criar migrations de dominio.
* Executar Prisma CLI apenas para validar schema e gerar migration sem aplicar em ambiente final.
* Descrever estrategia de migracao.

A Fase 02 e exclusivamente modelagem de dados.
