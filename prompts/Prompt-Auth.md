PROMPT DE AUDITORIA DE AUTENTICACAO E SESSAO

REGRA DE OURO

Este prompt nao cria, altera ou transiciona estado.
Apenas a State Machine pode alterar estado.

Quando executado em STATE-08 PRODUCTION_RELEASE, qualquer alteracao de schema,
migration, backend, frontend, configuracao, testes ou comportamento de seguranca
deve ser registrada como manutencao funcional pos-release.

---

REGRA DE COMMIT

Ao concluir qualquer alteracao solicitada neste arquivo ou derivada dele, criar commit local com mensagem clara e escopo fechado.
O commit deve incluir somente arquivos relacionados a alteracao executada.
Se nao houver alteracao de arquivo, registrar explicitamente que nao ha commit a criar.
Nao incluir mudancas externas, geradas ou nao relacionadas sem solicitacao explicita.

---


OBJETIVO

Auditar e corrigir o fluxo completo de autenticacao, sessao, autorizacao e
seguranca relacionada a acesso no ShiftFlow.

---

ESCOPO

Este prompt cobre:

* Login.
* Logout.
* Refresh token.
* Revogacao de access token.
* Politica de senha.
* Bloqueio por tentativas.
* Sessao no frontend.
* JWT e segredos.
* RBAC.
* Escopo por empresa.
* Logs e auditoria.
* Headers, CORS e protecoes HTTP.
* Dependencias relacionadas a seguranca.

Prompt-Password.md complementa este prompt quando o foco for remediacao
especifica de senhas, credenciais e valores sensiveis em arquivos.

---

CHECKLIST DE AUDITORIA

1. Login

* Validar credenciais sem revelar se usuario ou senha esta incorreto.
* Aplicar rate limit e bloqueio progressivo quando configurado.
* Garantir hash forte de senha.
* Bloquear usuarios inativos ou excluidos logicamente.
* Respeitar empresa ativa e permissao de acesso.

2. Sessao e tokens

* Access token deve ter expiracao curta.
* Refresh token deve ser persistido, revogavel e escopado corretamente.
* Logout deve revogar tokens relevantes.
* Troca de senha deve invalidar sessoes antigas quando aplicavel.
* Segredo JWT nao pode usar fallback inseguro em producao.

3. Frontend

* Sessao deve sobreviver a reload quando essa for a regra do produto.
* Estado autenticado nao deve vazar entre usuarios.
* Erros de login devem ser claros sem expor detalhes sensiveis.
* Rotas protegidas devem bloquear acesso sem token valido.

4. RBAC e escopo

* Permissoes devem ser validadas no backend.
* Frontend pode ocultar acoes, mas nao e fonte de autorizacao.
* Operacoes devem respeitar companyId e escopo operacional.
* Atribuicao de roles e permissions nao pode cruzar empresas indevidamente.

5. Configuracao e infraestrutura

* CORS deve ser configuravel.
* Headers de seguranca devem estar ativos.
* Variaveis sensiveis nao devem ter defaults inseguros.
* Logs nao devem expor senha, token ou hash.

---

RESTRICOES

Nao registrar senha, token ou hash em texto claro.
Nao manter credenciais reais em .env.example, seeds, testes ou documentacao.
Nao relaxar RBAC para corrigir fluxo de login.
Nao criar permissao apenas visual sem validacao backend.
Nao classificar mudanca de auth como patch documental se alterar comportamento.

---

CRITERIOS DE ACEITE

* Login, refresh e logout funcionam conforme contrato.
* Tokens podem ser revogados.
* Tentativas invalidas sao tratadas sem vazamento de informacao.
* RBAC continua aplicado no backend.
* Escopo multiempresa e preservado.
* Variaveis sensiveis estao documentadas sem segredo real.
* Gates de seguranca, lint, typecheck, testes e build passam quando aplicavel.

---

ENTREGAVEIS

Ao executar este prompt, registrar:

* Achados de seguranca.
* Correcoes aplicadas.
* Riscos remanescentes.
* Evidencias de validacao.
* Impacto em schema, API, frontend ou configuracao.
