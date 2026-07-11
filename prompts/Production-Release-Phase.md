ESTADO: STATE-08 PRODUCTION_RELEASE

REGRA DE OURO

Nenhum prompt pode criar ou alterar estado. Apenas a State Machine pode.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


ESCOPO

Preparar e registrar a liberacao final do projeto.

Esta fase so pode ocorrer apos STATE-07 TESTING_HOMOLOGATION aprovado.

---

ANTES DE EXECUTAR

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
* Consultar State-Transition-Log.md.
* Consultar Blocked-State-Protocol.md se houver bloqueio.

---

PERMITIDO

* Validar que homologacao foi aprovada.
* Executar deploy de migrations aprovadas.
* Registrar release final.
* Consolidar riscos aceitos.
* Consolidar pendencias nao bloqueantes.
* Atualizar snapshot final.
* Registrar decisao final no log.

---

PROIBIDO

* Criar feature nova.
* Ignorar bloqueio critico.
* Criar migration nova fora de manutencao funcional pos-release explicitamente solicitada e registrada.
* Alterar estado fora da State Machine.
* Executar tooling de setup.
* Alterar schema, backend ou frontend para criar funcionalidade.

---

MANUTENCAO POS-RELEASE

Depois do encerramento local de STATE-08, solicitacoes explicitas do usuario podem gerar manutencao pos-release no workspace.

Manutencao pos-release nao e uma nova fase e nao altera estado.

Obrigatorio quando houver manutencao pos-release:

* Classificar o registro como manutencao funcional pos-release quando alterar codigo, schema, migration, testes, comportamento de produto ou configuracao operacional.
* Nao classificar alteracao funcional como patch puramente documental.
* Registrar diagnostico, arquivos alterados, evidencias, gates, riscos e pendencias.
* Registrar no Project-Snapshot.md e State-Transition-Log.md que STATE-08 PRODUCTION_RELEASE permanece como estado atual.
* Executar validacoes proporcionais ao impacto.
* Declarar explicitamente se houve migration local e se ainda falta deploy remoto.

Proibido em manutencao pos-release:

* Declarar nova transicao de estado sem decisao da State Machine.
* Apagar historico de release, auditoria ou bloqueio.
* Usar manutencao pos-release para burlar gates ou ocultar mudanca funcional.

---

ENTREGAVEIS

* Relatorio final de release.
* Evidencia de deploy de migrations aprovadas ou justificativa de nao aplicabilidade.
* Lista de riscos aceitos.
* Lista de pendencias nao bloqueantes.
* Snapshot final atualizado.
* Registro de release no log de transicao.

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
