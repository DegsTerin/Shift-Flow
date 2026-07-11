ESTADO: STATE-07 TESTING_HOMOLOGATION

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

Execute auditoria completa do projeto.

ANTES DE EXECUTAR:

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
* Consultar Module-Phase-Matrix.md.
* Consultar State-Transition-Log.md.
* Consultar Blocked-State-Protocol.md se houver bloqueio.

Esta fase pode:

* Validar banco.
* Validar backend.
* Validar frontend.
* Validar APIs.
* Validar seguranca.
* Validar performance.
* Validar responsividade.
* Validar traducoes.
* Validar Dark Mode.
* Validar Light Mode.
* Validar filtros reais.
* Validar pesquisa global.
* Validar botoes "+ Novo".
* Validar CRUD completo e soft delete.
* Validar modal/drawer de detalhes.
* Validar historico operacional/timeline imutavel.
* Validar dashboard executivo e modo TV/monitoramento.
* Gerar relatorio de bugs.
* Gerar correcoes necessarias.
* Gerar melhorias recomendadas.
* Classificar cada correcao necessaria por estado de origem: DATABASE_MODELING, BACKEND_IMPLEMENTATION, FRONTEND_IMPLEMENTATION ou INTEGRATION.

Esta fase nao pode:

* Criar features novas.
* Alterar schema de banco.
* Alterar backend fora de correcao explicitamente autorizada.
* Alterar frontend fora de correcao explicitamente autorizada.
* Executar tooling de setup.
* Alterar estado.

---

VALIDACOES OBRIGATORIAS

Validar:

* Banco
* Backend
* Frontend
* APIs
* Seguranca
* Performance
* Responsividade
* Traducoes
* Dark Mode
* Light Mode
* PT-BR
* EN-GB
* Filtros em Dashboard Principal, Dashboard por Equipe, Kanban, Relatorios e listagens
* Pesquisa por ID, cliente, sistema, equipe, responsavel, status e texto livre
* Fluxos "+ Novo", criar, visualizar, editar, atualizar, excluir logicamente, reabrir e encerrar
* Atividades como dossie operacional com timeline completa, comentarios, anexos e auditoria
* Modo monitoramento para TV com auto refresh, cards grandes, atividades criticas e SLA em risco

Gerar:

* Relatorio de bugs
* Correcoes necessarias
* Melhorias recomendadas

Nao assuma nada como pronto sem evidencia no codigo ou documentacao da fase.

---

FLUXO DE CORRECAO

Quando um bug for encontrado:

* Classificar o bug como defeito da fase de origem.
* Se exigir schema ou modelo de dados, recomendar retorno controlado para STATE-03 DATABASE_MODELING.
* Se exigir backend, recomendar retorno controlado para STATE-04 BACKEND_IMPLEMENTATION.
* Se exigir frontend, recomendar retorno controlado para STATE-05 FRONTEND_IMPLEMENTATION.
* Se exigir apenas conexao entre partes ja existentes, recomendar retorno controlado para STATE-06 INTEGRATION.
* Se a correcao for pequena, explicitamente autorizada e nao criar feature nova, registrar como correcao de defeito da fase atual.

Testing/Homologation aponta, classifica e valida correcoes.
A State Machine decide qualquer retorno, permanencia ou transicao.

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
