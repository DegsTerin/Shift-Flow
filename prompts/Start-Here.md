START HERE - PROMPT SYSTEM ENTRYPOINT

REGRA DE OURO

Nenhum prompt, gate, agente, documento operacional, snapshot ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Este e o ponto de entrada oficial do sistema de prompts.
Sempre comece por este arquivo.

---

REGRA ANTI-OVERENGINEERING

Nao criar novo arquivo de controle se uma regra existente puder ser ajustada.
Nao criar novo gate se um gate existente puder validar o mesmo risco.
Nao criar novo estado se o fluxo atual ja comportar a execucao.
Nao criar novo modulo se ele for apenas uma variacao de modulo existente.

Antes de propor novo arquivo, responder:

* Qual conflito ou risco real ele resolve?
* Por que um arquivo existente nao basta?
* Qual custo operacional ele adiciona?
* Ele altera a State Machine? Se sim, bloquear e aplicar Conflict-Resolution-Policy.md.

---

MODOS DE EXECUCAO

MODO PADRAO:

Usar para fases, modulos, transicoes, bloqueios, rollback e mudancas de prompts.

MODO RESUMIDO:

Usar apenas para consulta simples, auditoria leve ou leitura sem alteracao.
Nao pode ser usado para alterar arquivos, executar fase, recomendar transicao, resolver bloqueio ou fazer rollback.

---

ARQUIVOS OBRIGATORIOS SEMPRE

* Start-Here.md
* Current-State.md
* Official-State-Machine.md
* System-Guard-Rails.md
* Prompt-Index.md

---

ARQUIVOS OBRIGATORIOS POR EXECUCAO DE FASE

* Execution-Protocol.md
* Prompt-System-Readme.md
* Allowed-Commands-By-State.md
* Project-Snapshot.md
* Project-Memory-System.md
* Canonical-State-And-Module-IDs.md
* Acceptance-Criteria-By-State.md
* Evidence-Standard.md
* Global-Definition-Of-Done.md
* Prompt da fase solicitada permitida pelo estado atual

---

ARQUIVOS OBRIGATORIOS POR MODULO

* Module-Phase-Matrix.md
* Prompt do modulo

---

ARQUIVOS OBRIGATORIOS POR EXCECAO

Conflito:

* Conflict-Resolution-Policy.md

Bloqueio:

* Blocked-State-Protocol.md

Rollback:

* Controlled-Rollback-Policy.md

Handoff:

* Phase-Handoff-Template.md

Mudanca em prompts:

* Prompt-System-Version.md
* Prompt-System-Versioning-Policy.md
* Prompt-System-Change-Log.md

Auditoria do sistema de prompts:

* Prompt-System-Audit.md

---

FLUXO RAPIDO

1. Ler Start-Here.md.
2. Consultar Current-State.md.
3. Confirmar comando permitido em Allowed-Commands-By-State.md.
4. Consultar Official-State-Machine.md.
5. Executar apenas a fase ou tarefa permitida.
6. Validar com gates.
7. Atualizar snapshot e logs quando aplicavel.

---

REGRA FINAL

Se houver duvida, nao criar novo controle.
Aplicar a hierarquia existente e registrar o conflito.
