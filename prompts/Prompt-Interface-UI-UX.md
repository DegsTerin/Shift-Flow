PROMPT DE AUDITORIA DE INTERFACE UI UX

REGRA DE OURO

Este prompt nao cria funcionalidades, nao altera regras de negocio, nao modifica
APIs, schemas, migrations, permissoes, regras de autorizacao, persistencia ou
fluxos funcionais.

Apenas a State Machine pode alterar estados da aplicacao.

Qualquer alteracao que envolva componentes compartilhados, CSS global, Design
System, contratos visuais, navegacao ou comportamento da interface durante
STATE-08 PRODUCTION_RELEASE deve ser classificada como manutencao funcional
pos-release, sem transicao de estado.

Quando uma correcao visual exigir mudanca funcional, mudanca de fluxo, nova
funcionalidade, alteracao de API, alteracao de schema ou mudanca de permissao,
registrar o achado como pendencia tecnica e nao implementar sem solicitacao
explicita.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar
commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a
criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao
explicita.

---

OBJETIVO

Executar auditoria completa e evidencial da interface do ShiftFlow, com foco em
UI, UX, layout, responsividade, acessibilidade, Design System, consistencia
visual, Visual QA, Pixel Perfect quando houver referencia e Visual Regression
Testing quando houver baseline ou ferramenta disponivel.

O objetivo e entregar uma interface corporativa, operacional, moderna, limpa,
legivel, responsiva, acessivel e visualmente consistente, sem alterar regras de
negocio ou comportamento funcional fora do escopo autorizado.

Nao considerar uma tela aprovada apenas porque compila, carrega ou nao apresenta
erro aparente. A aprovacao exige evidencia visual, tecnica e operacional.

---

ESCOPO AUDITAVEL

Auditar todas as telas, estados e componentes existentes no momento da execucao.
Nao tratar paginas futuras como item auditavel da execucao atual; requisitos
para paginas futuras devem ser registrados como diretriz de governanca visual.

Escopo minimo:

* Login.
* Home.
* Dashboard.
* Configuracoes.
* Administracao.
* Perfil.
* Usuarios.
* Permissoes.
* Formularios.
* Relatorios.
* Calendarios.
* Kanban.
* Listas.
* Paginas operacionais existentes.
* Paginas administrativas existentes.
* Componentes compartilhados existentes.
* Tema claro.
* Tema escuro, quando existir implementacao atual.
* Modo TV, quando existir implementacao atual.

---

COMPONENTES E AREAS

Validar componentes e areas existentes, incluindo:

* Header.
* Sidebar expandida.
* Sidebar recolhida.
* Footer.
* Content.
* Layout principal.
* Layout secundario.
* Containers.
* Grid.
* Flexbox.
* Cards.
* KPIs.
* Graficos.
* Tabelas.
* Inputs.
* Selects.
* Checkboxes.
* Radio buttons.
* Switches.
* Sliders.
* Date pickers.
* Menus.
* Dropdowns.
* Tooltips.
* Popovers.
* Drawers.
* Dialogs.
* Modais.
* Toasts.
* Alerts.
* Badges.
* Chips.
* Avatares.
* Breadcrumbs.
* Tabs.
* Accordions.
* Paginacao.
* Loading.
* Skeleton.
* Empty state.
* Error state.
* Success state.
* Disabled state.
* Hover.
* Focus.
* Active.

---

FONTE CANONICA DE DESIGN

Comparar a interface contra as fontes visuais existentes no projeto, nesta
ordem:

1. Tokens, variaveis e regras globais em apps/web/app/globals.css.
2. Componentes compartilhados em apps/web/app/components/.
3. Configuracoes, textos e tipos de UI em apps/web/app/lib/.
4. Padroes ja consolidados nas telas mais completas e recentes.
5. Regras deste prompt, quando nao houver fonte mais especifica.

Nao criar novo Design System se o existente puder ser padronizado.
Nao introduzir estilo paralelo quando houver componente, token ou padrao local
equivalente.

---

ARQUITETURA HTML E CSS DO FRONTEND

O ShiftFlow usa Next.js e React. Nao editar
apps/web/.next/server/app/index.html, pois esse arquivo e gerado pelo build.
Aplicar alteracoes nas fontes reais:

* apps/web/app/layout.tsx para metadata e estrutura raiz.
* apps/web/app/page.tsx para landmarks e composicao da pagina.
* apps/web/app/components/ para semantica dos componentes.
* apps/web/app/globals.css para apresentacao e responsividade.

Requisitos obrigatorios:

* Usar header, nav, main, section, article, aside, footer, figure, figcaption,
  ul, ol e li quando a funcao semantica existir.
* Manter apenas um landmark main primario por pagina renderizada.
* Preservar hierarquia de titulos, rotulos acessiveis, foco visivel, skip link e
  suporte a leitores de tela.
* Usar ul para colecoes sem ordem e ol somente quando houver sequencia real de
  informacoes ou etapas dentro do item.
* Usar texto alternativo util em imagens informativas e ocultar icones
  decorativos de tecnologias assistivas.
* Manter HTML/React, CSS e TypeScript separados por responsabilidade.
* Implementar layout fluido para mobile, tablet e desktop com unidades
  relativas, Grid, Flexbox e media queries orientadas pelo conteudo.
* Iniciar todo arquivo editavel de codigo ou configuracao que aceite comentarios
  com comentario en-GB sobre sua responsabilidade e finalidade.
* Comentar em en-GB algoritmos nao obvios, limites de seguranca, invariantes de
  negocio, decisoes de compatibilidade e efeitos operacionais.
* Comentar cada declaracao CSS em en-GB, explicando de forma curta o que a
  propriedade controla e por que ela e necessaria.
* Nao narrar sintaxe autoexplicativa linha por linha; comentarios devem explicar
  intencao, restricao e motivo.
* Aplicar as excecoes de JSON estrito, arquivos gerados e migrations imutaveis
  definidas em docs/source-commenting-manifest.md.
* Executar npm run comments:verify antes de aprovar alteracoes de codigo.
* Preservar conteudo, estilo, comportamento, regras de negocio e integracoes
  existentes durante a reorganizacao semantica.

---

PADRAO VISUAL

Aplicar identidade visual corporativa, operacional e consistente.

Priorizar:

* Hierarquia visual clara.
* Alta legibilidade.
* Consistencia entre telas.
* Densidade adequada para uso operacional.
* Facilidade de leitura.
* Clareza na tomada de decisao.
* Estados visuais previsiveis.
* Componentes estaveis, sem deslocamentos inesperados.
* Simetria visual.
* Equilibrio entre areas em branco.
* Consistencia optica, nao apenas matematica.
* Alinhamento optico de icones.
* Ritmo visual.
* Hierarquia por contraste.
* Densidade visual consistente entre telas.
* Qualidade visual compativel com produto corporativo finalizado.

Evitar:

* Hero sections.
* Layout promocional.
* Gradientes desnecessarios.
* Fundos poluidos.
* Cards aninhados sem necessidade.
* Espacamentos irregulares.
* Fontes exageradas.
* Elementos que mudam de tamanho sem acao explicita.
* Animacoes excessivas.
* Variacoes visuais sem justificativa funcional.

---

ITENS DE VERIFICACAO

Verificar obrigatoriamente:

* Alinhamento.
* Grid.
* Flexbox.
* Containers.
* Overflow horizontal.
* Overflow vertical desnecessario.
* Scroll duplo.
* Conteudo cortado.
* Componentes sobrepostos.
* Elementos fora do viewport.
* Texto truncado.
* Z-index.
* Padding.
* Margin.
* Radius.
* Bordas.
* Sombras.
* Cores.
* Contraste.
* Icones.
* Alturas.
* Larguras.
* Espacamentos.
* Tipografia.
* Line-height.
* Letter-spacing.
* Estados de hover.
* Estados de focus.
* Estados de active.
* Estados de disabled.
* Estados de loading.
* Estados de empty.
* Estados de error.
* Estados de success.
* Estados de warning.
* Animacoes.
* Transicoes.
* Simetria visual.
* Equilibrio entre areas em branco.
* Consistencia optica.
* Alinhamento optico de icones.
* Ritmo visual.
* Hierarquia por contraste.
* Consistencia de raio das bordas.
* Consistencia de sombras.
* Consistencia das transicoes.
* Consistencia da escala tipografica.
* Densidade visual entre telas.
* Pixel Perfect, quando existir referencia visual.
* Comparacao automatica por screenshots, quando existir baseline ou ferramenta.

---

QUALIDADE VISUAL PREMIUM

Avaliar tambem aspectos subjetivos e perceptivos de design. Quando houver mais
de uma solucao visual possivel, priorizar a alternativa mais limpa, simples,
corporativa, legivel e consistente com o produto.

Verificar:

* Equilibrio visual.
* Simetria.
* Alinhamento optico.
* Densidade visual.
* Hierarquia visual.
* Ritmo visual.
* Consistencia entre paginas.
* Consistencia entre modulos.
* Facilidade de leitura.
* Clareza das acoes principais.
* Excesso de elementos.
* Excesso de espacos vazios.
* Poluicao visual.
* Coerencia entre cores.
* Coerencia entre tipografia.
* Consistencia dos icones.
* Consistencia das animacoes.
* Aparencia profissional.
* Sensacao de produto acabado.

Nao aprovar uma tela apenas porque os valores de CSS estao corretos. A
renderizacao final deve parecer visualmente correta para o usuario.

---

AUDITORIA PIXEL PERFECT

Alem da analise estrutural do codigo, validar a interface renderizada por meio
de screenshots reais quando houver ferramenta disponivel ou referencia visual
comparavel.

Comparar visualmente componentes equivalentes e estados interativos. Verificar
diferencas opticas, mesmo quando o CSS estiver tecnicamente correto.

Detectar:

* Desalinhamentos de 1 px ou mais.
* Diferencas de altura entre componentes equivalentes.
* Diferencas de largura nao justificadas.
* Diferencas de radius.
* Diferencas de sombras.
* Diferencas de opacidade.
* Diferencas de espessura de bordas.
* Diferencas de peso tipografico.
* Diferencas de line-height.
* Diferencas de escala tipografica.
* Diferencas de espacamento interno.
* Diferencas de espacamento externo.
* Diferencas entre icones.
* Diferencas entre estados hover, focus e active.
* Diferencas de transicao entre componentes equivalentes.

Nunca considerar um componente aprovado apenas porque utiliza o mesmo CSS. A
aprovacao deve considerar a renderizacao final.

Quando nao existir referencia visual ou baseline, registrar que a auditoria
Pixel Perfect foi limitada a comparacao entre componentes e telas existentes.

---

REGRESSAO VISUAL

Executar Visual Regression Testing quando houver baseline, snapshots visuais,
Playwright screenshots ou ferramenta equivalente disponivel.

Quando aplicavel:

* Capturar screenshots automaticos das telas auditadas.
* Capturar estados relevantes de componentes.
* Comparar screenshots com a versao anterior ou baseline aprovada.
* Utilizar comparacao pixel a pixel quando a ferramenta permitir.
* Marcar qualquer diferenca visual encontrada.
* Justificar diferencas aceitas.

Classificar cada diferenca visual como:

* Diferenca aceitavel.
* Regressao visual.
* Alteracao intencional.

Nunca ignorar diferenca visual sem justificativa.

Caso nao exista baseline, criar ou recomendar baseline inicial, conforme o
escopo permitido da execucao. A criacao de baseline nao deve mascarar regressao
existente; deve ser registrada como primeira referencia controlada.

---

HEURISTICAS DE UX

Validar a interface usando as heuristicas de Nielsen como referencia de UX.

Verificar:

* Visibilidade do estado do sistema.
* Correspondencia entre sistema e mundo real do usuario.
* Controle e liberdade do usuario.
* Consistencia e padroes.
* Prevencao de erros.
* Reconhecimento em vez de memorizacao.
* Flexibilidade e eficiencia de uso.
* Design minimalista.
* Mensagens de erro compreensiveis.
* Recuperacao de erros.
* Ajuda contextual quando aplicavel.

Registrar qualquer violacao com tela, componente, impacto e severidade.

---

RESPONSIVIDADE

Validar os viewports representativos abaixo:

* 320 px.
* 360 px.
* 390 px.
* 414 px.
* 768 px.
* 820 px.
* 1024 px.
* 1280 px.
* 1366 px.
* 1440 px.
* 1600 px.
* 1920 px.
* 2560 px, quando aplicavel.

Tambem validar:

* Mobile.
* Tablet.
* Desktop.
* Ultrawide, quando aplicavel.
* Modo TV, quando existir implementacao atual.

Nao usar "todos os viewports possiveis" como criterio literal. Usar os
viewports acima como matriz minima de regressao visual.

---

MODO TV

Quando o Modo TV existir, validar:

* Legibilidade a distancia.
* Densidade visual adequada.
* Ausencia de controles administrativos desnecessarios.
* Layout sem sidebar bloqueando conteudo.
* KPIs e alertas prioritarios visiveis.
* Ausencia de texto cortado.
* Ausencia de overflow horizontal.
* Comportamento correto em fullscreen ou viewport amplo.
* Atualizacao visual sem deslocamentos inesperados.

Nao criar Modo TV novo nem alterar regras funcionais do Modo TV sem solicitacao
explicita.

---

ACESSIBILIDADE

Validar:

* Contraste adequado.
* Navegacao por teclado.
* Focus visivel.
* Labels corretos.
* Ordem de tabulacao coerente.
* Areas clicaveis adequadas.
* Feedback visual compreensivel.
* Estados de erro e sucesso perceptiveis.
* Textos e controles sem sobreposicao.

---

RESTRICOES

Nao alterar:

* Regras de negocio.
* APIs.
* Banco de dados.
* Schemas.
* Migrations.
* Fluxos funcionais.
* Permissoes.
* Autorizacao.
* Estados da State Machine.
* Logica de dominio.

Nao remover funcionalidade para simplificar layout.
Nao esconder problema visual removendo conteudo necessario.
Nao criar componente novo quando houver componente compartilhado adequado.
Nao criar tema escuro quando ele nao existir.
Nao criar pagina futura para satisfazer escopo de auditoria.

---

CLASSIFICACAO DE ACHADOS

Classificar cada achado por severidade:

* Bloqueante: impede uso, quebra navegacao, oculta acao critica, causa overflow
  horizontal grave ou torna conteudo essencial inacessivel.
* Alta: compromete entendimento, acessibilidade, responsividade ou consistencia
  de componente importante.
* Media: causa desalinhamento, diferenca visual relevante ou friccao de uso sem
  bloquear o fluxo.
* Baixa: polimento visual, microcopy visual, ajuste fino de densidade ou
  refinamento estetico sem impacto operacional direto.

Correcao direta e permitida para achados visuais dentro das restricoes deste
prompt. Achados que exigirem mudanca funcional devem ser registrados como
pendencia com justificativa.

---

FLUXO DE EXECUCAO

Executar nesta ordem:

1. Inventariar telas, componentes compartilhados, temas e modos existentes.
2. Identificar a fonte canonica de Design System usada pelo projeto.
3. Auditar a interface por tela, de cima para baixo e da esquerda para a
   direita.
4. Auditar componentes equivalentes entre telas.
5. Auditar estados visuais e interativos.
6. Auditar responsividade pela matriz minima de viewports.
7. Auditar acessibilidade visual e navegacao por teclado quando aplicavel.
8. Auditar qualidade visual premium, consistencia optica e hierarquia por
   contraste.
9. Executar auditoria Pixel Perfect quando houver referencia visual ou
   comparacao entre componentes equivalentes.
10. Executar Visual Regression Testing quando houver baseline ou ferramenta
   disponivel.
11. Validar heuristicas de UX.
12. Classificar achados por severidade.
13. Corrigir achados visuais permitidos pelo escopo.
14. Registrar como pendencia qualquer achado que exija mudanca funcional.
15. Reexecutar a auditoria nas areas alteradas.
16. Executar inspecao visual final.
17. Executar validacoes tecnicas proporcionais.
18. Gerar relatorio final com evidencias.
19. Criar commit local de escopo fechado quando houver mudancas de arquivo.

Nao interromper a execucao na primeira correcao encontrada. Encerrar somente
apos corrigir achados permitidos, registrar pendencias justificadas e validar
que as mudancas nao criaram regressao visual relevante.

---

INSPECAO VISUAL FINAL

Apos todas as correcoes, executar uma inspecao manual completa.

Percorrer todas as paginas auditadas como um usuario faria e verificar:

* Sensacao geral de qualidade.
* Sensacao de produto acabado.
* Aparencia profissional.
* Consistencia entre modulos.
* Aparencia moderna.
* Ausencia de componentes estranhos.
* Ausencia de componentes que parecam improvisados.
* Ausencia de mudancas visuais inesperadas durante navegacao.
* Ausencia de flickering.
* Ausencia de CLS, Cumulative Layout Shift, perceptivel.
* Ausencia de animacoes bruscas.
* Ausencia de pequenos defeitos visuais perceptiveis em uso normal.

Somente considerar a interface aprovada quando nao houver inconsistencia visual
perceptivel relevante durante uso normal ou quando pendencias remanescentes
estiverem registradas com severidade, justificativa e impacto.

---

VALIDACAO

Quando houver alteracao de arquivo, executar validacoes proporcionais ao escopo:

* git diff --check.
* npm run typecheck.
* npm run lint.
* npm test, quando a alteracao afetar comportamento testado.
* npm run build, quando a alteracao afetar frontend, estilos globais,
  componentes compartilhados ou configuracao de build.
* Playwright ou validacao visual equivalente, quando a alteracao afetar layout,
  responsividade, navegacao, Modo TV, modais, drawers ou fluxos de tela.
* Captura automatica de screenshots, quando a alteracao afetar UI renderizada.
* Comparacao visual contra baseline, quando baseline existir.
* Criacao ou recomendacao de baseline inicial, quando nao existir baseline e a
  execucao permitir criar evidencia visual controlada.

Se alguma validacao nao puder ser executada, registrar motivo, impacto e risco
remanescente.

---

EVIDENCIAS

Para cada conclusao relevante, registrar:

* Tela ou componente auditado.
* Arquivo de origem do requisito.
* Arquivos alterados ou inspecionados.
* Viewport validado, quando aplicavel.
* Evidencia objetiva: teste, build, screenshot, observacao reproduzivel ou linha
  de codigo.
* Resultado de comparacao visual, quando houver.
* Baseline utilizada ou justificativa de ausencia de baseline.
* Severidade do achado.
* Status: corrigido, pendente justificado ou nao aplicavel.

Nao declarar conformidade sem evidencia.

---

CRITERIO DE APROVACAO

Considerar a auditoria aprovada quando:

* Achados bloqueantes e altos dentro do escopo visual permitido estiverem
  corrigidos.
* Achados medios e baixos estiverem corrigidos ou registrados como pendencia
  justificada.
* Nao houver overflow horizontal conhecido em viewports minimos.
* Nao houver sobreposicao conhecida de conteudo essencial.
* Nao houver texto essencial cortado sem alternativa de acesso.
* Componentes equivalentes seguirem o mesmo padrao visual ou possuirem
  justificativa objetiva.
* Diferencas visuais detectadas por screenshots estiverem classificadas como
  aceitaveis, regressoes corrigidas ou alteracoes intencionais.
* Heuristicas de UX relevantes tiverem sido avaliadas e violacoes registradas.
* Validacoes proporcionais tiverem sido executadas ou justificadas.
* O relatorio final informar commit realizado ou justificar ausencia de commit.

---

RELATORIO OBRIGATORIO

Ao finalizar, apresentar:

1. Resumo executivo.
2. Telas auditadas.
3. Componentes auditados.
4. Problemas encontrados por severidade.
5. Correcoes aplicadas por tela.
6. Correcoes aplicadas por componente.
7. Pendencias justificadas.
8. Riscos remanescentes.
9. Evidencias de validacao.
10. Evidencias de Visual QA e screenshots, quando aplicavel.
11. Resultado de Visual Regression Testing, quando aplicavel.
12. Resultado de auditoria Pixel Perfect, quando aplicavel.
13. Violacoes de heuristicas de UX.
14. Classificacao da manutencao conforme o estado atual da State Machine.
15. Commit realizado ou justificativa para ausencia de commit.

---

RESULTADO FINAL

O resumo final deve informar:

* Total de telas auditadas.
* Total de componentes auditados.
* Total de achados bloqueantes.
* Total de achados altos.
* Total de achados medios.
* Total de achados baixos.
* Total de correcoes aplicadas.
* Total de pendencias justificadas.
* Validacoes executadas.
* Resultado da auditoria Pixel Perfect.
* Resultado do Visual Regression Testing.
* Resultado da inspecao visual final.
* Resultado das heuristicas de UX.
* Percentual estimado de conformidade visual.
* Hash do commit, quando houver mudancas de arquivo.
