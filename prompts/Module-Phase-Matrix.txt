MATRIZ MODULO X FASE

REGRA DE OURO

Nenhum prompt, gate, agente, matriz ou modulo pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Definir em qual fase cada parte dos modulos pode ser tratada.

Esta matriz orienta escopo.
Ela nao altera estado.

---

LEGENDA

D = DATABASE_MODELING
B = BACKEND_IMPLEMENTATION
F = FRONTEND_IMPLEMENTATION
I = INTEGRATION
T = TESTING_HOMOLOGATION

---

MOD-11 RBAC

D:

* Roles
* Permissions
* Relacionamentos usuario/empresa/cliente/permissao
* Constraints e indices

B:

* Middleware de autorizacao
* Services de permissao
* Policies
* Validacao obrigatoria no backend

F:

* Interface administrativa
* Guards visuais
* Controle de navegacao

I:

* Validacao ponta a ponta por perfil
* Validacao multiempresa
* Bloqueios por permissao

T:

* Auditoria de seguranca
* Testes de acesso indevido

---

MOD-03 TEAMS / GESTAO DE EQUIPES

D:

* Entidade Team
* Lider
* Membros
* Turnos vinculados
* Soft delete

B:

* APIs de criar, editar, inativar e excluir logicamente
* Movimentacao de analistas
* RBAC e multiempresa

F:

* Tela de equipes
* Formulario de equipe
* Fluxo de movimentacao de analistas

I:

* Fluxo completo de CRUD e movimentacao

T:

* Testes de permissao, integridade e isolamento multiempresa

---

MOD-04 SHIFTS / GESTAO DE TURNOS

D:

* Entidade Shift
* Escala
* Cobertura
* Plantao
* Ferias
* Substituicao

B:

* APIs de criar, editar, encerrar e reabrir
* Regras de escala, cobertura, plantao, ferias e substituicao

F:

* Tela de turnos
* Fluxos visuais de escala, cobertura, plantao, ferias e substituicao

I:

* Validacao ponta a ponta dos fluxos de turno

T:

* Auditoria de regras, permissao e consistencia temporal

---

MOD-09 DASHBOARD_EXECUTIVO

D:

* Campos e indices para KPIs
* Relacionamentos necessarios para agregacoes
* Campos necessarios para total de atividades, pendentes, em andamento, finalizadas, SLA em risco, criticas, equipe, cliente, turno, prioridade e evolucao temporal

B:

* Endpoints de KPIs
* Services de agregacao
* Filtros por equipe, analista, cliente, prioridade, status e turno
* Agregacoes por equipe, cliente, turno, prioridade e periodo
* Contratos para dashboard executivo e visao operacional/TV quando compartilharem indicadores

F:

* Cards de KPI
* Graficos
* Filtros
* Lista operacional em tempo real
* Visao executiva com totalizadores, graficos por equipe, cliente, turno, prioridade e evolucao temporal
* Layout de monitoramento com cards grandes, atualizacao automatica e destaque de SLA em risco/atividades criticas

I:

* Integracao de dados reais
* Validacao de filtros
* Atualizacao em tempo real
* Validacao de auto refresh e consistencia de numeros entre dashboard, kanban e listagens

T:

* Auditoria de numeros, performance e permissao
* Validacao visual em desktop, notebook/tablet, mobile e TV/monitoramento

---

MOD-10 KANBAN_OPERACIONAL

D:

* Status
* Prioridade
* SLA
* Historico de atividade
* Status obrigatorios: Pendente, Em Andamento, Aguardando Cliente, Aguardando Terceiros, Monitoramento, Finalizada e Cancelada

B:

* APIs de listagem, movimentacao e atualizacao
* Registro de historico
* Regras de SLA e prioridade
* Registro imutavel de mudanca de status, responsavel, comentario, anexo, exclusao, reabertura e encerramento quando aplicavel
* Filtros por cliente, sistema, equipe, turno, responsavel, prioridade, status e periodo

F:

* Quadro Kanban
* Colunas
* Cartoes
* Drag and drop
* Cartoes com ID, cliente, sistema, equipe, responsavel, prioridade, status, SLA e ultima atualizacao
* Modal/drawer de detalhes com timeline completa e acoes permitidas
* Modo monitoramento em tempo real com destaque visual de criticos e SLA em risco

I:

* Persistencia de movimentacao
* Atualizacao em tempo real
* Validacao de historico
* Validacao de filtros simultaneos, busca e consistencia entre cartao, detalhe e timeline

T:

* Testes de concorrencia, permissao, SLA e responsividade
* Testes de imutabilidade do historico operacional e preservacao de informacao

---

MOD-01 AUTH

D:

* Campos de usuario, credenciais, tokens e auditoria, se aplicavel

B:

* Login
* Refresh Token
* JWT
* Logout
* Protecao de rotas

F:

* Tela de login
* Estado de sessao visual
* Redirecionamentos

I:

* Fluxo completo de autenticacao
* Expiracao e refresh

T:

* Testes de seguranca e sessao

---

MOD-02 USERS

D:

* Entidade User
* Relacionamentos com Company, Client, Team, Roles e Permissions
* Campos de perfil, status, idioma, tema e auditoria

B:

* APIs de criar, editar, inativar e listar usuarios
* Services de perfil, status e associacoes
* Validacao de multiempresa e RBAC

F:

* Tela de gestao de usuarios
* Formularios de usuario e perfil
* Controles visuais de status, permissao e associacao a equipes

I:

* Fluxo completo de CRUD de usuarios
* Validacao de isolamento multiempresa
* Validacao de permissoes por perfil

T:

* Testes de permissao, isolamento, status e auditoria de usuario

---

MOD-12 AUDIT

D:

* AuditLogs
* Relacionamentos de usuario, entidade e acao

B:

* Registro de eventos relevantes
* Services de auditoria

F:

* Visualizacao administrativa, se prevista pela arquitetura

I:

* Validacao de eventos ponta a ponta

T:

* Auditoria de cobertura e integridade dos logs

---

MOD-05 ACTIVITIES

D:

* Entidade Activity
* Status, prioridade, SLA, responsavel, cliente, equipe e turno
* Relacionamentos com historico, comentarios, anexos e auditoria
* Campos de dossie operacional: titulo, sistema, servico, descricao inicial, o que foi identificado, o que foi realizado, o que esta pendente, proximas acoes e resultado final
* Metadados automaticos: criado por, data criacao, ultima alteracao por, ultima alteracao em, excluido por e data exclusao

B:

* APIs de criar, editar, mover, atribuir e encerrar atividades
* Services de status, prioridade, SLA e responsaveis
* Validacoes de permissao e isolamento
* CRUD completo com exclusao logica, reabertura e encerramento
* Timeline append-only para comentario, atualizacao, mudanca de status, mudanca de responsavel, anexo, exclusao, reabertura e encerramento
* Busca por ID, cliente, sistema, equipe, responsavel, status e texto livre

F:

* Tela de atividades
* Formularios de criacao e edicao
* Listas, filtros e estados visuais de prioridade/SLA
* Detalhe de atividade em modal, drawer ou painel sobre a tela atual
* Exibicao de resumo, dados principais, descricao completa, historico, anexos, auditoria e acoes permitidas
* Botao "+ Novo" funcional em todos os pontos de entrada de atividade

I:

* Fluxos ponta a ponta de criacao, edicao, movimentacao e encerramento
* Validacao de historico e auditoria
* Validacao de filtros, pesquisa global, soft delete, reabertura, encerramento e preservacao de timeline

T:

* Testes de SLA, permissao, concorrencia e consistencia de status
* Testes de responsividade, temas, idiomas, CRUD completo e imutabilidade de historico

---

MOD-06 COMMENTS

D:

* Entidade Comment
* Relacionamento com Activity, User e AuditLogs
* Soft delete e timestamps

B:

* APIs de criar, editar, excluir logicamente e listar comentarios
* Services de validacao de autor, permissao e atividade vinculada

F:

* Thread ou lista de comentarios em atividades
* Formulario de comentario
* Estados visuais de edicao, exclusao e auditoria

I:

* Fluxo ponta a ponta de comentarios em atividades
* Validacao de permissao por usuario e equipe

T:

* Testes de permissao, auditoria, soft delete e integridade de vinculo

---

MOD-07 NOTIFICATIONS

D:

* Entidade Notification
* Relacionamento com User, Activity, Team e eventos de auditoria
* Campos de leitura, tipo, prioridade e canal

B:

* Services de geracao de notificacoes
* APIs de listar, marcar como lida e limpar notificacoes
* Regras de disparo por SLA, atribuicao e mudanca de status

F:

* Centro de notificacoes
* Indicadores de nao lidas
* Estados visuais de leitura e prioridade

I:

* Fluxos ponta a ponta de notificacao por eventos reais
* Validacao de leitura e atualizacao em tempo real, se previsto

T:

* Testes de disparo, permissao, duplicidade e performance

---

MOD-08 REPORTS

D:

* Campos e indices para relatorios
* Relacionamentos necessarios para filtros e agregacoes

B:

* Endpoints de relatorios
* Services de filtros, agregacoes e exportacao, se prevista
* Validacao de permissao por escopo

F:

* Tela de relatorios
* Filtros, tabelas, graficos e exportacao, se prevista

I:

* Validacao de dados reais em relatorios
* Validacao de filtros e escopo multiempresa

T:

* Auditoria de numeros, permissao, performance e exportacao

---

MOD-13 ATTACHMENTS

D:

* Entidade Attachment
* Relacionamento com Activity, Comment, User e AuditLogs
* Metadados de arquivo, tamanho, tipo e armazenamento

B:

* APIs de upload, download, listagem e exclusao logica
* Validacao de tipo, tamanho, permissao e escopo
* Integracao com storage definido na arquitetura

F:

* Componentes de upload e lista de anexos
* Estados de progresso, erro e remocao

I:

* Fluxo ponta a ponta de upload/download
* Validacao de permissao e auditoria

T:

* Testes de seguranca, tamanho, tipo, permissao e integridade

---

MOD-14 SHIFT_REPORTS

D:

* Entidade ShiftReport
* Relacionamento com Shift, Team, User, Activities e AuditLogs
* Campos de resumo, indicadores, pendencias e aprovacao

B:

* APIs de gerar, editar, aprovar e consultar relatorios de turno
* Services de consolidacao de atividades, pendencias e indicadores

F:

* Tela de relatorio de turno
* Formularios de fechamento e aprovacao
* Visualizacao de indicadores e pendencias

I:

* Fluxo ponta a ponta de fechamento de turno
* Validacao com atividades, equipe e auditoria

T:

* Testes de consistencia temporal, permissao, consolidacao e auditoria
