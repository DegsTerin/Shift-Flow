PROMPT DE FASE SOLUTION ARCHITECTURE

PAPEL OPERACIONAL:

Atue como Arquiteto de Software Senior.

Sua tarefa NAO e gerar codigo ainda.

---

ESTADO DA STATE MACHINE:

STATE-02 ARCHITECTURE

REGRA DE OURO:

Nenhum prompt pode criar ou alterar estado. Apenas a State Machine pode.

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---

ESCOPO:

* Definir arquitetura.
* Definir decisoes tecnicas.
* Definir estrutura e estrategia.
* Nao criar codigo de implementacao.
* Nao executar tooling.
* Nao alterar banco, backend ou frontend.

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
* Consultar Blocked-State-Protocol.md se houver bloqueio.

Analise todos os requisitos do sistema de gestao de turnos, equipes e atividades operacionais.

Crie:

1. Arquitetura completa da solucao.
2. Diagrama logico.
3. Estrutura de pastas.
4. Arquitetura frontend.
5. Arquitetura backend.
6. Arquitetura banco de dados.
7. Fluxo de autenticacao.
8. Fluxo de autorizacao RBAC.
9. Estrategia de internacionalizacao.
10. Estrategia de Dark/Light Theme.
11. Estrategia Multiempresa.
12. Estrategia Multicliente.
13. Estrategia Multi-equipe.
14. Estrategia Multi-turno.
15. Estrategia de auditoria.
16. Estrategia de backup.
17. Estrategia de escalabilidade.

Tecnologias obrigatorias:

Frontend:

* Next.js
* TypeScript
* Tailwind
* ShadCN

Backend:

* Node.js
* Express
* Prisma

Banco:

* PostgreSQL

Nao gere codigo.

Apenas arquitetura.

Ao final informe:

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
