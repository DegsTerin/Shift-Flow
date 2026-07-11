AUDITORIA DO SISTEMA DE PROMPTS

REGRA DE OURO

Nenhum prompt, gate, agente, auditoria, snapshot ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Definir uma auditoria periodica do proprio sistema de prompts.

---

QUANDO EXECUTAR

Executar esta auditoria:

* A cada mudanca de versao.
* Antes de declarar ausencia de conflitos.
* Depois de criar, renomear ou remover arquivo de controle.
* Depois de alterar State Machine, Guard Rails, Acceptance Criteria ou Module Phase Matrix.

---

CHECKLIST DE AUDITORIA

0. Padrao corporativo internacional

* O arquivo possui titulo claro e estavel?
* A REGRA DE OURO aparece quando o arquivo tem autoridade operacional, historica, tecnica ou de validacao?
* O texto separa estado atual de estado historico?
* O arquivo usa ASCII limpo, sem caracteres decorativos ou diagramas Unicode?
* A classificacao entre patch documental e manutencao funcional pos-release esta clara?
* O texto evita linguagem informal, ambigua ou conversacional como abertura principal?

1. Estados

* Existem estados duplicados?
* Existem estados antigos como *_READY ou *_APPROVED usados como estado?
* Todos os estados canonicos usam IDs STATE-00 a STATE-08?

2. Autoridade

* Algum gate declara poder de alterar estado?
* Algum snapshot, log, indice, template ou politica declara poder de alterar estado?
* A regra de ouro esta presente nos arquivos de controle?

3. Modulos

* Algum modulo mistura banco, backend e frontend fora da fase?
* Todos os modulos cross-layer usam Module-Phase-Matrix.md?
* Todos os modulos possuem ID MOD quando aplicavel?

4. Tooling

* Algum arquivo permite tooling de setup fora de STATE-01 SETUP_PROJECT?
* Algum prompt permite alterar package.json fora de SETUP_PROJECT?
* Algum prompt permite executar Prisma CLI fora das permissoes explicitas de migration?

5. Referencias

* Todos os arquivos referenciados existem?
* Prompt-Index.md lista todos os arquivos operacionais?
* Canonical-State-And-Module-IDs.md lista todos os controles relevantes?

6. Execucao

* Start-Here.md e o entrypoint oficial?
* Allowed-Commands-By-State.md cobre todos os estados?
* Current-State.md esta coerente com Project-Snapshot.md?

7. Versionamento

* Prompt-System-Version.md esta atualizado?
* Prompt-System-Change-Log.md registrou a mudanca?
* Mudanca MAJOR, MINOR ou PATCH foi classificada corretamente?

---

REGISTRO 2026-07-02 - 1.4.35

Resultado:
Manutencao funcional pos-release registrada sem transicao de estado.

Evidencias:

* Prompt-System-Version.md atualizado para 1.4.35.
* Prompt-System-Change-Log.md registra a manutencao funcional.
* Current-State.md e State-Transition-Log.md preservam STATE-08 PRODUCTION_RELEASE.
* Contagem atual validada no momento da execucao: 75 .md.

Conflitos resolvidos:

* Referencias que chamavam 74 .md de contagem atual foram superadas pela contagem dinamica validada de 75 .md.
* Correcoes funcionais derivadas de Prompt-Audit-Full.md foram classificadas como manutencao funcional pos-release.

FORMATO DE SAIDA

AUDITORIA DO SISTEMA DE PROMPTS

STATUS:
VERSAO:
ARQUIVOS AUDITADOS:
CONFLITOS ENCONTRADOS:
CORRECOES NECESSARIAS:
RISCO:
RECOMENDACAO:

---

ULTIMA AUDITORIA REGISTRADA

Data: 2026-07-11
Versao: 1.4.41
Arquivos auditados: Todo codigo e configuracao versionado, manifesto de comentarios, gate automatico, padroes de desenvolvimento e controles canonicos.
Status: APROVADO APOS EXPANSAO DE COMENTARIOS EN-GB
Conflitos encontrados:
* A regra anterior exigia comentario por declaracao apenas no CSS e nao cobria formalmente as demais linguagens.
* JSON estrito, arquivos gerados e migrations aplicadas nao podiam receber comentarios sem quebrar sintaxe, geracao ou checksum.
Correcoes aplicadas:
* As 157 fontes editaveis comentaveis receberam cabecalho en-GB especifico por responsabilidade.
* docs/source-commenting-manifest.md documenta 17 excecoes sintaticas, geradas e imutaveis.
* scripts/verify-source-comments.mjs valida 157 fontes e todas as 1.266 declaracoes CSS.
* npm run comments:verify foi integrado a npm run quality.
Risco:
* Comentarios genericos podem perder valor se nao forem atualizados junto com a responsabilidade do arquivo.
Recomendacao:
* Manter comentarios focados em intencao, invariantes e restricoes, evitando narracao redundante de sintaxe. Quality, 28 testes unitarios e build foram aprovados nesta rodada.

Data: 2026-07-11
Versao: 1.4.40
Arquivos auditados: Fontes frontend Next.js, CSS global, Prompt-Interface-UI-UX.md, Prompt-Adjustments.md, docs/development-standards.md e controles canonicos.
Status: APROVADO APOS ALINHAMENTO DE SEMANTICA E RESPONSIVIDADE
Conflitos encontrados:
* O requisito citava index.html, mas o unico arquivo com esse nome e gerado em apps/web/.next/.
* A lista de perfis usava agrupamento generico em vez de ul e li.
* Metadata descrevia o produto como scaffold e o CSS nao documentava cada declaracao em en-GB.
Correcoes aplicadas:
* Fontes React e CSS reais documentadas; index.html gerado explicitamente protegido contra edicao manual.
* Main primario, skip link, landmarks rotulados, metadata e estrutura semantica de perfis implementados.
* Todas as declaracoes de globals.css receberam comentario curto en-GB sobre finalidade e uso.
* Axe validou login em 390x844, 820x1180 e 1440x900 sem violacao seria ou critica e sem overflow horizontal.
* .prettierignore passou a preservar prompts/*.md sem retirar o restante do projeto do gate de formatacao.
Risco:
* O volume de comentarios aumenta o tamanho do arquivo fonte, mas nao altera o CSS entregue nem o comportamento funcional.
Recomendacao:
* Manter o mesmo padrao em novas regras CSS e validar typecheck, lint, build e acessibilidade em alteracoes futuras.

Data: 2026-07-11
Versao: 1.4.39
Arquivos auditados: 75 arquivos canonicos em prompts/, docs/governance-index.md e controles canonicos de versionamento, estado, snapshot, auditoria e log.
Status: APROVADO APOS MIGRACAO DE EXTENSAO
Conflitos encontrados:
* O corpus usava extensao .txt apesar de possuir estrutura documental Markdown.
* Referencias internas e indices dependiam dos nomes anteriores.
Correcoes aplicadas:
* Todos os 75 arquivos canonicos foram renomeados de .txt para .md.
* Referencias internas e o indice de governanca foram atualizados para os novos caminhos.
* Controles canonicos foram atualizados para 1.4.39.
Risco:
* Integracoes externas que mantenham caminhos .txt fora do repositorio devem ser atualizadas pelos respectivos responsaveis.
Recomendacao:
* Usar exclusivamente os caminhos .md catalogados em Prompt-Index.md.

Data: 2026-07-03
Versao: 1.4.38
Arquivos auditados: Prompt-Interface-UI-UX.md e controles canonicos de versionamento, estado, snapshot, auditoria e log.
Status: APROVADO APOS AMPLIACAO DE VISUAL QA
Conflitos encontrados:
* Prompt-Interface-UI-UX.md ainda nao detalhava auditoria Pixel Perfect, regressao visual automatica, comparacao por screenshots, criterios opticos subjetivos e heuristicas de UX.
Correcoes aplicadas:
* Adicionadas verificacoes de simetria, equilibrio de areas em branco, consistencia optica, alinhamento optico de icones, ritmo visual, hierarquia por contraste, radius, sombras, transicoes, escala tipografica e densidade visual entre telas.
* Adicionadas secoes Qualidade Visual Premium, Auditoria Pixel Perfect, Regressao Visual, Heuristicas de UX e Inspecao Visual Final.
* Fluxo, validacao, evidencias, criterio de aprovacao, relatorio obrigatorio e resultado final foram ampliados para cobrir screenshots, baseline, Visual Regression Testing e heuristicas de Nielsen.
* Controles canonicos foram atualizados para 1.4.38.
Risco:
* Visual Regression Testing depende de baseline ou ferramenta disponivel; quando inexistente, deve ser criada ou recomendada baseline inicial sem mascarar regressao existente.
Recomendacao:
* Usar Playwright ou ferramenta equivalente para capturas, matriz de viewports e comparacao visual quando executar auditorias UI UX.

Data: 2026-07-03
Versao: 1.4.37
Arquivos auditados: Prompt-Interface-UI-UX.md e controles canonicos de versionamento, estado, snapshot, auditoria e log.
Status: APROVADO APOS PADRONIZACAO DE PROMPT UI UX
Conflitos encontrados:
* Prompt-Interface-UI-UX.md continha secoes duplicadas, listas concorrentes de viewports e escopo nao verificavel para paginas futuras.
* O prompt misturava comandos de correcao imediata com restricoes contra mudanca funcional, criando ambiguidade operacional.
* Tema escuro, Modo TV e Design System oficial eram citados sem condicao de existencia ou fonte canonica.
* Faltavam evidencias, criterio de aprovacao, relatorio obrigatorio e resultado final no mesmo padrao de prompts executivos.
Correcoes aplicadas:
* Prompt-Interface-UI-UX.md foi reestruturado em formato canonico ASCII, sem headings Markdown.
* O escopo foi limitado a telas e componentes existentes; paginas futuras viraram diretriz de governanca.
* Tema escuro e Modo TV passaram a ser condicionados a implementacao existente.
* Fontes canonicas do Design System, fluxo de execucao, classificacao de severidade, validacoes, evidencias, criterio de aprovacao, relatorio e resultado final foram definidos.
* Controles canonicos foram atualizados para 1.4.37.
Risco:
* Auditorias visuais continuam amplas e devem registrar pendencias quando a correcao exigir mudanca funcional fora do escopo.
Recomendacao:
* Executar Prompt-Interface-UI-UX.md com inventario inicial de telas, matriz minima de viewports e validacao visual proporcional.

Data: 2026-07-02
Versao: 1.4.36
Arquivos auditados: Todos os .md em prompts/ e controles canonicos de versionamento, estado, snapshot, auditoria e log.
Status: APROVADO APOS INCLUSAO DE REGRA DE COMMIT
Conflitos encontrados:
* A obrigacao de commitar alteracoes dependia de instrucao conversacional ou memoria operacional, nao de regra canonica nos .md.
Correcoes aplicadas:
* Todos os arquivos .md canonicos receberam REGRA DE COMMIT.
* A regra exige commit local com escopo fechado quando houver mudancas de arquivo.
* A regra proibe incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.
* Controles canonicos foram atualizados para 1.4.36.
Risco:
* O commit deve continuar respeitando worktree sujo e nao deve incluir mudancas de usuario fora do escopo.
Recomendacao:
* Antes de commitar, executar git status, git diff --check e revisar o escopo staged.

Data: 2026-07-02
Versao: 1.4.34
Arquivos auditados: Prompt-Audit-Full.md, Prompt-Index.md e controles canonicos de versionamento, estado, snapshot, auditoria e log.
Status: APROVADO APOS INTEGRACAO DOCUMENTAL
Conflitos encontrados:
* Prompt-Audit-Full.md era arquivo novo nao catalogado no Prompt-Index.md.
* O texto original fixava contagens divergentes de arquivos .md.
* O arquivo usava Markdown e caracteres nao ASCII fora do padrao documental atual.
Correcoes aplicadas:
* Prompt-Audit-Full.md foi reestruturado em padrao corporativo ASCII.
* A contagem fixa foi removida e substituida por contagem dinamica no momento da execucao.
* Prompt-Audit-Full.md foi catalogado no Prompt-Index.md.
* Controles canonicos foram atualizados para 1.4.34.
Risco:
* Auditorias funcionais completas sao amplas e devem separar diagnostico de correcao funcional.
Recomendacao:
* Executar Prompt-Audit-Full.md como auditoria evidencial e so aplicar correcoes funcionais quando houver solicitacao explicita.

Data: 2026-07-02
Versao: 1.4.33
Arquivos auditados: Todos os .md em prompts/, com foco em ordem estrutural de blocos, regra de autoridade e padrao corporativo internacional.
Status: APROVADO APOS SETIMA CORRECAO DOCUMENTAL
Conflitos encontrados:
* System-Reorganisation-Codex-Prompt.md tinha PAPEL OPERACIONAL antes de REGRA DE OURO, deixando a regra de autoridade depois de contexto operacional.
Correcoes aplicadas:
* System-Reorganisation-Codex-Prompt.md foi reorganizado para a ordem titulo, REGRA DE OURO, PAPEL OPERACIONAL e hierarquia.
* Prompt-System-Version.md, Prompt-System-Change-Log.md, Current-State.md, Project-Snapshot.md, Prompt-System-Audit.md e State-Transition-Log.md foram atualizados para 1.4.33.
Risco:
* Prompts de alta autoridade podem criar ambiguidade se a regra de autoridade nao vier antes do contexto operacional.
Recomendacao:
* Manter REGRA DE OURO no topo dos prompts de governanca antes de papeis, objetivos ou instrucoes executivas.

Data: 2026-07-02
Versao: 1.4.32
Arquivos auditados: Todos os .md em prompts/, com foco em titulos, leitura isolada, padrao corporativo internacional e consistencia entre controles.
Status: APROVADO APOS SEXTA CORRECAO DOCUMENTAL
Conflitos encontrados:
* Alguns arquivos tinham primeiro cabecalho generico demais para leitura isolada em padrao corporativo.
* Relatorios e controles dependiam do nome do arquivo ou do indice para informar claramente estado, funcao ou proposito.
Correcoes aplicadas:
* Automatic-Review-Audit-Database-Modelling.md, Database-Modelling-Document.md, Human-CI-Validation-Architecture.md e Human-CI-Validation-Database-Modelling.md receberam estado no titulo.
* Current-State.md, Prompt-System-Change-Log.md, Prompt-System-Version.md e Start-Here.md receberam titulo mais explicito.
* Prompt-System-Version.md, Prompt-System-Change-Log.md, Current-State.md, Project-Snapshot.md, Prompt-System-Audit.md e State-Transition-Log.md foram atualizados para 1.4.32.
Risco:
* Novos arquivos com titulos genericos podem voltar a depender do indice para entendimento basico.
Recomendacao:
* Todo novo .md deve ser compreensivel pelo primeiro cabecalho, mesmo quando lido fora do diretorio prompts/.

Data: 2026-07-02
Versao: 1.4.31
Arquivos auditados: Todos os .md em prompts/, com foco em padrao corporativo internacional, REGRA DE OURO e cabecalhos institucionais.
Status: APROVADO APOS QUINTA CORRECAO DOCUMENTAL
Conflitos encontrados:
* Alguns documentos historicos e tecnicos ainda nao possuiam REGRA DE OURO, apesar de registrarem evidencias, validacoes ou arquitetura.
* Alguns prompts de fase abriam com linguagem conversacional antes de declarar cabecalho institucional.
* O checklist de auditoria ainda nao explicitava o padrao corporativo internacional como criterio proprio.
Correcoes aplicadas:
* Automatic-Review-Audit-Database-Modelling.md, Database-Modelling-Document.md, Human-CI-Validation-Architecture.md, Human-CI-Validation-Database-Modelling.md e Solution-Architecture-Document.md receberam REGRA DE OURO.
* Backend-Phase.md, Database-Modelling-Phase.md, Frontend-Phase.md, Solution-Architecture-Phase.md e System-Reorganisation-Codex-Prompt.md receberam cabecalho institucional e PAPEL OPERACIONAL.
* Prompt-System-Readme.md e Prompt-System-Audit.md passaram a declarar padrao corporativo internacional.
Risco:
* Novos .md podem degradar o padrao se nao passarem pelo checklist de auditoria.
Recomendacao:
* Antes de concluir qualquer nova rodada documental, validar REGRA DE OURO, titulo institucional, ASCII, contexto temporal e classificacao de manutencao.

Data: 2026-07-02
Versao: 1.4.30
Arquivos auditados: Todos os .md em prompts/, com foco em relatorios retrospectivos, logs historicos e mencoes a estado atual.
Status: APROVADO APOS QUARTA CORRECAO DOCUMENTAL
Conflitos encontrados:
* Relatorios retrospectivos de STATE-01 e STATE-02 ainda declaravam STATE-04 BACKEND_IMPLEMENTATION como estado atual sem explicitar que isso valia apenas na data daqueles registros.
* State-Transition-Log.md e Project-Snapshot.md continham frases historicas que apresentavam STATE-04 como estado preservado sem contexto temporal explicito, criando risco de conflito com STATE-08 PRODUCTION_RELEASE.
Correcoes aplicadas:
* Automatic-Review-Audit-Architecture.md, Automatic-Review-Audit-Project-Setup.md, Human-CI-Validation-Architecture-Retrospective.md e Human-CI-Validation-Project-Setup.md passaram a usar "estado vigente naquele registro".
* Project-Snapshot.md e State-Transition-Log.md foram alinhados para preservar historico sem declarar STATE-04 como estado atual.
* Prompt-System-Version.md, Prompt-System-Change-Log.md, Current-State.md e Prompt-System-Audit.md foram atualizados para 1.4.30.
Risco:
* Novos relatorios historicos devem sempre separar estado vigente na data do registro e estado atual consultado em Current-State.md.
Recomendacao:
* Em auditorias futuras, tratar frases "estado atual STATE-0x" em documentos historicos como achado se nao houver contexto temporal explicito.

Data: 2026-07-02
Versao: 1.4.29
Arquivos auditados: Todos os .md em prompts/, com foco nos prompts recentes e na consistencia semantica de Prompt-Dashboard.md.
Status: APROVADO APOS TERCEIRA CORRECAO DOCUMENTAL
Conflitos encontrados:
* Prompt-Dashboard.md mencionava persistencia por perfil ou usuario no objetivo, mas a secao de persistencia definia userId e companyId como escopo minimo.
Correcoes aplicadas:
* Prompt-Dashboard.md passou a declarar que personalizacao salva usa usuario e empresa.
* Layout por perfil ou tipo de dashboard foi limitado a template/default, sem substituir preferencia individual.
* Prompt-System-Version.md, Prompt-System-Change-Log.md, Current-State.md, Project-Snapshot.md, Prompt-System-Audit.md e State-Transition-Log.md foram alinhados ao patch 1.4.29.
Risco:
* Implementacoes futuras de dashboard devem separar template padrao de configuracao persistida do usuario.
Recomendacao:
* Validar qualquer schema/API de dashboard contra userId e companyId antes de executar mudanca funcional.

Data: 2026-07-02
Versao: 1.4.28
Arquivos auditados: Todos os .md em prompts/ e controles canonicos impactados por contagens historicas.
Status: APROVADO APOS SEGUNDA CORRECAO DOCUMENTAL
Conflitos encontrados:
* Registros historicos ainda citavam contagens antigas de arquivos ou prompts de forma que poderia ser confundida com a contagem atual.
* Prompt-Index.md descrevia artefatos de evidencia usando contagem historica, apesar de o diretorio prompts/ conter 74 .md naquela rodada.
Correcoes aplicadas:
* Referencias numericas historicas foram reescritas para preservar o contexto historico sem competir com a contagem atual.
* Prompt-System-Version.md, Prompt-System-Change-Log.md, Current-State.md, Project-Snapshot.md, Prompt-System-Audit.md e State-Transition-Log.md foram alinhados ao patch 1.4.28.
* Validacao final daquela rodada confirmou 74 .md, zero arquivos fora de Prompt-Index.md, zero referencias .md quebradas, zero caracteres nao ASCII e git diff --check limpo.
Risco:
* Novos prompts precisam atualizar Prompt-Index.md e os controles de versionamento para evitar nova divergencia de contagem.
Recomendacao:
* Tratar contagens antigas apenas como historico e usar validacao automatizada para contagem atual.

Data: 2026-07-02
Versao: 1.4.27
Arquivos auditados: Todos os .md em prompts/, com foco em Prompt-Interface-UI-UX.md, Prompt-Dashboard.md, Prompt-Adjustments.md, Prompt-Auth.md, Prompt-Password.md e controles canonicos de indice, versao, changelog, snapshot, current state, auditoria e log de transicao.
Status: APROVADO APOS CORRECAO DOCUMENTAL
Conflitos encontrados:
* Prompt-Password.md existia em prompts/ mas nao estava catalogado no Prompt-Index.md.
* Prompt-Interface-UI-UX.md estava fora do formato operacional canonico usado pelos prompts recentes.
* Prompt-Dashboard.md duplicava requisitos de dashboard personalizavel em secoes sobrepostas.
* Prompt-Adjustments.md continha marcadores de titulo duplicados e caracteres Unicode.
* Prompt-Auth.md e Prompt-Password.md tinham sobreposicao de escopo sem fronteira explicita.
* Prompts recentes voltaram a conter caracteres nao ASCII apos a normalizacao 1.4.24.
Correcoes aplicadas:
* Prompt-Interface-UI-UX.md, Prompt-Dashboard.md, Prompt-Adjustments.md, Prompt-Auth.md e Prompt-Password.md foram reestruturados em ASCII, com regra de ouro, escopo, restricoes, criterios de aceite e entregaveis.
* Prompt-Password.md foi adicionado ao Prompt-Index.md.
* Prompt-Auth.md e Prompt-Password.md passaram a declarar relacao complementar.
* Prompt-Dashboard.md foi deduplicado e separado por escopo, widgets, persistencia, backend, frontend, restricoes e criterios.
* Prompt-Adjustments.md teve marcadores de titulo duplicados removidos e o diagrama Unicode substituido por texto ASCII.
* Prompt-System-Version.md, Prompt-System-Change-Log.md, Current-State.md, Project-Snapshot.md, Prompt-System-Audit.md e State-Transition-Log.md foram atualizados para 1.4.27.
Risco:
* Mudancas funcionais futuras ainda dependem de solicitacao explicita, classificacao pos-release e gates proporcionais.
Recomendacao:
* Manter Prompt-Index.md como fonte para descobrir prompts operacionais e repetir validacao documental apos novos .md.

Data: 2026-07-01
Versao: 1.4.26
Arquivos auditados: Controles canonicos de manutencao pos-release, prompts novos em prompts/, migrations, schema, backend, frontend e documentacao alterada.
Status: APROVADO COM OBSERVACAO DOCUMENTAL
Conflitos encontrados:
* Prompt-Auth.md, Prompt-Dashboard.md e Prompt-Adjustments.md existiam como entradas operacionais novas, mas ainda precisavam ser catalogados em Prompt-Index.md.
* As alteracoes associadas envolvem schema, migrations, backend, frontend, testes e documentacao, portanto precisavam ser registradas como manutencao funcional pos-release.
* As migrations 20260701120000_auth_session_hardening, 20260701182603_add_dashboard_personalization e 20260701193000_activity_internal_kanban_and_role_management precisavam ficar rastreadas nos controles canonicos.
* Scripts npm run start, npm run stop e npm run restart precisavam explicitar o ciclo operacional do Docker Desktop e PostgreSQL.
* O fluxo anterior nao encerrava Docker Desktop no stop e o restart ainda podia preservar banco via KeepDatabase, contrariando a ordem solicitada.
* Prompt-Audit-Human-CI.md, Prompt-Security.md, Prompt-Systematization.md, Revision-Prompt.md e Restructuring-Prompt.md tinham redundancia, organizacao irregular e encoding inconsistente.
* Official-State-Machine.md continha setas Unicode em um sistema documental padronizado em ASCII.
* Relatorios Human CI historicos mencionavam Current-State.md declarando STATE-02, STATE-05 ou STATE-06 sem deixar claro que eram registros historicos.
* Varios .md continham trailing whitespace ou CR residual.
* Production-Release-Phase.md e Allowed-Commands-By-State.md proibiam criar migration nova de forma absoluta em STATE-08, enquanto a regra 1.4.22 permitia manutencao funcional pos-release explicitamente solicitada e registrada.
* Phase-Handoff-Template.md mantinha frase historica dizendo que STATE-05 FRONTEND_IMPLEMENTATION era o estado operacional atual, criando risco de leitura conflitante com Current-State.md.
* Prompt-Index.md catalogava prompts e controles, mas nao listava os artefatos de evidencia e relatorios, reduzindo rastreabilidade dos .md existentes naquela rodada historica.
* Project-Snapshot.md declarava versao 1.4.16 no cabecalho, enquanto Prompt-System-Version.md declarava 1.4.21.
* Prompt-Security.md, Prompt-Systematization.md e Prompt-Audit-Human-CI.md existiam na raiz, mas nao estavam catalogados em Prompt-Index.md.
* Registros pos-release mencionavam migrations, backend, frontend, testes e comportamento de produto dentro de STATE-08 PRODUCTION_RELEASE sem uma classificacao canonica suficiente entre patch documental e manutencao funcional pos-release.
* Production-Release-Phase.md proibia alteracoes funcionais em release, mas nao explicitava a excecao operacional controlada para manutencao pos-release solicitada pelo usuario.
* Project-Snapshot.md declarava versao 1.3.8, enquanto Prompt-System-Version.md declarava 1.4.0.
* Ajustes e melhorias ja estavam descritos na conversa e em entradas pos-release, mas precisavam de registro documental canonico.
* O patch 1.4.1 registrava os ajustes, mas o README e o log de transicao ainda nao centralizavam explicitamente o fluxo de documentacao.
* A conversa recente ainda mencionava os prompts antigos da conversa inicial, mas o workspace atual ja esta reorganizado em baseline numerada com controles, fases, gates e relatorios adicionais.
* A baseline numerada continuava funcional, mas o usuario solicitou nomes sem numeros, em Pascal-Kebab-Case e en-GB.
* A aba aberta no IDE ainda podia apontar para "00 - Start Here.md" apos o rename, criando risco de confusao operacional.
* git status exibe o rename massivo como arquivos removidos e novos ate staging ou commit.
* Project-Snapshot.md declarava STATE-08 PRODUCTION_RELEASE no topo, mas mantinha redacao residual historica dizendo que STATE-06 INTEGRATION era o estado operacional atual.
* Phase-Handoff-Template.md mantinha redacao historica equivalente no handoff para STATE-06.
* A execucao funcional posterior ao Revision-Prompt.md precisava ser registrada nos .md canonicos atuais.
* A execucao funcional posterior ao Restructuring-Prompt.md tambem precisava ficar explicitamente associada a esta solicitacao atual de documentacao.
* Pendencias registradas anteriormente foram resolvidas por codigo: campos operacionais deixaram de ser apenas description, cliente deixou de ser derivado de atividades, soft delete ganhou tipo de historico e page.tsx foi decomposto.
* Ajustes funcionais mais recentes deste chat ainda nao estavam consolidados nos .md canonicos: acesso em rede, layout de menu/cabecalho, logout, RBAC hierarquico, Gestao de Clientes, remocao de Equipe em Turnos, limpeza de atividades, replicacao por usuarios da empresa e indices unicos parciais para soft delete.
Correcoes aplicadas:
* Versao do sistema de prompts atualizada para 1.4.1.
* Snapshot alinhado para 1.4.1 e ultima atualizacao 2026-06-22.
* Changelog recebeu entrada patch 1.4.1.
* Current State recebeu observacao documental sem alterar STATE-08 PRODUCTION_RELEASE.
* Versao do sistema de prompts atualizada para 1.4.2.
* README recebeu secao de documentacao de ajustes e melhorias.
* Snapshot, changelog, auditoria e log de transicao passaram a registrar a rodada documental 1.4.2.
* Versao do sistema de prompts atualizada para 1.4.3.
* Snapshot, changelog, README, Current State e log de transicao passaram a registrar a baseline documental vigente como fonte operacional intermediaria.
* Versao do sistema de prompts atualizada para 1.4.4.
* Todos os .md da raiz foram renomeados para Pascal-Kebab-Case sem prefixos numericos.
* Referencias internas aos nomes antigos foram substituidas pelos nomes canonicos atuais.
* Versao do sistema de prompts atualizada para 1.4.5.
* README, snapshot, changelog, current state, audit e transition log passaram a registrar o fechamento operacional da renomeacao.
* Versao do sistema de prompts atualizada para 1.4.6.
* Snapshot passou a tratar a secao de fases como historico e STATE-06 INTEGRATION como estado anterior, preservando STATE-08 PRODUCTION_RELEASE como estado atual declarado.
* Phase-Handoff-Template.md passou a tratar o handoff para STATE-06 como transicao historica, nao como estado atual.
* Current State, changelog, audit, README e transition log receberam registro da solicitacao atual do chat.
* Versao do sistema de prompts atualizada para 1.4.7.
* Current State, snapshot, changelog, auditoria, README e log de transicao receberam consolidacao explicita dos ajustes e melhorias deste chat nos nomes canonicos atuais.
* Foi reforcado que nomes numerados sao legado, Start-Here.md e o entrypoint vigente, e o estado atual permanece STATE-08 PRODUCTION_RELEASE.
* Versao do sistema de prompts atualizada para 1.4.8.
* Nova solicitacao de documentar ajustes e melhorias deste chat foi registrada como incremento de rastreabilidade nos controles canonicos existentes, sem novo arquivo de controle e sem alteracao funcional.
* Versao do sistema de prompts atualizada para 1.4.9.
* Nova solicitacao de documentar ajustes e melhorias deste chat foi registrada com contexto de aba legada "00 - Start Here.md"; Start-Here.md foi reafirmado como entrypoint canonico atual.
* Versao do sistema de prompts atualizada para 1.4.10.
* Nova solicitacao de documentar ajustes e melhorias deste chat foi registrada como delta incremental nos controles canonicos atuais, sem novo arquivo de controle, sem restaurar nomes numerados legados e sem alterar STATE-08 PRODUCTION_RELEASE.
* Versao do sistema de prompts atualizada para 1.4.11.
* Nova solicitacao equivalente foi registrada como delta documental, preservando Start-Here.md como entrypoint vigente e tratando a aba antiga "00 - Start Here.md" como referencia legada do IDE.
* Versao do sistema de prompts atualizada para 1.4.12.
* Nova solicitacao para documentar os ajustes e melhorias deste chat foi registrada como incremento documental nos controles canonicos atuais.
* A solicitacao foi resolvida sem criar arquivo novo, sem restaurar nomes numerados legados, sem executar fase, sem alterar codigo funcional e sem mudar STATE-08 PRODUCTION_RELEASE.
* Versao do sistema de prompts atualizada para 1.4.13.
* Consolidacao final deste chat registrada apos commits locais bda71a4 e ab18718.
* Confirmado que os nomes canonicos atuais sao Pascal-Kebab-Case sem numeracao e que "00 - Start Here.md" e referencia legada ao Start-Here.md vigente.
* Remote Git registrado como pendencia externa dependente de URL.
* Versao do sistema de prompts atualizada para 1.4.14.
* Current State, snapshot, changelog, auditoria e log de transicao receberam registro dos ajustes funcionais: decomposicao frontend, API de clientes, migration de campos operacionais de Activity, historico SOFT_DELETED, seeds e evidencias.
* Confirmado que os ajustes funcionais foram validados por typecheck, lint, unit tests, build, e2e e load test.
* Versao do sistema de prompts atualizada para 1.4.15.
* Snapshot, changelog, auditoria, versionamento, log de transicao e Restructuring-Prompt.md receberam delta documental desta solicitacao atual.
* Confirmado que a execucao de Restructuring-Prompt.md inclui WAITING_CUSTOMER, serviceName, dashboard por cliente, Kanban com sete status, encerrar/reabrir, responsividade mobile, migration 20260622103000_operational_dossier_status_service e evidencias aprovadas.
* Versao do sistema de prompts atualizada para 1.4.16.
* Current State, snapshot, changelog, auditoria, README e log de transicao receberam registro dos ajustes funcionais mais recentes deste chat.
* Confirmado que Equipes e Clientes usam indices unicos parciais para registros ativos, que Turnos nao dependem mais de Equipe e que usuarios/perfis seguem RBAC hierarquico por empresa.
* Versao do sistema de prompts atualizada para 1.4.18.
* Current State, snapshot, changelog, auditoria, log de transicao e relatorios/gates de production release receberam registro da auditoria global e Human CI completo executados neste chat.
* Confirmado que os gates finais locais passaram: Prisma, migrations, audit, overrides, lint, typecheck, unit tests, build, seeds, Playwright completo e stress de carga.
* Registrada como risco nao bloqueante a flutuacao inicial do p95 no teste de carga Playwright, pois as reexecucoes oficiais passaram sem alteracao funcional.
* Versao do sistema de prompts atualizada para 1.4.19.
* Current State, snapshot, changelog, auditoria, log de transicao e relatorios/gates de production release receberam registro das correcoes de defeitos pos-auditoria.
* Confirmado que os bloqueios foram corrigidos: Users respeita empresa ativa em get/update/remove; RBAC valida empresa, papel, permissao e vinculo; BaseRepository.update respeita companyId; JWT nao aceita fallback em producao; CORS_ORIGIN foi documentado; stress e axe foram estabilizados.
* Confirmado por supertest que tentativa cross-tenant em Users retorna 404 e tentativa RBAC para outra empresa retorna 403.
* Versao do sistema de prompts atualizada para 1.4.20.
* Current State, snapshot, changelog, auditoria e log de transicao receberam registro da nova solicitacao de 2026-06-23 para documentar os ajustes e melhorias deste chat.
* Confirmado que a solicitacao atual foi tratada como delta documental, sem nova fase, sem alteracao funcional, sem novo controle, sem restaurar nomes numerados legados e sem transicao de estado.
* Versao do sistema de prompts atualizada para 1.4.21.
* Current State, snapshot, changelog, auditoria e log de transicao receberam registro dos ajustes finais deste chat.
* Confirmado que Prompt-Audit-Human-CI.md foi reexecutado, os achados residuais foram corrigidos, a migration 20260623010000_refresh_tokens_company_scope foi criada, os testes de auth foram adicionados, credenciais fixas foram removidas/redigidas, Playwright passou a exigir DATABASE_URL via ambiente, artefatos gerados foram limpos e o commit dedf74f foi criado.
* Confirmado por evidencias locais que format:check, lint, typecheck, prisma validate, unit tests, auth tests, build, migrate status, npm audit, overrides, E2E e gitleaks historico/worktree passaram.
* Versao do sistema de prompts atualizada para 1.4.22.
* Project-Snapshot.md foi alinhado ao versionamento atual.
* Prompt-Security.md, Prompt-Systematization.md e Prompt-Audit-Human-CI.md foram adicionados ao Prompt-Index.md.
* Production-Release-Phase.md e Official-State-Machine.md passaram a explicitar que manutencao pos-release solicitada pelo usuario nao cria novo estado e nao altera STATE-08 PRODUCTION_RELEASE.
* Registros que envolvem codigo, schema, migration, testes, comportamento de produto ou configuracao operacional apos release devem ser classificados como manutencao funcional pos-release, nao como patch puramente documental.
* Versao do sistema de prompts atualizada para 1.4.23.
* Production-Release-Phase.md e Allowed-Commands-By-State.md passaram a proibir migration nova apenas fora de manutencao funcional pos-release explicitamente solicitada e registrada.
* Phase-Handoff-Template.md passou a tratar a mencao a STATE-05 como historica e a apontar Current-State.md como fonte do estado vigente.
* Prompt-Index.md recebeu secao de artefatos de evidencia e relatorios para listar os 22 .md restantes sem transforma-los em prompts operacionais.
* Versao do sistema de prompts atualizada para 1.4.24.
* Prompt-Audit-Human-CI.md, Prompt-Security.md, Prompt-Systematization.md, Revision-Prompt.md e Restructuring-Prompt.md foram reestruturados em formato limpo, ASCII e operacional.
* Official-State-Machine.md passou a usar setas ASCII.
* Human-CI-Validation-Architecture.md, Human-CI-Validation-Frontend-Implementation.md e Human-CI-Validation-Integration.md passaram a declarar estados antigos como historicos.
* Todos os .md existentes naquela rodada historica foram normalizados sem trailing whitespace.
* Validacoes finais: .md existentes naquela rodada historica, UTF-8 valido, zero caracteres nao ASCII, zero referencias .md quebradas, zero arquivos fora de Prompt-Index.md e git diff --check limpo para .md.
* Versao do sistema de prompts atualizada para 1.4.25.
* scripts/docker-desktop.ps1 criado para centralizar inicializacao minimizada, espera do daemon e encerramento do Docker Desktop.
* scripts/start.ps1 passou a iniciar Docker Desktop minimizado antes de docker compose up -d postgres.
* scripts/stop.ps1 passou a parar PostgreSQL e encerrar Docker Desktop no fluxo sem KeepDatabase.
* scripts/restart.ps1 passou a executar stop completo antes do start, sem preservar banco.
* Current State, snapshot, changelog, auditoria, README e log de transicao receberam registro da manutencao funcional pos-release.
* Validacao executada: parse estatico PowerShell dos scripts alterados retornou PowerShell syntax OK.
* Versao do sistema de prompts atualizada para 1.4.26.
* Prompt-Auth.md, Prompt-Dashboard.md e Prompt-Adjustments.md foram catalogados em Prompt-Index.md.
* Current State, snapshot, changelog, auditoria e log de transicao receberam registro da manutencao funcional pos-release.
* Registradas as migrations 20260701120000_auth_session_hardening, 20260701182603_add_dashboard_personalization e 20260701193000_activity_internal_kanban_and_role_management.
* Registrado o impacto em auth/sessao, dashboard personalizavel, Kanban interno por atividade, historico de tarefas, cores por equipe, roles/perfis e frontend.
* Validacoes locais aprovadas para 1.4.26: git diff --check, npm run prisma:validate, npm run typecheck, npm test, npm run lint e npm run build.
Risco:
* Alteracoes funcionais futuras continuam dependendo de fase/estado permitido, gates e evidencias.
* Referencias manuais aos prompts antigos da conversa inicial podem causar confusao se forem usadas como fonte operacional sem consultar Start-Here.md e Prompt-Index.md.
* A ordem alfabetica deixou de refletir a ordem operacional; usar Prompt-Index.md e Official-State-Machine.md para sequencia e autoridade.
* Abas antigas do IDE podem apontar para arquivos que foram renomeados; usar os nomes canonicos atuais.
* Qualquer mencao historica a STATE-06, STATE-07 ou nomes antigos de arquivos deve ser interpretada pelo contexto do historico, nao como estado atual.
* Pedidos repetidos de documentacao podem gerar redundancia se nao forem tratados como incrementos de rastreabilidade nos controles canonicos existentes.
* IDEs podem preservar abas antigas apos renomeacoes; essas abas devem ser tratadas como referencias legadas, nao como demanda para recriar arquivos antigos.
* Alteracoes funcionais pos-release ainda dependem de push conforme politica de entrega e remote Git disponivel.
* Secrets reais do GitHub/CI remoto nao podem ser validados localmente sem acesso ao ambiente remoto; a verificacao local confirma apenas ausencia de leaks no historico/worktree.
* A classificacao incorreta de manutencao funcional pos-release como patch documental pode ocultar risco operacional; usar a regra 1.4.22 como criterio de desempate.
* Blocos historicos de handoff podem ser confundidos com estado atual se forem lidos isoladamente; Current-State.md deve prevalecer.
* Reducoes de prompts externos preservam o escopo operacional, mas deixam de manter a redacao longa original; usar os registros historicos de snapshot/log para contexto de execucoes anteriores.
* Encerrar Docker Desktop no stop pode afetar outros projetos locais que dependam do Docker em execucao.
* A validacao atual foi estatica; execucao real de start/stop/restart ainda deve ser feita manualmente quando for aceitavel abrir/fechar Docker Desktop e alterar containers locais.
* As migrations 1.4.26 alteram schema e exigem deploy controlado em qualquer ambiente remoto.
* Mudancas de autenticacao, bloqueio de login e revogacao de tokens exigem validacao de fluxos de login, refresh, logout e expiracao antes de promover para ambiente compartilhado.
Recomendacao:
* Continuar usando Start-Here.md como entrypoint e aplicar Conflict-Resolution-Policy.md para qualquer conflito novo.
* Nao criar novos arquivos de controle para solicitacoes repetidas de documentacao quando changelog, snapshot, auditoria, versionamento, README e log de transicao bastarem.
* Antes de entrega remota, confirmar que os secrets POSTGRES_PASSWORD, DATABASE_URL e JWT_SECRET existem no GitHub/CI remoto.
* Para manutencoes pos-release, registrar pedido explicito, diagnostico, arquivos alterados, evidencias, gates proporcionais, riscos e pendencias, preservando STATE-08 PRODUCTION_RELEASE.
* Ao auditar estado atual, desconsiderar frases historicas de handoff como autoridade vigente e consultar Current-State.md.
* Manter os prompts globais curtos, classificados e com regra de autoridade explicita para evitar redundancia e execucao fora de fluxo.
* Antes de usar em rotina diaria, executar npm run start, npm run stop e npm run restart em uma janela controlada para confirmar o comportamento visual do Docker Desktop no ambiente Windows local.
* Antes de entrega remota da manutencao 1.4.26, executar prisma validate, migrate status/deploy em ambiente alvo, unit tests, typecheck, lint e build.

---

REGRA FINAL

Auditoria recomenda correcoes.
Auditoria nao altera estado.
