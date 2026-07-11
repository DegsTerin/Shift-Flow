PROMPT DE REVISAO GLOBAL

REGRA DE OURO

Este prompt e uma entrada operacional pos-release.
Ele nao altera estado, nao substitui a State Machine e so pode gerar correcoes quando houver solicitacao explicita, evidencias e gates.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Revisar o ShiftFlow para corrigir problemas funcionais, usabilidade, responsividade e fluxo operacional.

O sistema deve funcionar em:

* Desktop.
* Mobile.
* Tablet.
* Light mode.
* Dark mode.
* PT-BR.
* EN-GB.
* Modo TV.

---

ANALISE OBRIGATORIA

Antes de implementar qualquer correcao, auditar:

* Frontend.
* Backend.
* Integracoes frontend/backend.
* Estados globais.
* Componentes reutilizaveis.
* Rotas.
* Formularios.
* Filtros.
* Pesquisa.
* Responsividade.

---

ESCOPO FUNCIONAL

Validar e corrigir quando autorizado:

* Responsividade.
* Menu lateral.
* Filtros.
* Registro completo de atividades.
* Historico completo.
* Botao "+ Novo".
* Visualizacao de registro.
* Edicao de registros.
* Pesquisa global.
* Modo monitoramento.

---

CRITERIOS DE ACEITE

A revisao so pode ser considerada concluida quando:

* Todos os filtros funcionarem.
* Todas as pesquisas funcionarem.
* Todos os botoes "+ Novo" funcionarem.
* Todos os registros abrirem corretamente.
* O historico estiver funcional.
* O sistema estiver responsivo.
* Light mode e dark mode funcionarem.
* PT-BR e EN-GB funcionarem.
* Dashboard por equipe funcionar.
* Kanban funcionar.
* Modo TV funcionar.
* Nao houver erro de navegacao conhecido.

---

ENTREGAVEIS

Gerar:

* Problemas encontrados.
* Correcoes realizadas.
* Pendencias remanescentes.
* Riscos tecnicos.
* Debitos tecnicos.
* Evidencias das correcoes.
