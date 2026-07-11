PROMPT DE AJUSTES OPERACIONAIS

REGRA DE OURO

Este prompt nao cria, altera ou transiciona estado.
Apenas a State Machine pode alterar estado.

Quando executado em STATE-08 PRODUCTION_RELEASE, qualquer alteracao de banco,
schema, migration, backend, frontend, permissoes, testes ou comportamento de
produto deve ser registrada como manutencao funcional pos-release.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Auditar e corrigir ajustes operacionais do ShiftFlow relacionados a Kanban
interno de atividades, dashboard, filtros, gestao de perfis, cores por equipe e
configuracoes.

---

1. KANBAN INTERNO NAS ATIVIDADES

Cada atividade pode ter um Kanban interno de tarefas ou subtarefas.

Fluxo conceitual:

Projeto -> Atividade -> Kanban de tarefas

Requisitos:

* Criar, editar, mover e excluir tarefas internas quando permitido.
* Persistir status, ordem, responsavel, prioridade e prazo.
* Registrar historico de alteracoes relevantes.
* Respeitar empresa, cliente, equipe, turno e permissoes.
* Exibir o Kanban dentro da tela ou modal da atividade sem confundir com o Kanban principal.

---

2. DASHBOARD PRINCIPAL E LEGENDA

Revisar:

* Legendas de status.
* Cores usadas por prioridade, status e equipe.
* Coerencia entre numeros do dashboard e listas detalhadas.
* Clique em KPI levando ao filtro correspondente quando aplicavel.
* Estados empty, loading e error.

Evitar duplicar regras ja cobertas por Prompt-Dashboard.md. Este prompt deve
tratar ajustes operacionais e consistencia com os demais modulos.

---

3. FILTROS

Filtros devem ser reais, combinaveis e previsiveis.

Requisitos:

* Busca textual.
* Status.
* Prioridade.
* Cliente.
* Equipe.
* Turno.
* Responsavel.
* Periodo.
* Atraso ou criticidade quando aplicavel.

Os filtros devem manter coerencia entre backend, frontend, URL ou estado local,
sem retornar dados fora da empresa ativa.

---

4. GESTAO DE PERFIS

Reestruturar a gestao de perfis para um fluxo claro:

* Lista de perfis representada por ul e li, pois nao possui ordem obrigatoria.
* Cada perfil pode usar ol internamente apenas para metadados ou etapas que
  possuam sequencia significativa.
* Detalhe do perfil selecionado.
* Permissoes agrupadas por modulo.
* Edicao controlada.
* Validacao de perfis do sistema.
* Evidencia visual de permissoes herdadas ou bloqueadas, quando existir.

Evitar layout com excesso de cards e baixa densidade. Preferir navegacao lateral
com area principal de detalhe quando houver muitos grupos de permissao.

---

5. KANBAN PRINCIPAL E CORES POR EQUIPE

O Kanban principal deve:

* Usar cores por equipe de forma consistente e acessivel.
* Manter status e prioridade distinguiveis sem depender apenas de cor.
* Persistir movimentacao.
* Respeitar permissoes.
* Evitar mistura visual com o Kanban interno de tarefas da atividade.

---

6. CONFIGURACOES

Configuracoes devem agrupar opcoes de forma operacional:

* Empresa.
* Usuarios.
* Equipes.
* Clientes.
* Turnos.
* Perfis e permissoes.
* Preferencias de interface.
* Politicas de seguranca quando aplicavel.

Cada grupo deve ter responsabilidade clara e evitar duplicar telas ja existentes.

---

RESTRICOES

Nao remover regras de RBAC para simplificar interface.
Nao criar Kanban interno sem persistencia ou contrato de dados claro.
Nao usar dados demonstrativos quando endpoint real existir.
Nao duplicar widgets do dashboard personalizavel sem necessidade.
Nao misturar configuracoes administrativas com acoes operacionais diarias.

---

CRITERIOS DE ACEITE

* Kanban interno e Kanban principal sao visual e funcionalmente distintos.
* Filtros retornam resultados coerentes e escopados por empresa.
* Gestao de perfis permite leitura e edicao sem layout confuso.
* Cores por equipe nao quebram acessibilidade.
* Configuracoes ficam agrupadas por responsabilidade.
* Validacoes proporcionais passam quando houver alteracao de codigo.

---

ENTREGAVEIS

Ao executar este prompt, registrar:

* Achados por area.
* Correcoes aplicadas.
* Arquivos alterados.
* Evidencias de validacao.
* Riscos e pendencias.
