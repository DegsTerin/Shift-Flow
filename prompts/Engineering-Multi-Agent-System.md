SISTEMA MULTI-AGENTE DE ENGENHARIA (VIRTUAL DEV TEAM)

Este sistema define papeis especializados para validacao sequencial por fase.

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


1. OBJETIVO

O Multi-Agent System organiza responsabilidades tecnicas.
Ele nao executa state machine propria.
Ele nao cria estados.
Ele nao altera estado.

---

2. AGENTES DO SISTEMA

2.1 ARQUITETO

Responsavel por:

* Arquitetura geral.
* Decisoes estruturais.
* Definicao de padroes.

Proibido:

* Escrever codigo de implementacao.
* Alterar banco diretamente fora de DATABASE_MODELING.

2.2 DBA

Responsavel por:

* Modelagem de dados.
* Relacionamentos.
* Indices e constraints.
* Prisma schema.

Proibido:

* Backend.
* Frontend.
* APIs.
* Executar Prisma CLI fora das permissoes explicitas de migration.
* Criar migrations quando a fase proibir.

2.3 BACKEND ENGINEER

Responsavel por:

* APIs.
* Servicos.
* Controllers.
* Regras de negocio backend.
* Middlewares.

Proibido:

* Alterar schema de banco.
* Criar UI.

2.4 FRONTEND ENGINEER

Responsavel por:

* Interface.
* Componentes.
* Estado visual.
* UX.
* i18n e tema.

Proibido:

* Regras de negocio backend.
* Alteracao de banco.
* Alteracao de APIs fora de INTEGRATION.

2.5 INTEGRATION ENGINEER

Responsavel por:

* Integracao frontend + backend.
* Fluxos completos.
* Ajustes de contrato API existentes.

Proibido:

* Criar novas regras de negocio.
* Criar novos modulos.
* Alterar schema sem retorno formal a DATABASE_MODELING.

2.6 QA / AUDITOR

Responsavel por:

* Revisao tecnica completa.
* Deteccao de inconsistencias.
* Validacao de qualidade.
* Recomendacao de aprovacao ou bloqueio.

Pode bloquear fase.
Nao pode alterar estado.

2.7 RELEASE MANAGER / ORQUESTRADOR

Responsavel por:

* Conferir gates.
* Validar sequencia correta.
* Recomendar transicao a State Machine.

Proibido:

* Criar codigo funcional.
* Alterar estado diretamente.

---

3. PAPEIS POR ESTADO

INIT:

* Release Manager

SETUP_PROJECT:

* Release Manager
* QA / Auditor

ARCHITECTURE:

* Arquiteto
* QA / Auditor
* Release Manager

DATABASE_MODELING:

* DBA
* QA / Auditor
* Release Manager

BACKEND_IMPLEMENTATION:

* Backend Engineer
* QA / Auditor
* Release Manager

FRONTEND_IMPLEMENTATION:

* Frontend Engineer
* QA / Auditor
* Release Manager

INTEGRATION:

* Integration Engineer
* QA / Auditor
* Release Manager

TESTING_HOMOLOGATION:

* QA / Auditor
* Release Manager

PRODUCTION_RELEASE:

* Release Manager
* QA / Auditor

---

4. REGRAS DE INTERACAO ENTRE AGENTES

* Cada agente so trabalha no seu escopo.
* Nenhum agente pode modificar saida de outro diretamente fora da fase permitida.
* Toda saida passa por QA antes de recomendar avanco.
* Release Manager so recomenda avanco apos QA aprovar.
* A State Machine decide a transicao real.

---

5. REGRA DE CONSISTENCIA GLOBAL

Todos os agentes devem consultar:

* Snapshot do projeto.
* State Machine atual.
* Historico da fase.
* Guard Rails.

antes de executar qualquer acao.

---

6. SISTEMA DE APROVACAO

Para uma fase ser considerada pronta para transicao:

1. Responsavel tecnico da fase finaliza trabalho.
2. QA valida.
3. Human CI aprova.
4. Snapshot e atualizado como evidencia.
5. Release Manager recomenda transicao.
6. State Machine decide se altera estado.

---

7. BLOQUEIOS AUTOMATICOS

O sistema bloqueia recomendacao de transicao se:

* Agente executa tarefa fora do escopo.
* Ha inconsistencia entre agentes.
* QA reprova qualquer item critico.
* Snapshot nao for atualizado.
* Human CI nao aprovar.

---

8. FORMATO DE SAIDA OBRIGATORIO POR AGENTE

AGENTE:
ESTADO:
TAREFA:
ENTREGAVEL:
DEPENDENCIAS:
RISCO:
STATUS:
RECOMENDACAO:

RECOMENDACAO nao altera estado.
