CRITERIOS DE ACEITE POR ESTADO

REGRA DE OURO

Nenhum prompt, gate, agente, criterio ou checklist pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Definir condicoes objetivas para considerar cada estado pronto para recomendacao de transicao.

Cumprir criterios de aceite nao altera estado automaticamente.
A State Machine decide a transicao real.

---

STATE-00 INIT

Pode ser considerado concluido quando:

* Prompts existentes foram identificados.
* Official-State-Machine.md existe.
* Controlled-Phase-Execution-System.md existe.
* System-Guard-Rails.md existe.
* Project-Snapshot.md existe.
* Estado inicial foi registrado em State-Transition-Log.md.

Evidencias esperadas:

* Lista de prompts.
* Snapshot inicial.
* Log inicial.

---

STATE-01 SETUP_PROJECT

Pode ser considerado concluido quando:

* Estrutura base do projeto existe.
* package.json existe, se o projeto precisar de runtime Node.
* Dependencias obrigatorias foram instaladas.
* Prisma foi inicializado, se aplicavel.
* Configuracoes de runtime foram criadas.
* Nenhum modulo funcional foi implementado indevidamente.
* Snapshot foi atualizado.

Evidencias esperadas:

* Project-Setup-Phase.md executado.
* package.json.
* lockfile, se aplicavel.
* arquivos de configuracao.
* diretorios base.

---

STATE-02 ARCHITECTURE

Pode ser considerado concluido quando:

* Arquitetura completa da solucao foi definida.
* Diagrama logico foi descrito.
* Estrutura de pastas foi definida.
* Arquitetura frontend foi definida.
* Arquitetura backend foi definida.
* Arquitetura de banco foi definida.
* Fluxos de autenticacao e RBAC foram definidos.
* Estrategias de i18n, tema, multiempresa, multicliente, multiequipe, multiturno, auditoria, backup e escalabilidade foram definidas.
* Nenhum codigo de implementacao foi criado.
* Snapshot foi atualizado.

Evidencias esperadas:

* Documento de arquitetura.
* Decisoes arquiteturais registradas no snapshot.

---

STATE-03 DATABASE_MODELING

Pode ser considerado concluido quando:

* Schema Prisma existe ou foi atualizado.
* Entidades obrigatorias foram modeladas:
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
* Relacionamentos multiempresa, multicliente, multiequipe e multiturno foram definidos.
* Chaves estrangeiras, indices, constraints, soft delete e auditoria foram contemplados.
* Migrations de dominio foram criadas ou justificadas como nao aplicaveis.
* Estrategia de migracao foi descrita.
* Prisma CLI nao foi executado fora da geracao/validacao de migrations de dominio.
* Backend e frontend nao foram criados.
* Snapshot foi atualizado.

Evidencias esperadas:

* prisma/schema.prisma.
* Arquivos de migration, quando aplicavel.
* Explicacao dos relacionamentos.
* Estrategia de migracao.

---

STATE-04 BACKEND_IMPLEMENTATION

Pode ser considerado concluido quando:

* Estrutura backend foi criada conforme arquitetura.
* Rotas, controllers, services, repositories, middlewares, DTOs e validators existem.
* Auth, Users, Teams, Shifts, Activities, Comments, Notifications, Reports, Dashboard e Audit foram implementados conforme escopo.
* JWT, Refresh Token e RBAC foram implementados no backend.
* Nenhuma alteracao de schema foi feita.
* Nenhum frontend foi criado.
* Snapshot foi atualizado.

Evidencias esperadas:

* Arquivos de backend.
* Listagem de APIs prontas e pendentes.
* Auditoria de separacao Controller / Service / Repository.

---

STATE-05 FRONTEND_IMPLEMENTATION

Pode ser considerado concluido quando:

* Frontend foi criado conforme arquitetura.
* Telas obrigatorias existem:
  * Login
  * Dashboard Principal
  * Dashboard por Equipe
  * Gestao de Usuarios
  * Gestao de Equipes
  * Gestao de Turnos
  * Gestao de Atividades
  * Kanban
  * Relatorios
  * Configuracoes
* Dark Mode, Light Mode, PT-BR e EN-GB foram implementados.
* Componentes sao responsivos.
* Menu lateral possui largura, alinhamento, espacamento, altura de itens e comportamento consistentes em desktop, notebook, tablet e mobile.
* Botao "+ Novo" abre o fluxo funcional correto em todas as telas que possuem criacao.
* Listagens e registros abrem detalhe em modal, drawer ou painel sobre a tela atual quando aplicavel.
* Telas operacionais suportam filtros e pesquisa global na interface sem quebrar layout.
* Dashboard operacional possui layout apto a TV/monitoramento quando previsto pelo modulo.
* Backend e banco nao foram alterados.
* Snapshot foi atualizado.

Evidencias esperadas:

* Arquivos de frontend.
* Telas/componentes implementados.
* Evidencia de responsividade e temas.

---

STATE-06 INTEGRATION

Pode ser considerado concluido quando:

* Frontend e backend existentes foram integrados.
* Migrations aprovadas foram aplicadas no ambiente de integracao, quando aplicavel.
* Contratos de API foram validados.
* Auth, RBAC, Dashboard, Kanban, Teams, Shifts e Activities funcionam ponta a ponta.
* Filtros atualizam dados reais em Dashboard Principal, Dashboard por Equipe, Kanban, Relatorios e listagens aplicaveis.
* Pesquisa global consulta dados reais por ID, titulo, cliente, sistema, equipe, responsavel, status e texto livre quando o contrato suportar.
* CRUD completo funciona ponta a ponta para os modulos com criacao, edicao, atualizacao e exclusao logica previstas.
* Atividades preservam historico operacional/timeline em criacao, edicao, comentario, mudanca de status, mudanca de responsavel, anexo, exclusao, reabertura e encerramento quando aplicavel.
* Modal ou painel de detalhes exibe resumo, dados principais, descricao completa, historico, anexos, auditoria e acoes permitidas.
* Nao foram criadas novas regras de negocio.
* Nao foram criados novos modulos.
* Snapshot foi atualizado.

Evidencias esperadas:

* Integration-Phase.md executado.
* Fluxos ponta a ponta validados.
* Evidencia de migrations aplicadas ou justificativa tecnica.
* Relatorio de contratos API.
* Lista de problemas corrigidos ou pendentes.

---

STATE-07 TESTING_HOMOLOGATION

Pode ser considerado concluido quando:

* Banco foi validado.
* Backend foi validado.
* Frontend foi validado.
* APIs foram validadas.
* Seguranca foi validada.
* Performance foi validada.
* Responsividade foi validada.
* Traducoes foram validadas.
* Dark Mode e Light Mode foram validados.
* PT-BR e EN-GB foram validados nos principais fluxos operacionais.
* Responsividade foi validada em desktop, notebook/tablet, mobile e layout de TV/monitoramento quando aplicavel.
* Filtros, pesquisa global, botoes "+ Novo", CRUD, detalhes de registro, historico imutavel, soft delete e reabertura/encerramento foram testados nos modulos aplicaveis.
* Dashboards executivo e operacional foram validados quanto a KPIs, graficos, dados reais, atividades criticas e SLA em risco.
* Bugs, riscos e divida tecnica foram documentados.
* Nenhuma feature nova foi criada.
* Snapshot foi atualizado.

Evidencias esperadas:

* Relatorio de auditoria.
* Resultado dos testes.
* Lista de bugs, correcoes necessarias e melhorias recomendadas.

---

STATE-08 PRODUCTION_RELEASE

Pode ser considerado concluido quando:

* TESTING_HOMOLOGATION foi aprovado.
* Bloqueios criticos foram resolvidos.
* Migrations aprovadas foram preparadas ou aplicadas conforme estrategia de release.
* Riscos remanescentes foram aceitos explicitamente.
* Snapshot final foi atualizado.
* State-Transition-Log.md registrou a decisao.

Evidencias esperadas:

* Production-Release-Phase.md executado.
* Relatorio final.
* Aprovacao final.
* Registro de release.
* Evidencia de deploy de migrations aprovadas ou justificativa de nao aplicabilidade.
