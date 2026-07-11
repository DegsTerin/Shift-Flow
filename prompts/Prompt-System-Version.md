PROMPT SYSTEM VERSION CONTROL

REGRA DE OURO

Nenhum prompt, gate, agente, versao, snapshot ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


VERSAO ATUAL

PROMPT_SYSTEM_VERSION: 1.4.40

Data:
2026-07-11

Status:
Padrao frontend atualizado em 2026-07-11 para refletir a arquitetura Next.js real, sem editar index.html gerado, com semantica HTML5, acessibilidade, responsividade, perfis em listas semanticas e comentarios CSS en-GB. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.40:
Prompt-Interface-UI-UX.md, Prompt-Adjustments.md e docs/development-standards.md passaram a definir as fontes React/CSS editaveis, landmarks, listas semanticas, metadata, acessibilidade, responsividade e comentarios CSS en-GB. O frontend recebeu main primario, skip link, metadata atualizada e lista de perfis em ul/li/article com sequencia interna em ol, preservando os fluxos existentes.

Patch 1.4.39:
Os 75 arquivos canonicos em prompts/ foram renomeados de .txt para .md. Referencias internas e o indice de governanca foram atualizados para os novos caminhos; a integridade do corpus foi validada sem arquivos .txt versionados ou referencias quebradas aos nomes anteriores.

Patch 1.4.38:
Prompt-Interface-UI-UX.md recebeu verificacoes avancadas de simetria, equilibrio de areas em branco, consistencia optica, alinhamento optico de icones, ritmo visual, hierarquia por contraste, consistencia de radius, sombras, transicoes e escala tipografica, densidade visual entre telas, Pixel Perfect quando houver referencia e comparacao automatica por screenshots. Tambem foram adicionadas secoes de Qualidade Visual Premium, Auditoria Pixel Perfect, Regressao Visual, Heuristicas de UX e Inspecao Visual Final, com ajustes no fluxo de execucao, validacoes, evidencias, criterio de aprovacao, relatorio obrigatorio e resultado final.

Patch 1.4.37:
Prompt-Interface-UI-UX.md foi reestruturado para remover duplicacoes, comandos absolutos, escopo nao verificavel e ambiguidades entre correcao visual e mudanca funcional. O prompt passa a separar paginas existentes de diretrizes futuras, tratar tema escuro e Modo TV apenas quando existirem, apontar fontes canonicas de Design System, exigir classificacao de severidade, definir fluxo de execucao, validacoes proporcionais, evidencias, criterio de aprovacao, relatorio obrigatorio e resultado final. Prompt-System-Version.md, Prompt-System-Change-Log.md, Prompt-System-Audit.md, Current-State.md, Project-Snapshot.md e State-Transition-Log.md foram atualizados.

Patch 1.4.36:
Incluida REGRA DE COMMIT em todos os arquivos .md canonicos em prompts/. A regra determina que alteracoes solicitadas devem terminar com commit local de escopo fechado quando houver mudancas de arquivo, e que mudancas externas, geradas ou nao relacionadas nao devem ser incluidas sem solicitacao explicita. Prompt-System-Version.md, Prompt-System-Change-Log.md, Prompt-System-Audit.md, Current-State.md, Project-Snapshot.md e State-Transition-Log.md foram atualizados.

Patch 1.4.35:
Registrada manutencao funcional pos-release derivada da auditoria completa executada por Prompt-Audit-Full.md. O registro cobre dueAt em ActivityTask com migration 20260702193000_audit_full_residual_fixes, filtro de atraso/criticidade, validacao de widgets conhecidos no dashboard, widgets adicionais para atrasadas, tempo medio, Kanban resumido e alertas operacionais, agrupamento de Configuracoes, permissao agrupada por modulo e bloqueio de edicao de perfis do sistema. A contagem atual validada passa a ser 75 .md. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.1:
Documentados ajustes e melhorias de rastreabilidade nos .md canonicos, incluindo alinhamento de versao no snapshot, registro dos conflitos operacionais ja identificados e recomendacao de uso dos controles existentes sem criar novo estado.

Patch 1.4.2:
README, snapshot, changelog, auditoria e log de transicao alinhados para documentar de forma explicita onde os ajustes e melhorias ficam registrados. A documentacao reforca que ajustes documentais nao criam estado, nao alteram STATE-08 PRODUCTION_RELEASE e devem permanecer rastreaveis nos controles canonicos.

Patch 1.4.3:
Documentada a reconciliacao da conversa atual com o workspace reorganizado. A baseline intermediaria passou a ser a serie numerada de .md antes da renomeacao Pascal-Kebab-Case, e os prompts antigos da conversa inicial ficam tratados como historico substituido pela reorganizacao documental. A decisao nao altera estado, nao executa fase e nao autoriza tooling.

Patch 1.4.4:
Arquivos .md renomeados para Pascal-Kebab-Case em en-GB, sem prefixos numericos no nome do arquivo. Referencias internas aos nomes antigos foram atualizadas para os nomes canonicos atuais. A mudanca e apenas documental/organizacional, nao altera estado, nao executa fase e nao autoriza tooling.

Patch 1.4.5:
Documentado o fechamento operacional da renomeacao dos .md. O entrypoint vigente e Start-Here.md; abas antigas do IDE, como "00 - Start Here.md", devem ser reabertas pelo novo nome. O Git pode exibir a mudanca como pares delete/add ate staging ou commit, mas a intencao operacional e rename documental. Nenhuma fase, tooling, codigo ou transicao de estado foi executada.

Patch 1.4.6:
Documentada a solicitacao atual do chat para registrar ajustes e melhorias nos .md apos a renomeacao Pascal-Kebab-Case. O snapshot e o handoff historico foram alinhados para remover redacoes residuais que ainda tratavam STATE-06 INTEGRATION como estado operacional atual; STATE-08 PRODUCTION_RELEASE permanece como estado declarado. A mudanca e documental, nao executa fase, nao altera codigo funcional e nao cria transicao de estado.

Patch 1.4.7:
Consolidado o registro dos ajustes e melhorias deste chat nos .md canonicos atuais. A documentacao passa a destacar que a solicitacao foi atendida nos controles existentes, sem criar novo arquivo de controle, sem restaurar nomes numerados legados e sem alterar STATE-08 PRODUCTION_RELEASE. O registro cobre setup/Git/Human CI historicos, renomeacao para Pascal-Kebab-Case, revisoes pos-release, correcoes funcionais ja evidenciadas, riscos operacionais remanescentes e regra de usar Start-Here.md, Prompt-Index.md e Official-State-Machine.md como fontes vigentes.

Patch 1.4.8:
Registrada nova solicitacao para documentar os ajustes e melhorias deste chat nos .md. A documentacao confirma que o conteudo ja estava consolidado nos controles canonicos e adiciona uma entrada incremental de rastreabilidade sem criar novo controle, sem alterar codigo, sem executar fase, sem restaurar nomes numerados legados e sem alterar STATE-08 PRODUCTION_RELEASE.

Patch 1.4.9:
Registrada nova solicitacao feita com aba antiga do IDE ainda apontando para "00 - Start Here.md". A documentacao reforca que Start-Here.md e o entrypoint canonico atual, que nomes numerados sao legado da baseline anterior, e que solicitacoes repetidas de documentar ajustes e melhorias deste chat devem gerar apenas delta de rastreabilidade nos controles existentes. Nenhum novo controle, codigo, schema, tooling, fase ou transicao de estado foi executado.

Patch 1.4.10:
Registrada nova solicitacao para documentar os ajustes e melhorias deste chat nos .md. O registro consolida que os controles canonicos vigentes sao os arquivos Pascal-Kebab-Case sem numeracao, que Start-Here.md substitui o antigo "00 - Start Here.md", e que a documentacao incremental nao cria fase, nao altera codigo, nao executa tooling e nao muda STATE-08 PRODUCTION_RELEASE.

Patch 1.4.11:
Registrada nova solicitacao para documentar os ajustes e melhorias deste chat nos .md, recebida com contexto de IDE ainda exibindo aba legada "00 - Start Here.md". O registro reafirma que Start-Here.md e o entrypoint vigente, que os nomes numerados sao historico, e que repeticoes desse pedido devem acrescentar somente delta documental nos controles canonicos atuais, sem criar arquivo novo, sem restaurar nomes antigos, sem executar fase, sem alterar codigo e sem mudar STATE-08 PRODUCTION_RELEASE.

Patch 1.4.12:
Registrada nova solicitacao para documentar os ajustes e melhorias deste chat nos .md. O registro confirma que a documentacao deve continuar nos controles canonicos atuais em Pascal-Kebab-Case, que a aba legada "00 - Start Here.md" deve ser interpretada como referencia ao Start-Here.md atual, e que esta acao e apenas documental: nao executa fase, nao altera codigo, nao cria tooling, nao restaura nomes antigos e nao muda STATE-08 PRODUCTION_RELEASE.

Patch 1.4.13:
Registrada a consolidacao final deste chat apos os commits locais. O registro documenta que os commits bda71a4 e ab18718 foram criados, que os .md canonicos atuais permanecem em Pascal-Kebab-Case sem numeracao, que "00 - Start Here.md" e referencia legada ao Start-Here.md vigente, e que o remote Git ainda nao foi configurado. Esta atualizacao e apenas documental e nao altera STATE-08 PRODUCTION_RELEASE.

Patch 1.4.14:
Registrados os ajustes funcionais executados neste chat apos Revision-Prompt.md: auditoria de frontend/backend/integracao; filtros reais e busca global; fluxos "+ Novo"; modal de detalhe/edicao/comentarios; modo TV; decomposicao do frontend em components/lib; API real de clientes em /api/clients; normalizacao dos campos operacionais de Activity no Prisma; historico SOFT_DELETED; seeds atualizados; migracao 20260622010000_prompt_revision_activity_fields; validacoes npm run typecheck, npm run lint, npm test, npm run build, npm run test:e2e e npm run test:load. O registro e documental e nao altera STATE-08 PRODUCTION_RELEASE.

Patch 1.4.15:
Registrada nova solicitacao para documentar os ajustes e melhorias deste chat nos .md. O registro confirma que a execucao de Restructuring-Prompt.md tambem esta documentada nos controles canonicos atuais, incluindo status WAITING_CUSTOMER, campo serviceName, dashboard por cliente, acoes de encerrar/reabrir, responsividade mobile, seeds, migration 20260622103000_operational_dossier_status_service, testes aprovados e servicos locais. Esta atualizacao e apenas documental e nao altera codigo, schema, tooling ou STATE-08 PRODUCTION_RELEASE.

Patch 1.4.16:
Registrados os ajustes funcionais mais recentes deste chat: acesso local/rede documentado operacionalmente, menu lateral e cabecalho compactados, logout, RBAC por hierarquia, replicacao por usuarios via tenant/empresa corrigida, Gestao de Clientes incluida, Equipe removida de Gestao de Turnos e do banco, atividades limpas conforme solicitacao, tratamento amigavel de erro de duplicidade, indices unicos parciais para reutilizar nomes de Equipes e Clientes excluidos logicamente, e validacoes npm/prisma/build executadas. Esta atualizacao documenta alteracoes ja realizadas e nao altera STATE-08 PRODUCTION_RELEASE.

Patch 1.4.17:
Registrados os ajustes deste chat sobre experiencia de navegacao e sessao: drawer/offcanvas em mobile/tablet, sidebar desktop recolhivel com persistencia de estado, Modo TV desacoplado de nav-collapsed, cabecalho sem a frase "Dados carregados de endpoints reais" em modo normal e Modo TV, titulo do Modo TV no tamanho padrao, persistencia de sessao em shiftflow.session para sobreviver ao F5, e testes Playwright focados em reload, Modo TV e mobile drawer. Esta atualizacao documenta alteracoes ja realizadas e nao altera STATE-08 PRODUCTION_RELEASE.

Patch 1.4.18:
Registrada a auditoria global e Human CI completo executados neste chat sobre o workspace atual. O registro cobre banco healthy, Prisma validate/status/deploy, npm audit sem vulnerabilidades moderadas, overrides, lint, typecheck, testes unitarios, build API/Web, seeds, Playwright completo e stress de carga. Tambem registra a falha inicial de p95 no teste de carga Playwright como risco nao bloqueante apos reexecucoes aprovadas. Esta atualizacao e documental e nao altera STATE-08 PRODUCTION_RELEASE.

Patch 1.4.19:
Registradas as correcoes dos bloqueios encontrados na auditoria completa: isolamento multiempresa em Users, validacao de escopo em RBAC assignments/permissions, hardening de update/delete por companyId, segredo JWT obrigatorio em producao, CORS configuravel por CORS_ORIGIN, timeout dedicado para axe e ajuste do stress representativo. Gates finais aprovados: lint, typecheck, unit, build, Prisma, audit, overrides, seeds, Playwright completo, stress e validacao direta de cross-tenant. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.20:
Registrada nova solicitacao em 2026-06-23 para documentar os ajustes e melhorias deste chat nos .md. O conteudo tecnico ja estava consolidado no patch 1.4.19; esta entrada adiciona rastreabilidade da solicitacao atual nos controles canonicos atuais, sem criar novo arquivo, sem restaurar nomes numerados legados, sem executar fase, sem alterar codigo funcional e sem mudar STATE-08 PRODUCTION_RELEASE.

Patch 1.4.21:
Registrados os ajustes finais deste chat apos novas execucoes de Prompt-Audit-Human-CI.md e correcao dos achados residuais. O registro cobre refresh token escopado por empresa, migration 20260623010000_refresh_tokens_company_scope, testes de auth, remocao/redacao de credenciais fixas em seeds/testes/documentos, Playwright carregando .env e exigindo DATABASE_URL, limpeza de artefatos gerados com chaves Next, varreduras gitleaks sem leaks no historico e worktree, gates locais aprovados e commit local dedf74f Hardening audit residual fixes. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.22:
Corrigidos conflitos documentais e de fluxo identificados apos a leitura dos arquivos .md existentes naquela rodada historica. O snapshot foi alinhado a versao atual, Prompt-Audit-Human-CI.md, Prompt-Security.md e Prompt-Systematization.md foram catalogados no Prompt-Index.md, e a manutencao funcional pos-release passou a ter regra explicita em Production-Release-Phase.md e Official-State-Machine.md. Registros que alteram codigo, schema, migration, testes ou comportamento de produto devem ser classificados como manutencao funcional pos-release, nao como patch puramente documental. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.23:
Corrigida a segunda rodada de auditoria de conflitos, redundancias e falhas de fluxo nos .md. A proibicao absoluta de criar migration em STATE-08 foi refinada para permitir apenas manutencao funcional pos-release explicitamente solicitada e registrada. Phase-Handoff-Template.md deixou de declarar STATE-05 como estado atual e passou a tratar a frase como historico, apontando Current-State.md como fonte vigente. Prompt-Index.md passou a catalogar tambem os artefatos de evidencia e relatorios para cobrir os .md existentes naquela rodada historica sem transforma-los em prompts operacionais. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.24:
Executada limpeza e sistematizacao final dos .md existentes naquela rodada historica. Prompt-Audit-Human-CI.md, Prompt-Security.md, Prompt-Systematization.md, Revision-Prompt.md e Restructuring-Prompt.md foram reestruturados em ASCII limpo, com regras de autoridade, escopo, entregaveis e restricoes claras. Official-State-Machine.md teve setas Unicode substituidas por ASCII. Relatorios Human CI historicos foram ajustados para deixar claro que estados STATE-02, STATE-05 e STATE-06 eram vigentes na validacao historica, nao o estado atual. Todos os .md foram normalizados sem trailing whitespace, sem bytes UTF-8 invalidos, sem caracteres nao ASCII, sem referencias .md quebradas e com cobertura completa em Prompt-Index.md. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.25:
Registrada manutencao funcional pos-release dos scripts operacionais npm run start, npm run stop e npm run restart. O start inicia o Docker Desktop minimizado e aguarda o daemon antes de subir o PostgreSQL; o stop para os servicos da aplicacao, para o PostgreSQL e encerra o Docker Desktop; o restart executa stop completo e depois start, cumprindo a ordem parar banco, encerrar Docker, iniciar Docker e iniciar banco. Foi criado scripts/docker-desktop.ps1 como helper compartilhado e a sintaxe PowerShell dos scripts alterados foi validada estaticamente. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.26:
Registrada manutencao funcional pos-release dos prompts Prompt-Auth.md, Prompt-Dashboard.md e Prompt-Adjustments.md. O registro cobre hardening de autenticacao e sessao, politica de senha, bloqueio de tentativas, revogacao de access token, refresh/logout reforcados, dashboard personalizavel por usuario, Kanban interno por atividade, historico de tarefas, cores por equipe, gestao ampliada de perfis/RBAC e ajustes de frontend. Migrations registradas: 20260701120000_auth_session_hardening, 20260701182603_add_dashboard_personalization e 20260701193000_activity_internal_kanban_and_role_management. Prompt-Index.md passou a catalogar os tres prompts novos. Validacoes locais aprovadas: git diff --check, npm run prisma:validate, npm run typecheck, npm test, npm run lint e npm run build. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.27:
Executada auditoria completa dos .md com foco nos arquivos recentes em prompts/. Foram corrigidos conflito, redundancia, erro de estrutura e possivel falha de fluxo nos prompts Prompt-Interface-UI-UX.md, Prompt-Dashboard.md, Prompt-Adjustments.md, Prompt-Auth.md e Prompt-Password.md. Prompt-Password.md foi adicionado ao Prompt-Index.md; Prompt-Auth.md e Prompt-Password.md agora declaram relacao complementar; Prompt-Dashboard.md deixou de duplicar requisitos; Prompt-Adjustments.md removeu marcadores de titulo duplicados e caracteres Unicode; Prompt-Interface-UI-UX.md foi reestruturado como prompt operacional canonico. Validacoes documentais executadas: contagem de .md, cobertura no indice, referencias .md, caracteres nao ASCII e git diff --check. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.28:
Executada segunda passada minuciosa sobre todos os .md. Referencias historicas a contagens antigas foram reescritas para nao parecerem contagem atual, preservando o sentido historico da rodada em que foram registradas. Naquela rodada, os controles foram alinhados a contagem entao validada de 74 .md, sem alterar estado, codigo, schema, migration, runtime ou tooling. A contagem atual deve ser obtida no momento da execucao. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.29:
Executada terceira passada de auditoria dos .md com foco em conflito semantico nos prompts recentes. Prompt-Dashboard.md foi corrigido para remover ambiguidade entre persistencia por perfil e persistencia por usuario: personalizacao salva usa userId e companyId; perfil ou tipo de dashboard pode servir apenas como template/default. Controles canonicos foram atualizados sem alterar estado, codigo, schema, migration, runtime ou tooling. STATE-08 PRODUCTION_RELEASE permanece como estado atual.

Patch 1.4.30:
Executada quarta passada de auditoria dos .md com foco em relatorios retrospectivos e logs historicos. Automatic-Review-Audit-Architecture.md, Automatic-Review-Audit-Project-Setup.md, Human-CI-Validation-Architecture-Retrospective.md, Human-CI-Validation-Project-Setup.md, Project-Snapshot.md e State-Transition-Log.md foram corrigidos para trocar mencoes ambiguas a "estado atual STATE-04" por "estado vigente naquele registro". A correcao preserva o historico e evita conflito com o estado atual declarado, STATE-08 PRODUCTION_RELEASE.

Patch 1.4.31:
Executada quinta passada de auditoria dos .md para elevar o sistema ao padrao corporativo internacional. Automatic-Review-Audit-Database-Modelling.md, Database-Modelling-Document.md, Human-CI-Validation-Architecture.md, Human-CI-Validation-Database-Modelling.md e Solution-Architecture-Document.md receberam REGRA DE OURO. Backend-Phase.md, Database-Modelling-Phase.md, Frontend-Phase.md, Solution-Architecture-Phase.md e System-Reorganisation-Codex-Prompt.md receberam cabecalho institucional e PAPEL OPERACIONAL. Prompt-System-Readme.md e Prompt-System-Audit.md passaram a declarar checklist explicito de padrao corporativo internacional.

Patch 1.4.32:
Executada sexta passada de auditoria integrada dos .md. Titulos genericos foram padronizados para leitura corporativa isolada: Automatic-Review-Audit-Database-Modelling.md, Database-Modelling-Document.md, Human-CI-Validation-Architecture.md, Human-CI-Validation-Database-Modelling.md, Current-State.md, Prompt-System-Change-Log.md, Prompt-System-Version.md e Start-Here.md agora declaram funcao, estado ou proposito no primeiro cabecalho.

Patch 1.4.33:
Executada setima passada minuciosa dos .md. System-Reorganisation-Codex-Prompt.md foi reorganizado para manter REGRA DE OURO imediatamente apos o titulo e antes do PAPEL OPERACIONAL, alinhando a ordem estrutural ao padrao corporativo internacional.

Patch 1.4.34:
Prompt-Audit-Full.md foi integrado ao sistema canonico de prompts. O arquivo foi reestruturado em padrao corporativo ASCII, com REGRA DE OURO, objetivo, escopo, validacao, relatorio, evidencias, criterio de aprovacao e resultado final. A contagem fixa contraditoria de arquivos foi removida; a auditoria passa a contar os .md canonicos no momento da execucao. Prompt-Index.md, Current-State.md, Project-Snapshot.md, Prompt-System-Audit.md, Prompt-System-Change-Log.md e State-Transition-Log.md foram atualizados.

---

REGRA DE REGISTRO

Toda mudanca deve atualizar:

* Prompt-System-Version.md, quando alterar versao.
* Prompt-System-Versioning-Policy.md, quando alterar regra de versionamento.
* Prompt-System-Change-Log.md.
* Project-Snapshot.md, quando impactar evidencias ou decisoes.

Atualizar versao nao altera estado.
