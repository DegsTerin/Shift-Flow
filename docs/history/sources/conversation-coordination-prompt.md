# Conversation Continuity and Safe Parallel Work Governance Source

## Status governado

- Projeto: ShiftFlow
- Versao de adocao: `3.0.0`
- Status: fonte historica de adocao preservada e governada; nao e uma segunda
  autoridade operacional nem uma instrucao de carregamento atual.
- Autoridade tematica vigente:
  [prompts/core/Execution-Protocol.md](../../../prompts/core/Execution-Protocol.md).
- Limite de autorizacao: este arquivo nao autoriza automaticamente alteracao de
  estado, escrita em arquivos, desenvolvimento, Git, navegacao entre conversas
  ou qualquer acao externa.
- Precedencia: em caso de divergencia, aplicar
  [prompts/core/Governance.md](../../../prompts/core/Governance.md) e o corpus
  ativo carregado por
  [prompts/Start-Here.md](../../../prompts/Start-Here.md).

As instrucoes de analise, aprovacao e incorporacao abaixo preservam o change
gate que originou a versao 3.0.0. Elas nao concedem nem revogam autoridade para
uma tarefa futura. Os placeholders deste documento pertencem a uma
especificacao ou template; handoffs reais devem estar integralmente
preenchidos.

## Especificacao de adocao

Projeto: ShiftFlow
Workspace: raiz governada do repositorio, confirmada em cada execucao

Objetivo

Incorporar à governança deste projeto um playbook para:

1. orientar quando continuar na conversa atual;
2. orientar quando iniciar uma nova conversa;
3. orientar quando retornar a uma conversa anterior confirmada;
4. sempre fornecer o texto exato que deverá ser enviado;
5. avaliar quando várias conversas podem trabalhar simultaneamente;
6. impedir que o paralelismo gere sobrescrita, conflito, erro ou falha no fluxo
   de desenvolvimento.

Esta solicitação autoriza inicialmente apenas análise e documentação. Não
inicialize Git, não crie branches/worktrees, não implemente código e não
execute ações externas sem autorização separada.

Antes de modificar arquivos

1. Leia integralmente as instruções aplicáveis do repositório, incluindo
   AGENTS.md, arquivos de entrada, governança, estado factual, histórico,
   templates, Quality Gates, ADRs e documentação relacionada.
2. Identifique as convenções e os documentos proprietários desses assuntos.
3. Não crie documentação duplicada.
4. Apresente:
   - arquivos que precisam ser alterados;
   - finalidade de cada alteração;
   - versão documental proposta;
   - riscos ou conflitos encontrados.
5. Aguarde minha aprovação antes de alterar os arquivos.

Princípio fundamental

Segurança e consistência têm prioridade sobre velocidade.

Não prometa ausência absoluta de erros. Em vez disso, estabeleça controles
fail-safe para prevenir, detectar e interromper atividades antes que ocorram
sobrescritas, conflitos ou mudanças fora de autoridade.

Na dúvida, recomende execução sequencial.

1. Roteamento entre conversas

Todo handoff governado deverá classificar a próxima interação usando exatamente:

- CONTINUE_CURRENT
- START_NEW
- RETURN_TO_EXISTING

Definições:

- CONTINUE_CURRENT:
  usar quando o mesmo objetivo, estado ou lote continua ativo e o contexto
  atual permanece confiável.

- START_NEW:
  usar quando começar outro estado, gate, lote ou assunto independente;
  quando a conversa estiver excessivamente longa; ou quando não existir
  referência confiável para uma conversa anterior.

- RETURN_TO_EXISTING:
  usar somente quando o título ou label da conversa anterior tiver sido
  fornecido ou confirmado pelo proprietário.

Regras obrigatórias:

- O agente recomenda a conversa; o proprietário faz a navegação manual.
- O agente nunca afirma que abriu, encontrou, renomeou ou mudou de conversa.
- Nunca inventar título, label, link ou identificador de conversa existente.
- Um título sugerido para conversa nova é apenas uma proposta não canônica.
- Conversas são contexto temporário. Documentação, estado factual, histórico,
  ADRs e commits são a memória oficial do projeto.
- Ao retornar a uma conversa antiga, reconciliar todo o contexto com a
  documentação e o estado factual vigentes.
- Toda conversa nova ou retomada deve reler as instruções e confirmar estado,
  autoridade, escopo positivo e escopo negativo antes de agir.
- Human Gates e outras confirmações formais permanecem na conversa que contém
  o resumo integral e vigente da decisão.

Campos obrigatórios no handoff:

Status:
Completed:
Remaining for this target:
Next step:
Next stage:
Your action now:
Conversation action:
Conversation target:
Suggested title:
Conversation reason:
Exact next message:

O campo Exact next message deve conter uma mensagem completa, preenchida e
pronta para copiar. Nenhum placeholder pode permanecer em um handoff real.

2. Avaliação de paralelismo

A avaliação de paralelismo é independente do roteamento da conversa principal.

Todo handoff governado deverá classificar o trabalho como:

- SEQUENTIAL_ONLY
- PARALLEL_OPTIONAL
- PARALLEL_RECOMMENDED

Definições:

- SEQUENTIAL_ONLY:
  usar quando houver dependência entre tarefas, arquivos ou recursos
  compartilhados, contrato instável, decisão humana pendente, isolamento
  insuficiente ou risco de conflito.

- PARALLEL_OPTIONAL:
  usar quando as tarefas forem independentes, mas o ganho esperado for
  pequeno ou o custo de coordenação puder superar o benefício.

- PARALLEL_RECOMMENDED:
  usar quando existirem duas ou mais tarefas realmente independentes,
  limitadas, verificáveis e com ganho material de tempo ou especialização.

Na dúvida, usar SEQUENTIAL_ONLY.

Campos adicionais obrigatórios:

Parallel work:
Parallel plan:
Exact parallel messages:

Quando o trabalho for sequencial:

Parallel plan: None — <MOTIVO>
Exact parallel messages: None — parallel work is not recommended

3. Requisitos para trabalho paralelo

Um plano paralelo deverá possuir:

1. uma única conversa coordenadora com título ou label confirmado;
2. baseline comum identificada por versão e, quando existir, commit ou hash;
3. lanes ou workstreams numerados;
4. objetivo e resultado esperado de cada lane;
5. dependências organizadas sem ciclos;
6. ownership exclusivo de paths, artefatos lógicos e recursos mutáveis;
7. inputs compartilhados somente leitura;
8. arquivos e ações proibidos para cada lane;
9. checks e evidências esperadas;
10. condições objetivas de parada;
11. mensagem completa para iniciar cada conversa worker;
12. mensagem de retorno pronta para copiar à coordenadora;
13. ordem determinística de integração;
14. checks transversais após a integração;
15. fallback explícito para execução sequencial.

Utilizar o menor número útil de conversas paralelas.

4. Ownership e isolamento

Deve existir somente um writer para cada:

- arquivo ou diretório;
- contrato ou schema;
- migration;
- lockfile;
- manifesto;
- solution/project file;
- configuração ou pipeline;
- banco, índice ou corpus mutável;
- porta, processo ou runtime;
- recurso externo;
- artefato lógico compartilhado.

Arquivos de estado, histórico, changelog, ADR, relatórios de gate e decisões
permanecem sob responsabilidade da conversa coordenadora.

Uma worker concluída entrega apenas um candidato para integração. Ela não
declara o lote, estado ou projeto como concluído.

5. Git, branches e worktrees

Antes de existir um repositório Git rastreado e um workflow autorizado:

- conversas simultâneas podem executar somente análise, pesquisa, revisão e
  auditoria read-only;
- qualquer alteração de arquivo deve ocorrer sequencialmente na conversa
  coordenadora.

Depois de Git e do workflow correspondente serem autorizados:

- cada tarefa paralela de escrita deverá utilizar branch e worktree próprios;
- branches diferentes no mesmo worktree não constituem isolamento;
- os write sets deverão permanecer sem sobreposição;
- portas, bancos, índices, temporários, caches e outputs de build deverão ser
  isolados quando aplicável;
- merge, rebase, integração e atualização do estado serão responsabilidade da
  conversa coordenadora;
- nenhuma ação remota, push, deploy, consumo pago ou alteração externa será
  inferida dessa autorização.

6. Responsabilidades das workers

Cada conversa worker deverá:

- reler as instruções aplicáveis;
- confirmar baseline, autoridade e ownership antes de agir;
- trabalhar somente dentro de sua lane;
- aplicar least privilege;
- não integrar outras lanes;
- não atualizar estado factual ou histórico;
- não aceitar ADR;
- não promover lifecycle;
- não solicitar ou confirmar Human Gate;
- não executar ação externa não autorizada;
- informar arquivos, artefatos, checks, limitações e riscos;
- produzir uma mensagem exata de retorno para a conversa coordenadora.

7. Condições obrigatórias de parada

A worker deverá parar antes de continuar quando detectar:

- arquivo, artefato ou recurso com ownership sobreposto;
- baseline alterada ou desatualizada;
- mudança concorrente inesperada;
- dependência ainda não integrada;
- contrato ou schema instável;
- colisão de porta, processo, banco, índice ou runtime;
- decisão humana pendente;
- necessidade de ampliar escopo ou autoridade;
- falha de isolamento;
- conflito de integração;
- ação potencialmente irreversível.

Não utilizar last-write-wins, sobrescrita automática ou reversão de trabalho
alheio.

A frente afetada deverá ser preservada e retomada sequencialmente a partir da
última baseline validada.

8. Responsabilidades da conversa coordenadora

A coordenadora deverá:

- manter escopo, autoridade e baseline;
- validar o plano antes de abrir workers;
- integrar uma entrega por vez;
- inspecionar cada resultado;
- resolver conflitos centralmente;
- executar checks locais após cada integração;
- executar todos os checks transversais sobre o resultado combinado;
- atualizar estado, histórico e relatórios uma única vez;
- apresentar Human Gate somente após a integração e auditoria consolidadas.

9. Mensagem mínima para uma worker

Cada Exact parallel message deverá conter:

Projeto:
Workspace:
Lane:
Conversation label:
Conversa coordenadora confirmada:
Baseline:
Estado/gate/lote:
Autoridade existente:
Objetivo exclusivo:
Pré-condições:
Dependências congeladas:
Escrita exclusiva permitida ou read-only:
Inputs somente leitura:
Arquivos e ações proibidos:
Checks:
Output esperado:
Condições de parada:
Ordem de integração:
Formato da mensagem de retorno:

10. Documentação e validação

Incorpore a política nos documentos proprietários existentes, preferencialmente:

- instruções permanentes do repositório;
- governança;
- templates;
- Quality Gates;
- arquivo de entrada/roteamento;
- changelog do sistema de instruções;
- estado factual e histórico, somente depois da mudança realmente ocorrer;
- relatório do estado ou gate aplicável.

Se o projeto possuir nomes ou estrutura diferentes, adapte a política aos
padrões existentes. Não copie nomes específicos de outro projeto.

Após as alterações, execute uma auditoria proporcional:

- inventário de arquivos;
- links locais;
- UTF-8, LF, newline final e trailing whitespace;
- consistência de enums e campos;
- ausência de placeholders em handoffs reais;
- segurança e ausência de secrets;
- autoridade e escopo negativo;
- coerência entre versão, estado, histórico e relatório;
- revisão semântica independente;
- confirmação de que o paralelismo não altera lifecycle, ADRs ou Human Gates.

Não declare aprovação até os checks realmente passarem.

Entrega esperada

Apresente:

1. arquivos alterados;
2. política adotada;
3. situações em que o paralelismo será permitido;
4. situações que obrigam execução sequencial;
5. limitações atuais;
6. resultados dos checks;
7. riscos residuais;
8. recomendação de conversa;
9. recomendação de paralelismo;
10. mensagens exatas que o proprietário deverá utilizar.
