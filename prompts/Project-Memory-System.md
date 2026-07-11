SISTEMA DE MEMORIA DO PROJETO (PROJECT SNAPSHOT SYSTEM)

Este sistema mantem um registro estruturado e incremental das evidencias do projeto ao longo de todas as fases.

REGRA DE OURO

Nenhum prompt, gate, agente ou snapshot pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Garantir consistencia entre fases, evitar perda de contexto e impedir decisoes contraditorias.

O snapshot e fonte de evidencia e historico.
Ele nao e autoridade de transicao de estado.

---

1. ESTRUTURA DO SNAPSHOT

O snapshot deve conter:

* ESTADO ATUAL DECLARADO PELA STATE MACHINE
* FASE ATUAL
* ARQUITETURA DEFINIDA
* MODELO DE DADOS, se existir
* BACKEND IMPLEMENTADO, se existir
* FRONTEND IMPLEMENTADO, se existir
* DECISOES ARQUITETURAIS
* DEPENDENCIAS CRITICAS
* REGRAS DE NEGOCIO
* LIMITACOES CONHECIDAS
* DIVIDA TECNICA
* EVIDENCIAS DE CONCLUSAO

---

2. ATUALIZACAO OBRIGATORIA

Ao final de cada fase:

* O snapshot deve ser atualizado como registro.
* Novas decisoes devem ser adicionadas.
* Alteracoes devem ser registradas.
* Nenhuma informacao pode ser perdida.
* A alteracao de estado deve ser apenas registrada apos decisao da State Machine.
* State-Transition-Log.md deve ser atualizado quando houver decisao ou tentativa de transicao.

---

3. USO OBRIGATORIO

Antes de iniciar qualquer fase:

* Consultar Start-Here.md.
* Ler snapshot completo.
* Validar consistencia com o estado declarado pela State Machine.
* Confirmar compatibilidade com a fase solicitada.
* Consultar Prompt-Index.md.
* Consultar Current-State.md.
* Consultar Canonical-State-And-Module-IDs.md.
* Consultar Acceptance-Criteria-By-State.md.
* Consultar Evidence-Standard.md.
* Consultar Global-Definition-Of-Done.md.
* Consultar Module-Phase-Matrix.md quando houver modulo envolvido.
* Consultar Execution-Protocol.md.
* Consultar Conflict-Resolution-Policy.md quando houver conflito.
* Consultar Controlled-Rollback-Policy.md quando houver reversao solicitada.
* Consultar Blocked-State-Protocol.md quando houver bloqueio.
* Consultar Prompt-System-Audit.md quando houver mudanca de versao ou declaracao de ausencia de conflitos.

Se houver conflito:

* A fase deve ser pausada.
* O conflito deve ser reportado.
* Nenhuma implementacao deve continuar.
* A State Machine deve permanecer no estado atual ate decisao valida.

---

4. FORMATO DO SNAPSHOT

SNAPSHOT DO PROJETO

Estado atual declarado pela State Machine:
Fase atual:
Ultima atualizacao:

Arquitetura:

* resumo tecnico

Banco de dados:

* entidades existentes
* relacionamentos criticos

Backend:

* modulos implementados

Frontend:

* modulos implementados

Decisoes arquiteturais:

* lista de decisoes fixas

Dependencias:

* bibliotecas e requisitos

Evidencias:

* artefatos, arquivos, testes ou validacoes que comprovam conclusao

Pendencias:

* itens nao concluidos

Riscos:

* problemas identificados

---

5. REGRA DE CONSISTENCIA ABSOLUTA

E proibido:

* criar novas estruturas sem refletir no snapshot
* ignorar decisoes anteriores
* contradizer arquitetura ja definida
* avancar sem atualizacao do snapshot
* usar snapshot para alterar estado

---

6. REGRA FINAL DE CONTROLE

O snapshot registra a verdade observavel do projeto.
A State Machine e a unica autoridade para transicao de estado.
