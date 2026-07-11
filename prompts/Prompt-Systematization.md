PROMPT DE SISTEMATIZACAO GLOBAL

REGRA DE OURO

Este prompt nao altera estado e nao autoriza refatoracao fora da fase permitida.
Qualquer mudanca funcional exige pedido explicito, classificacao, evidencias e gates.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Sistematizar o projeto para torna-lo organizado, modular, auditavel, escalavel e facil de manter.

---

ESCOPO DE ANALISE

Analisar:

* Codigo-fonte.
* Estrutura de diretorios.
* Arquitetura.
* Dependencias.
* Configuracoes.
* Processos.
* Documentacao.
* Fluxos de desenvolvimento.
* Pipeline de entrega.
* Seguranca.
* Observabilidade.

---

ORGANIZACAO

Avaliar e propor:

* Estrutura clara de pastas.
* Modulos com responsabilidade unica.
* Convencoes de nomenclatura.
* Separacao entre dominio, infraestrutura, interface e testes.
* Padronizacao de componentes, servicos e APIs.
* Remocao de duplicidades reais.
* Remocao de codigo morto.
* Reducao de acoplamento.

---

QUALIDADE

Aplicar quando fizer sentido:

* SOLID.
* DRY.
* KISS.
* YAGNI.
* Separation of concerns.
* Clean code.
* Clean architecture.
* Domain-driven design.
* Modular architecture.
* Convention over configuration.

---

GOVERNANCA

Definir ou revisar:

* Padroes de desenvolvimento.
* Padroes de documentacao.
* Padroes de versionamento.
* Padroes de deploy.
* Padroes de testes.
* Padroes de monitoramento.
* Padroes de tratamento de erros.
* Padroes de logging.
* Padroes de configuracao de ambientes.

---

AUTOMACAO E OBSERVABILIDADE

Avaliar:

* CI/CD.
* Testes automatizados.
* Validacoes de qualidade.
* Validacoes de seguranca.
* Build automatizado.
* Deploy automatizado.
* Analise estatica.
* Logging estruturado.
* Monitoramento.
* Rastreamento de erros.
* Metricas.
* Auditoria.

---

RESTRICOES

* Nao alterar regra de negocio sem justificativa tecnica.
* Nao remover funcionalidade existente sem analise de impacto.
* Preservar comportamento funcional atual quando nao houver pedido explicito de mudanca.
* Nao criar abstracoes sem reducao real de complexidade.
* Nao duplicar documentos de controle quando os atuais forem suficientes.

---

ENTREGAVEIS

Gerar:

* Diagnostico de organizacao.
* Lista de conflitos e redundancias.
* Plano de sistematizacao.
* Alteracoes propostas por prioridade.
* Evidencias.
* Riscos e pendencias.
