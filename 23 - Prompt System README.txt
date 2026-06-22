README DO SISTEMA DE PROMPTS

REGRA DE OURO

Nenhum prompt, gate, agente, documento operacional, snapshot ou log pode criar ou alterar estado.
Apenas a State Machine pode alterar estado.

---

OBJETIVO

Este arquivo explica como usar o sistema de prompts no dia a dia.

---

COMO USAR

1. Consulte 00 - Start Here.txt.
2. Consulte 01 - Current State.txt.
3. Consulte 02 - Prompt Index.txt.
4. Consulte 03 - Official State Machine.txt.
5. Confirme qual fase solicitada esta permitida pelo estado atual.
6. Use apenas comandos permitidos para essa fase.
7. Execute o prompt da fase solicitada permitida.
8. Se houver modulo, consulte 13 - Module Phase Matrix.txt.
9. Valide evidencias com 11 - Evidence Standard.txt.
10. Valide conclusao com 10 - Acceptance Criteria by State.txt e 12 - Global Definition of Done.txt.
11. Atualize 09 - Project Snapshot.txt.
12. Registre a tentativa, bloqueio ou transicao em 18 - State Transition Log.txt.

---

COMO USAR PROMPTS DE REVISAO GLOBAL

Prompt Revision.txt e Prompt Restructuring.txt sao entradas operacionais pos-release.
Eles nao substituem a State Machine, nao liberam alteracao fora da fase permitida e nao concluem diagnostico por si mesmos.

Quando forem usados:

1. Tratar os documentos como escopo consolidado de diagnostico e correcao.
2. Separar achados por camada: arquitetura, banco, backend, frontend, integracao, testes e release.
3. Executar apenas a camada permitida pelo estado atual ou registrar bloqueio/conflito.
4. Registrar problemas encontrados, correcoes realizadas, evidencias, riscos e pendencias no snapshot e nos relatorios aplicaveis.

---

ARQUIVOS PRINCIPAIS

00 - Start Here.txt:

* Ponto de entrada oficial.

03 - Official State Machine.txt:

* Fluxo oficial.

01 - Current State.txt:

* Estado atual declarado.

02 - Prompt Index.txt:

* Catalogo dos prompts e controles.

06 - Execution Protocol.txt:

* Roteiro operacional.

10 - Acceptance Criteria by State.txt:

* Criterios por estado.

11 - Evidence Standard.txt:

* Padrao de evidencias.

12 - Global Definition of Done.txt:

* Checklist global de conclusao.

13 - Module Phase Matrix.txt:

* Mapeamento modulo x fase.

18 - State Transition Log.txt:

* Historico de transicoes.

21 - Prompt System Change Log.txt:

* Historico de mudancas no sistema de prompts.

22 - Prompt System Audit.txt:

* Auditoria periodica do proprio sistema de prompts.

---

REGRA FINAL

Se houver duvida, aplique 14 - Conflict Resolution Policy.txt.
Se houver bloqueio, aplique 15 - Blocked State Protocol.txt.
Se houver reversao, aplique 16 - Controlled Rollback Policy.txt.




