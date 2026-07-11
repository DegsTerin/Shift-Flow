PROTOCOLO DE EXECUCAO

REGRA DE OURO

Nenhum prompt, gate, agente, protocolo, politica, evidencia, checklist, snapshot ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Definir o roteiro operacional unico para executar qualquer fase, modulo, gate ou auditoria.

---

ROTEIRO OBRIGATORIO

1. Ler Start-Here.md.
2. Ler Prompt-System-Readme.md.
3. Ler Prompt-Index.md.
4. Ler Official-State-Machine.md.
5. Ler System-Guard-Rails.md.
6. Ler Current-State.md.
7. Ler Project-Snapshot.md.
8. Ler Project-Memory-System.md.
9. Ler Canonical-State-And-Module-IDs.md.
10. Ler Allowed-Commands-By-State.md.
11. Ler Acceptance-Criteria-By-State.md.
12. Ler Global-Definition-Of-Done.md.
13. Ler Evidence-Standard.md.
14. Validar o estado atual declarado pela State Machine.
15. Validar se o comando solicitado e permitido.
16. Ler o prompt da fase solicitada permitida pelo estado atual.
17. Ler Module-Phase-Matrix.md se houver modulo envolvido.
18. Ler Conflict-Resolution-Policy.md se houver conflito entre instrucoes.
19. Ler Controlled-Rollback-Policy.md se houver reversao solicitada.
20. Ler Blocked-State-Protocol.md se houver bloqueio.
21. Ler Prompt-System-Version.md e Prompt-System-Versioning-Policy.md se houver mudanca em prompts.
22. Ler Prompt-System-Audit.md quando houver mudanca de versao ou auditoria de conflitos.
23. Executar apenas o escopo permitido pela fase solicitada permitida.
24. Rodar gates obrigatorios:
    * Guard Rails
    * Project Memory System
    * Auto Auditor
    * Human CI
    * Multi-Agent System, quando aplicavel
25. Atualizar Project-Snapshot.md como evidencia.
26. Registrar tentativa, bloqueio ou decisao em State-Transition-Log.md.
27. Preencher Phase-Handoff-Template.md quando recomendar transicao.
28. Atualizar Current-State.md apenas apos decisao da State Machine.
29. Atualizar Prompt-System-Change-Log.md e Prompt-System-Version.md quando prompts forem alterados.
30. Recomendar transicao de estado apenas se todos os gates aprovarem.
31. Aguardar decisao da State Machine.

---

REGRAS DE EXECUCAO

* Nao iniciar fase fora da ordem.
* Nao aceitar comando fora de Allowed-Commands-By-State.md.
* Nao executar modulo fora da camada permitida.
* Nao executar tooling de setup fora de SETUP_PROJECT.
* Nao criar features durante TESTING_HOMOLOGATION.
* Nao usar snapshot, log, gate ou prompt como autoridade de estado.
* Nao considerar fase concluida sem evidencia.
* Nao criar novo arquivo de controle se uma regra existente puder ser ajustada.

---

MODO RESUMIDO

Permitido apenas para consulta simples, auditoria leve ou leitura sem alteracao.

Arquivos minimos:

* Start-Here.md
* Current-State.md
* Official-State-Machine.md
* System-Guard-Rails.md
* Prompt-Index.md

Modo resumido nao pode:

* alterar arquivos
* executar fase
* recomendar transicao
* resolver bloqueio
* fazer rollback
* alterar versao

---

SAIDA OBRIGATORIA

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
