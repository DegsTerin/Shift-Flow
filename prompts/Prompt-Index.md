INDICE CANONICO DE PROMPTS

REGRA DE OURO

Nenhum prompt, gate, agente, snapshot, indice, matriz ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Este arquivo e o catalogo oficial dos prompts do projeto.
Ele classifica cada prompt por tipo, autoridade e encaixe operacional.

---

HIERARQUIA DE AUTORIDADE

1. Official-State-Machine.md
2. System-Guard-Rails.md
3. Acceptance-Criteria-By-State.md
4. Module-Phase-Matrix.md, quando houver modulo envolvido
5. Project-Snapshot.md
6. Gates de validacao:
   * Human-Gate-Validation-Checklist.md
   * Automatic-Review-Audit.md
   * Engineering-Multi-Agent-System.md
7. Controlled-Phase-Execution-System.md
8. Prompt da fase em execucao
9. Prompt de modulo
10. Prompt-Index.md e State-Transition-Log.md

Se houver conflito, prevalece o item de maior autoridade.

---

PROMPTS DE CONTROLE

Official-State-Machine.md

* Tipo: STATE MACHINE
* Autoridade: Fluxo oficial
* Funcao: Define estados canonicos, transicoes, SKIP_CONTROLLED, tooling e formato de encerramento.

System-Guard-Rails.md

* Tipo: CONSTRAINT / GATE
* Autoridade: Controle global de escopo
* Funcao: Bloqueia violacoes de fase, tooling, camada e consistencia.

Controlled-Phase-Execution-System.md

* Tipo: ORQUESTRACAO
* Autoridade: Regras globais de execucao
* Funcao: Consolida regras operacionais para execucao controlada.

System-Reorganisation-Codex-Prompt.md

* Tipo: SYSTEM DESIGN
* Autoridade: Normalizacao do sistema de prompts
* Funcao: Reorganizar prompts em State Machine, gates, modules e constraints.

Revision-Prompt.md

* Tipo: GLOBAL REVISION REQUEST
* Autoridade: Entrada operacional pos-release
* Funcao: Consolidar problemas funcionais, responsividade, filtros, pesquisa, CRUD, registros, modo TV e criterios de aceite para revisao completa do ShiftFlow.
* Regra: Nao altera estado. Deve ser executado apenas por fase permitida e validado por gates.

Restructuring-Prompt.md

* Tipo: GLOBAL RESTRUCTURING REQUEST
* Autoridade: Entrada operacional pos-release
* Funcao: Reposicionar o ShiftFlow como plataforma corporativa de passagem de turno, registro operacional, dossie de atividades, historico imutavel, acompanhamento gerencial e monitoramento em tempo real.
* Regra: Nao altera estado. Deve orientar diagnostico, lista de correcoes, implementacao controlada, relatorio final e pendencias futuras.

Prompt-Audit-Human-CI.md

* Tipo: GLOBAL AUDIT REQUEST
* Autoridade: Entrada operacional de auditoria extrema
* Funcao: Solicitar Human CI completa, linha por linha, sobre codigo, configuracoes, documentacao, fluxos, riscos e planos de correcao.
* Regra: Nao altera estado. Deve ser executado como auditoria permitida pelo estado atual; correcoes exigem solicitacao explicita, classificacao por fase de origem, evidencias e gates.

Prompt-Audit-Full.md

* Tipo: FULL PROJECT AUDIT REQUEST
* Autoridade: Entrada operacional de auditoria funcional completa
* Funcao: Solicitar auditoria evidencial de todos os requisitos descritos nos .md canonicos contra codigo, frontend, backend, banco, APIs, testes, layout, fluxos, permissoes e comportamento real.
* Regra: Nao altera estado. Correcoes funcionais exigem solicitacao explicita, classificacao conforme estado atual, evidencias objetivas e gates proporcionais.

Prompt-Security.md

* Tipo: SECURITY AUDIT REQUEST
* Autoridade: Entrada operacional de seguranca
* Funcao: Solicitar auditoria de seguranca, vulnerabilidades, arquitetura, resiliencia, supply chain, compliance e score tecnico.
* Regra: Nao altera arquivos por si mesmo. O proprio prompt restringe a execucao a analisar e documentar salvo autorizacao explicita.

Prompt-Systematization.md

* Tipo: GLOBAL SYSTEMATIZATION REQUEST
* Autoridade: Entrada operacional de sistematizacao
* Funcao: Solicitar reorganizacao profissional, modularizacao, padronizacao, governanca, automacao, observabilidade e documentacao do projeto.
* Regra: Nao altera estado. Qualquer refatoracao ou reorganizacao deve respeitar a fase permitida, a State Machine, os Guard Rails e evidencias verificaveis.

Prompt-Auth.md

* Tipo: AUTH SECURITY AUDIT REQUEST
* Autoridade: Entrada operacional de auditoria de autenticacao
* Funcao: Solicitar auditoria completa de login, credenciais, sessao, JWT, refresh token, rate limiting, RBAC, logs, CORS, headers e dependencias.
* Regra: Nao altera estado. Correcoes exigem solicitacao explicita, classificacao como manutencao funcional pos-release quando houver codigo/schema/migration, evidencias e gates proporcionais.

Prompt-Password.md

* Tipo: PASSWORD AND CREDENTIAL REMEDIATION REQUEST
* Autoridade: Entrada operacional de remediacao de credenciais
* Funcao: Solicitar auditoria e correcao de senhas, tokens, hashes, placeholders, seeds, testes, envs, documentacao e valores sensiveis expostos.
* Regra: Nao altera estado. Complementa Prompt-Auth.md e deve registrar como manutencao funcional pos-release qualquer correcao que altere codigo, configuracao, seed, teste ou comportamento de seguranca.

Prompt-Dashboard.md

* Tipo: DASHBOARD PERSONALIZATION REQUEST
* Autoridade: Entrada operacional de melhoria de produto
* Funcao: Solicitar Dashboard de KPIs personalizavel por usuario, com widgets, grid responsivo, persistencia de layout e modo de personalizacao.
* Regra: Nao altera estado. Implementacao deve registrar migrations, APIs, frontend, persistencia, validacoes e pendencias quando executada em pos-release.

Prompt-Adjustments.md

* Tipo: GLOBAL ADJUSTMENTS REQUEST
* Autoridade: Entrada operacional de melhorias funcionais
* Funcao: Solicitar Kanban interno por atividade, ajustes de legenda/filtros, reestruturacao de Gestao de Perfis, cores por equipe no Kanban e expansao de Configuracoes.
* Regra: Nao altera estado. Implementacao deve ser registrada como manutencao funcional pos-release quando alterar banco, backend, frontend, permissoes ou comportamento de produto.

Prompt-Interface-UI-UX.md

* Tipo: GLOBAL UI/UX LAYOUT REQUEST
* Autoridade: Entrada operacional de revisao visual e experiencia
* Funcao: Solicitar revisao completa de UI/UX, design system, layout, responsividade, acessibilidade, componentes, dashboards, tabelas, formularios, modais e navegacao.
* Regra: Nao altera estado. Implementacao deve preservar regras de negocio, APIs e contratos existentes, com validacoes proporcionais de layout, responsividade, acessibilidade e regressao.

Project-Snapshot.md

* Tipo: SNAPSHOT
* Autoridade: Fonte de evidencia
* Funcao: Registrar estado declarado pela State Machine, decisoes, evidencias, pendencias e riscos.

State-Transition-Log.md

* Tipo: LOG
* Autoridade: Historico
* Funcao: Registrar tentativas, aprovacoes e transicoes decididas pela State Machine.

Acceptance-Criteria-By-State.md

* Tipo: GATE CRITERIA
* Autoridade: Criterios de aceite
* Funcao: Definir condicoes objetivas para concluir cada estado.

Module-Phase-Matrix.md

* Tipo: MATRIX
* Autoridade: Mapeamento operacional
* Funcao: Definir quais partes de cada modulo pertencem a cada fase.

Execution-Protocol.md

* Tipo: OPERATIONAL PROTOCOL
* Autoridade: Roteiro operacional
* Funcao: Definir a sequencia obrigatoria de execucao de qualquer fase.

Conflict-Resolution-Policy.md

* Tipo: CONFLICT POLICY
* Autoridade: Resolucao de conflitos
* Funcao: Definir como resolver conflitos entre arquivos e instrucoes.

Evidence-Standard.md

* Tipo: EVIDENCE STANDARD
* Autoridade: Padrao de evidencia
* Funcao: Definir o que conta como evidencia valida.

Global-Definition-Of-Done.md

* Tipo: DOD
* Autoridade: Checklist global de conclusao
* Funcao: Definir condicoes minimas para recomendar conclusao de fase.

Controlled-Rollback-Policy.md

* Tipo: ROLLBACK POLICY
* Autoridade: Reversao controlada
* Funcao: Definir procedimento de rollback de estado, artefato ou modulo.

Canonical-State-And-Module-IDs.md

* Tipo: ID REGISTRY
* Autoridade: Rastreabilidade
* Funcao: Definir IDs canonicos para estados, gates, modulos e controles.

Start-Here.md

* Tipo: ENTRYPOINT
* Autoridade: Ponto de entrada operacional
* Funcao: Definir por onde iniciar, modo resumido, arquivos obrigatorios por contexto e regra anti-overengineering.

Allowed-Commands-By-State.md

* Tipo: COMMAND POLICY
* Autoridade: Comandos permitidos
* Funcao: Definir comandos validos e proibidos por estado.

Prompt-System-Readme.md

* Tipo: HUMAN GUIDE
* Autoridade: Guia de uso
* Funcao: Explicar como operar o sistema no dia a dia.

Current-State.md

* Tipo: CURRENT STATE
* Autoridade: Consulta operacional do estado atual declarado
* Funcao: Declarar estado atual, fase permitida, comandos validos e bloqueios.

Prompt-System-Change-Log.md

* Tipo: CHANGE LOG
* Autoridade: Historico de alteracoes do sistema de prompts
* Funcao: Registrar mudancas, versoes e impacto.

Prompt-System-Version.md

* Tipo: VERSION
* Autoridade: Versao atual
* Funcao: Declarar a versao atual do sistema de prompts.

Prompt-System-Versioning-Policy.md

* Tipo: VERSIONING POLICY
* Autoridade: Versionamento
* Funcao: Definir versionamento semantico do sistema de prompts.

Prompt-System-Audit.md

* Tipo: SYSTEM AUDIT
* Autoridade: Auditoria do sistema de prompts
* Funcao: Auditar estados, autoridade, modulos, tooling, referencias, execucao e versionamento.

Phase-Handoff-Template.md

* Tipo: HANDOFF TEMPLATE
* Autoridade: Template operacional
* Funcao: Padronizar passagem de fase.

Blocked-State-Protocol.md

* Tipo: BLOCKED STATE PROTOCOL
* Autoridade: Tratamento de bloqueios
* Funcao: Definir procedimento para fase, modulo, gate ou transicao bloqueada.

---

GATES

Project-Memory-System.md

* Tipo: GATE / MEMORY POLICY
* Encaixe: Todas as fases
* Funcao: Define como consultar e atualizar Project-Snapshot.md.

Human-Gate-Validation-Checklist.md

* Tipo: HUMAN GATE
* Encaixe: Encerramento de todas as fases
* Funcao: Checklist humano obrigatorio.

Automatic-Review-Audit.md

* Tipo: TECHNICAL GATE
* Encaixe: Encerramento de todas as fases
* Funcao: Auditoria tecnica automatica.

Engineering-Multi-Agent-System.md

* Tipo: VALIDATION ROLES
* Encaixe: Todas as fases
* Funcao: Define papeis tecnicos por estado.

---

ARTEFATOS DE EVIDENCIA E RELATORIOS

Estes arquivos fazem parte da rastreabilidade dos .md existentes naquela rodada historica, mas nao sao prompts operacionais por si mesmos.
Eles nao alteram estado e devem ser usados como evidencia historica, relatorio tecnico ou documento de fase.

Automatic-Review-Audit-Architecture.md
Automatic-Review-Audit-Backend-Implementation.md
Automatic-Review-Audit-Database-Modelling.md
Automatic-Review-Audit-Frontend-Implementation.md
Automatic-Review-Audit-Integration.md
Automatic-Review-Audit-Production-Release.md
Automatic-Review-Audit-Project-Setup.md
Automatic-Review-Audit-Testing-Homologation.md
Database-Modelling-Document.md
Human-CI-Validation-Architecture-Retrospective.md
Human-CI-Validation-Architecture.md
Human-CI-Validation-Backend-Implementation.md
Human-CI-Validation-Database-Modelling.md
Human-CI-Validation-Frontend-Implementation.md
Human-CI-Validation-Integration.md
Human-CI-Validation-Production-Release.md
Human-CI-Validation-Project-Setup.md
Human-CI-Validation-Testing-Homologation.md
Integration-Execution-Report.md
Production-Release-Report.md
Solution-Architecture-Document.md
Testing-Homologation-Report.md

---

PROMPTS DE FASE

Project-Setup-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-01 SETUP_PROJECT
* Funcao: Preparar estrutura base, dependencias e configuracoes iniciais.

Solution-Architecture-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-02 ARCHITECTURE
* Funcao: Definir arquitetura sem gerar codigo.

Database-Modelling-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-03 DATABASE_MODELING
* Funcao: Criar ou ajustar schema Prisma e estrategia conceitual de migracao.

Backend-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-04 BACKEND_IMPLEMENTATION
* Funcao: Criar backend sem alterar schema ou frontend.

Frontend-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-05 FRONTEND_IMPLEMENTATION
* Funcao: Criar frontend sem alterar backend ou banco.

Integration-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-06 INTEGRATION
* Funcao: Integrar frontend e backend existentes sem criar modulos novos.

Testing-And-Homologation-Phase.md

* Tipo: STATE PROMPT / GATE
* Estado: STATE-07 TESTING_HOMOLOGATION
* Funcao: Auditar e homologar evidencias sem criar features novas.

Production-Release-Phase.md

* Tipo: STATE PROMPT
* Estado: STATE-08 PRODUCTION_RELEASE
* Funcao: Preparar e registrar a liberacao final.

---

PROMPTS DE MODULO

Executive-Dashboard-Module.md

* Tipo: MODULE
* Modulo: MOD-09 DASHBOARD_EXECUTIVO
* Funcao: KPIs, graficos, filtros e lista operacional.

Operational-Kanban-Module.md

* Tipo: MODULE
* Modulo: MOD-10 KANBAN_OPERACIONAL
* Funcao: Quadro, colunas, drag and drop, SLA e historico.

Team-Management-Module.md

* Tipo: MODULE
* Modulo: MOD-03 TEAMS
* Funcao: Equipes, lideres, membros, SLA padrao e movimentacao.

Shift-Management-Module.md

* Tipo: MODULE
* Modulo: MOD-04 SHIFTS
* Funcao: Turnos, escala, cobertura, plantao, ferias e substituicao.

RBAC-Module.md

* Tipo: CROSS-LAYER MODULE
* Modulo: MOD-11 RBAC
* Funcao: Perfis, permissoes, middleware, UI administrativa e validacao ponta a ponta.
