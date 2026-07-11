ESTADO: STATE-01 SETUP_PROJECT

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

Executar a preparacao tecnica inicial do projeto.

Esta e a unica fase onde tooling de setup e permitido.

---

ANTES DE EXECUTAR

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

---

PERMITIDO

* Criar estrutura base do projeto.
* Criar package.json quando necessario.
* Instalar dependencias obrigatorias.
* Inicializar scaffold Prisma quando aplicavel.
* Criar configuracoes de runtime.
* Criar configuracoes de ambiente.
* Configurar Docker quando necessario.

---

PROIBIDO

* Implementar modulo funcional.
* Criar regra de negocio.
* Criar telas finais.
* Criar APIs funcionais.
* Criar schema de dominio alem da inicializacao necessaria.
* Declarar fase futura como concluida.

---

DEPENDENCIAS MINIMAS OBRIGATORIAS

Instalar e registrar evidencia das dependencias necessarias para todas as fases futuras, incluindo quando aplicavel:

* Frontend: Next.js, React, TypeScript, Tailwind, ShadCN ou base compativel, biblioteca de formularios, validacao e cliente HTTP.
* Backend: Node.js, Express ou framework aprovado em arquitetura, TypeScript, Prisma Client, cliente PostgreSQL, validacao, auth/JWT, seguranca basica e middleware operacional.
* Banco: Prisma CLI apenas para inicializacao tecnica, sem migrations de dominio nesta fase.
* Qualidade: lint, formatacao, testes, tipos e scripts de build/check.
* Ambiente: Docker, docker-compose, variaveis de ambiente de exemplo e configuracoes de runtime.

Se uma dependencia necessaria para fase futura nao puder ser instalada nesta fase, registrar bloqueio ou pendencia explicita.

---

REGRA PRISMA

Esta fase pode criar apenas o scaffold tecnico do Prisma.
Esta fase nao pode criar schema de dominio, modelos funcionais ou migrations de dominio.
STATE-03 DATABASE_MODELING e responsavel pelo schema de dominio.

---

ENTREGAVEIS

* Estrutura base do projeto.
* Dependencias instaladas.
* Configuracoes iniciais.
* Scaffold Prisma tecnico, quando aplicavel, sem schema de dominio.
* Evidencias de tooling de setup executado exclusivamente nesta fase.
* Pendencias para STATE-02 ARCHITECTURE.

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
