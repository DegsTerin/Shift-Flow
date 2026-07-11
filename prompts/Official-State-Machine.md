STATE MACHINE OFICIAL DO PROJETO

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


HIERARQUIA DE AUTORIDADE

1. State Machine
2. Guard Rails
3. Acceptance Criteria
4. Module Phase Matrix, quando houver modulo envolvido
5. Snapshot como fonte de evidencia
6. Gates de validacao
7. Prompt Mestre
8. Prompt da fase em execucao
9. Prompt de modulo
10. Arquivos operacionais

Se houver conflito, prevalece sempre o item de maior autoridade.

---

ESTADOS CANONICOS

STATE-00 INIT
  ->
STATE-01 SETUP_PROJECT
  ->
STATE-02 ARCHITECTURE
  ->
STATE-03 DATABASE_MODELING
  ->
STATE-04 BACKEND_IMPLEMENTATION
  ->
STATE-05 FRONTEND_IMPLEMENTATION
  ->
STATE-06 INTEGRATION
  ->
STATE-07 TESTING_HOMOLOGATION
  ->
STATE-08 PRODUCTION_RELEASE

---

REGRA DE TRANSICAO

Nenhum estado pode ser pulado.
Nenhum estado pode ser revertido sem comando explicito.
Nenhum estado pode avancar sem aprovacao dos gates obrigatorios.
Nenhum estado pode ser recomendado para transicao sem cumprir Acceptance-Criteria-By-State.md.
Toda transicao decidida deve ser registrada em State-Transition-Log.md.

Estados representam execucao.
Resultados como APPROVED, READY, REPROVED ou BLOCKED pertencem aos gates, nao a State Machine.

---

SKIP_CONTROLLED

SKIP_CONTROLLED nao e um estado.
E uma excecao controlada de transicao.

So pode ser usado quando:

* O usuario solicitar explicitamente.
* O snapshot comprovar que o estado a ser pulado ja foi concluido.
* Guard Rails nao identificar violacao de escopo.
* Auto Auditor aprovar a evidencia existente.
* Human CI aprovar explicitamente.

Se qualquer condicao falhar, SKIP_CONTROLLED e bloqueado.

Toda solicitacao de SKIP_CONTROLLED deve ser registrada em State-Transition-Log.md.

---

REGRA DE TOOLING

SETUP_PROJECT e o unico estado onde tooling de setup e permitido.

Permitido somente em SETUP_PROJECT:

* npm init
* instalacao de dependencias
* prisma init
* configuracao de ambiente
* docker, quando necessario
* alteracao de package.json
* criacao de configuracoes de runtime

Proibido em todos os outros estados:

* instalar dependencias
* executar comandos de setup
* alterar package.json
* alterar configuracao de runtime

Comandos Prisma de migration de dominio nao sao tooling de setup.
Eles so podem ocorrer quando explicitamente autorizados por DATABASE_MODELING, INTEGRATION ou PRODUCTION_RELEASE.

---

REGRA DE CAMADAS

ARCHITECTURE:

* Pode definir arquitetura.
* Nao pode gerar codigo de implementacao.

DATABASE_MODELING:

* Pode criar ou alterar schema Prisma.
* Pode criar arquivos de migration de dominio.
* Pode executar Prisma CLI apenas para validar schema e gerar migration de dominio sem aplicar em ambiente final.
* Pode descrever estrategia de migracao.
* Nao pode criar backend ou frontend.

BACKEND_IMPLEMENTATION:

* Pode criar backend, APIs, services, repositories, middlewares, DTOs e validators.
* Nao pode alterar schema de banco.
* Nao pode criar frontend.

FRONTEND_IMPLEMENTATION:

* Pode criar telas, componentes, estados visuais, i18n e temas.
* Nao pode alterar backend.
* Nao pode alterar schema de banco.

INTEGRATION:

* Pode integrar frontend e backend existentes.
* Pode ajustar contratos entre camadas, desde que nao crie novas regras de negocio.
* Pode aplicar migrations ja aprovadas em ambiente de integracao.
* Nao pode introduzir modulos novos.

TESTING_HOMOLOGATION:

* Pode auditar, testar e homologar.
* Nao pode implementar features novas.
* Correcoes so podem ocorrer se forem explicitamente classificadas como correcao de defeito da fase atual.

PRODUCTION_RELEASE:

* Pode preparar liberacao final.
* Pode executar deploy de migrations aprovadas.
* Pode registrar manutencao pos-release quando solicitada explicitamente pelo usuario.
* Nao pode criar funcionalidade.

MANUTENCAO POS-RELEASE:

* Nao e estado novo.
* Nao altera STATE-08 PRODUCTION_RELEASE.
* Deve ser registrada como manutencao funcional pos-release quando alterar codigo, schema, migration, testes, comportamento de produto ou configuracao operacional.
* Nao deve ser registrada como patch puramente documental quando houver alteracao funcional.
* Exige evidencias, gates proporcionais ao impacto, snapshot e log.
* Deve declarar migrations locais e pendencias de deploy remoto quando existirem.

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

---

ARTEFATOS OPERACIONAIS OBRIGATORIOS

Antes de executar uma fase:

* Consultar Start-Here.md.
* Consultar Prompt-System-Readme.md.
* Consultar Prompt-Index.md.
* Consultar Current-State.md.
* Consultar Project-Snapshot.md.
* Consultar Project-Memory-System.md.
* Consultar Canonical-State-And-Module-IDs.md.
* Consultar Allowed-Commands-By-State.md.
* Consultar Acceptance-Criteria-By-State.md.
* Consultar Global-Definition-Of-Done.md.
* Consultar Evidence-Standard.md.
* Consultar Module-Phase-Matrix.md quando houver modulo envolvido.
* Consultar Execution-Protocol.md.
* Consultar Prompt-System-Version.md quando houver mudanca em prompts.
* Consultar Prompt-System-Versioning-Policy.md quando houver mudanca em prompts.
* Consultar Conflict-Resolution-Policy.md quando houver conflito.
* Consultar Controlled-Rollback-Policy.md quando houver reversao solicitada.
* Consultar Blocked-State-Protocol.md quando houver bloqueio.
* Consultar Prompt-System-Audit.md a cada mudanca de versao ou antes de declarar ausencia de conflitos.

Ao encerrar uma fase:

* Atualizar Project-Snapshot.md como evidencia.
* Atualizar Current-State.md se a State Machine decidir transicao.
* Registrar decisao ou tentativa em State-Transition-Log.md.
* Preencher Phase-Handoff-Template.md quando houver recomendacao de transicao.
* Atualizar Prompt-System-Change-Log.md quando prompts forem alterados.

---

REGRA ANTI-OVERENGINEERING

Nao criar novo arquivo de controle, gate, estado ou modulo se uma regra existente puder ser ajustada.
Novos controles devem resolver conflito ou risco real.
Novos controles nao podem alterar estado.
