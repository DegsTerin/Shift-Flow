README DO SISTEMA DE PROMPTS

REGRA DE OURO

Nenhum prompt, gate, agente, documento operacional, snapshot ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

OBJETIVO

Este arquivo explica como usar o sistema de prompts no dia a dia.

---

COMO USAR

1. Consulte Start-Here.txt.
2. Consulte Current-State.txt.
3. Consulte Prompt-Index.txt.
4. Consulte Official-State-Machine.txt.
5. Confirme qual fase solicitada esta permitida pelo estado atual.
6. Use apenas comandos permitidos para essa fase.
7. Execute o prompt da fase solicitada permitida.
8. Se houver modulo, consulte Module-Phase-Matrix.txt.
9. Valide evidencias com Evidence-Standard.txt.
10. Valide conclusao com Acceptance-Criteria-By-State.txt e Global-Definition-Of-Done.txt.
11. Atualize Project-Snapshot.txt.
12. Registre a tentativa, bloqueio ou transicao em State-Transition-Log.txt.

---

COMO USAR PROMPTS DE REVISAO GLOBAL

Revision-Prompt.txt e Restructuring-Prompt.txt sao entradas operacionais pos-release.
Eles nao substituem a State Machine, nao liberam alteracao fora da fase permitida e nao concluem diagnostico por si mesmos.

Quando forem usados:

1. Tratar os documentos como escopo consolidado de diagnostico e correcao.
2. Separar achados por camada: arquitetura, banco, backend, frontend, integracao, testes e release.
3. Executar apenas a camada permitida pelo estado atual ou registrar bloqueio/conflito.
4. Registrar problemas encontrados, correcoes realizadas, evidencias, riscos e pendencias no snapshot e nos relatorios aplicaveis.

---

COMO DOCUMENTAR AJUSTES E MELHORIAS

Ajustes e melhorias devem ser documentados nos controles existentes, sem criar estado novo e sem usar snapshot, auditoria ou log como autoridade de transicao.

Use esta distribuicao:

* Project-Snapshot.txt: registrar impacto operacional, evidencias, pendencias e contexto atual.
* State-Transition-Log.txt: registrar tentativa, bloqueio, decisao da State Machine ou manutencao explicita do estado quando aplicavel.
* Prompt-System-Version.txt: registrar a versao atual quando houver mudanca no sistema de prompts.
* Prompt-System-Change-Log.txt: registrar o resumo da mudanca, impacto, conflitos resolvidos e estado afetado.
* Prompt-System-Audit.txt: registrar conclusao da auditoria do sistema de prompts antes de declarar ausencia de conflitos.
* Relatorios de fase ou modulo: registrar evidencias tecnicas quando a melhoria alterar comportamento de produto, API, banco, frontend, testes ou release.

Regra de classificacao pos-release:

* Se a solicitacao apos STATE-08 alterar codigo, schema, migration, testes, comportamento de produto ou configuracao operacional, classificar como manutencao funcional pos-release.
* Se a solicitacao apenas alinhar texto, indice, snapshot, changelog, auditoria ou log, classificar como patch documental.
* Manutencao funcional pos-release exige pedido explicito, evidencias, gates proporcionais, riscos, pendencias e registro de que STATE-08 PRODUCTION_RELEASE permanece atual.

Escopo documentado em 2026-06-22:

* alinhamento entre snapshot, versao, changelog, auditoria e README;
* registro de conflitos operacionais ja identificados;
* incorporacao de Revision-Prompt.txt e Restructuring-Prompt.txt como entradas pos-release;
* preservacao de STATE-08 PRODUCTION_RELEASE sem transicao de estado;
* uso dos controles existentes, sem criar novo arquivo de controle para a mesma finalidade.
* reconciliacao da conversa sobre 17 prompts antigos com a baseline numerada anterior;
* definicao da serie numerada anterior como etapa intermediaria de reorganizacao para proximas leituras e execucoes.
* renomeacao dos .txt para Pascal-Kebab-Case em en-GB, sem prefixos numericos.
* atualizacao das referencias internas para os nomes canonicos atuais.
* fechamento operacional da renomeacao, incluindo tratamento de abas antigas do IDE e comportamento do git status.
* registro da solicitacao atual do chat nos nomes canonicos atuais e correcao de redacao residual do snapshot sobre STATE-06.
* consolidacao 1.4.7 dos ajustes e melhorias deste chat nos controles canonicos atuais, sem criar novo controle, sem restaurar nomes numerados legados e sem alterar STATE-08 PRODUCTION_RELEASE.
* confirmacao 1.4.8 de que nova solicitacao para documentar ajustes e melhorias deste chat deve ser registrada como rastreabilidade incremental nos controles canonicos existentes, sem duplicar arquivos.
* confirmacao 1.4.9 de que aba antiga do IDE "00 - Start Here.txt" deve ser resolvida abrindo Start-Here.txt, sem recriar nomes numerados legados.
* confirmacao 1.4.10 de que novas solicitacoes semelhantes devem ser registradas como delta de rastreabilidade nos .txt canonicos atuais, preservando STATE-08 PRODUCTION_RELEASE e sem recriar arquivos numerados legados.
* confirmacao 1.4.11 de que nova solicitacao equivalente, mesmo quando o IDE ainda mostra aba "00 - Start Here.txt", deve ser documentada apenas como delta nos controles canonicos atuais, mantendo Start-Here.txt como entrypoint vigente.
* confirmacao 1.4.12 de que novas solicitacoes para documentar ajustes e melhorias deste chat devem continuar como incremento documental nos controles canonicos atuais, preservando STATE-08 PRODUCTION_RELEASE e sem restaurar nomes numerados legados.
* confirmacao 1.4.13 de que esta conversa tambem registra os commits locais bda71a4 e ab18718, preserva os nomes Pascal-Kebab-Case atuais e mantem remote Git como pendencia externa dependente de URL.
* confirmacao 1.4.16 de que os ajustes funcionais mais recentes deste chat ficam documentados nos controles canonicos: acesso local/rede, menu/cabecalho, logout, RBAC hierarquico, Gestao de Clientes, Turnos sem Equipe, limpeza de atividades, replicacao por usuarios da empresa e indices unicos parciais para Equipes/Clientes com soft delete.
* registro 1.4.25 de manutencao funcional pos-release dos scripts operacionais: npm run start inicia Docker Desktop minimizado e depois PostgreSQL; npm run stop para PostgreSQL e encerra Docker Desktop; npm run restart executa stop completo e depois start.

Regra pratica:

* Se houver divergencia entre nomes antigos de prompts e os nomes antigos ou arquivos legados, consultar Start-Here.txt, Prompt-Index.txt, Official-State-Machine.txt e Conflict-Resolution-Policy.txt.
* Nao recriar prompts antigos apenas porque foram mencionados na conversa; tratar esses nomes como historico ate que o usuario solicite explicitamente uma restauracao ou migracao.
* A ordem operacional nao depende mais de prefixo numerico no nome do arquivo; consultar Prompt-Index.txt e Official-State-Machine.txt.
* Novos .txt devem usar Pascal-Kebab-Case em en-GB e nome descritivo do conteudo real.
* Se o IDE ainda mostrar uma aba com nome antigo, fechar a aba e abrir o arquivo canonico atual. Exemplo: usar Start-Here.txt no lugar de "00 - Start Here.txt".
* Se git status mostrar deletes e untracked correspondentes aos .txt, tratar como rename massivo ate staging/commit; nao recriar arquivos antigos para limpar essa visualizacao.
* Se um trecho historico mencionar STATE-06 ou STATE-07, conferir o bloco ESTADO OPERACIONAL de Project-Snapshot.txt e Current-State.txt antes de tratar essa mencao como estado atual.
* Para proximas solicitacoes genericas como "documentar nos .txt", usar os arquivos canonicos atuais: Project-Snapshot.txt, State-Transition-Log.txt, Prompt-System-Version.txt, Prompt-System-Change-Log.txt, Prompt-System-Audit.txt e Prompt-System-Readme.txt.
* Para solicitacoes repetidas com o mesmo objetivo, registrar apenas o delta documental necessario e referenciar os patches anteriores, evitando criar novo arquivo ou duplicar conteudo ja consolidado.
* Se o contexto do IDE mencionar "00 - Start Here.txt", interpretar como referencia legada ao Start-Here.txt atual.
* Para repeticoes do mesmo pedido de documentacao, nao reabrir debate sobre nomes antigos: registrar o incremento no versionamento, changelog, auditoria, snapshot e log, mantendo o estado atual.
* A partir do patch 1.4.12, este padrao de registro incremental e a resolucao oficial para pedidos repetidos de "documentar os ajustes e melhorias deste chat nos .txt".
* A partir do patch 1.4.16, problemas de duplicidade apos exclusao logica devem ser verificados primeiro por indices unicos parciais no banco; Equipes e Clientes ja foram ajustados, enquanto e-mail de Usuario permanece unico por requisito de login.
* A partir do patch 1.4.22, alteracao funcional pos-release nao deve ser descrita como patch puramente documental; usar a classificacao manutencao funcional pos-release.
* A partir do patch 1.4.25, scripts operacionais que dependem de Docker devem preservar a ordem Docker Desktop -> PostgreSQL no start e PostgreSQL -> Docker Desktop no stop; restart deve executar ambos os fluxos completos.

---

ARQUIVOS PRINCIPAIS

Start-Here.txt:

* Ponto de entrada oficial.

Official-State-Machine.txt:

* Fluxo oficial.

Current-State.txt:

* Estado atual declarado.

Prompt-Index.txt:

* Catalogo dos prompts e controles.

Execution-Protocol.txt:

* Roteiro operacional.

Acceptance-Criteria-By-State.txt:

* Criterios por estado.

Evidence-Standard.txt:

* Padrao de evidencias.

Global-Definition-Of-Done.txt:

* Checklist global de conclusao.

Module-Phase-Matrix.txt:

* Mapeamento modulo x fase.

State-Transition-Log.txt:

* Historico de transicoes.

Prompt-System-Change-Log.txt:

* Historico de mudancas no sistema de prompts.

Prompt-System-Audit.txt:

* Auditoria periodica do proprio sistema de prompts.

---

REGRA FINAL

Se houver duvida, aplique Conflict-Resolution-Policy.txt.
Se houver bloqueio, aplique Blocked-State-Protocol.txt.
Se houver reversao, aplique Controlled-Rollback-Policy.txt.



