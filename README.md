# AI Demo Agent

Transforme uma aplicação funcionando — web ou desktop — em um vídeo de
demonstração verificado e em posts prontos para revisão, sem gravar a tela
manualmente.

> Projeto idealizado e dirigido por Gustavo Martins, desenvolvido com auxílio
> total de inteligência artificial.

A regra que guia o produto: **a IA não inventa funcionalidade**. Cada afirmação
que chega a um post precisa estar amarrada a algo que foi comprovado na
interface durante a execução, e nada é publicado sem aprovação explícita.

## O que o agente faz hoje

1. **Recebe o projeto** pelo dashboard privado: URL pública, repositório e o
   objetivo da demonstração.
2. **Planeja a narrativa** com o Hermes Agent, que devolve um roteiro em JSON
   validado antes de qualquer execução.
3. **Usa o produto de verdade** — Playwright no Chromium para aplicações web,
   Hermes Computer Use para aplicações desktop nativas.
4. **Grava e comprova**: vídeo da execução, screenshots das verificações e um
   relatório estruturado de cada passo.
5. **Escreve os posts** para X e LinkedIn em inglês, em primeira pessoa, usando
   apenas afirmações verificadas na execução.
6. **Espera você**: revisão, edição e aprovação explícita antes de publicar.

## Estrutura do repositório

```text
apps/web/   dashboard Next.js, banco de dados e worker de geração
src/        motor de planejamento, execução, gravação e qualidade dos posts
tests/      testes do motor, integrações e jornada end-to-end
docs/       arquitetura, runbooks e limites de segurança
```

## Como rodar localmente

Requisitos: Node.js 20 ou superior, Docker (para o PostgreSQL) e o comando
`hermes` disponível no PATH.

```bash
npm install
npx playwright install chromium

cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
npm run db:migrate

npm run dev:web   # dashboard em http://localhost:3000
npm run worker    # processa as gerações em outro terminal
```

O acesso ao dashboard é individual: o login usa GitHub OAuth e só a conta
definida em `APP_OWNER_GITHUB_LOGIN` entra no workspace.

O worker roda separado do servidor web de propósito — ele é o único processo
que recebe acesso à sessão gráfica e executa aplicações locais.

## Aplicações web

O caminho web também funciona pela linha de comando, útil para testar um
roteiro sem subir o dashboard.

Gerar o plano sem gravar:

```bash
npm run plan -- --url https://produto.dev --objective "Mostrar o fluxo principal"
```

O comando lê o `README.md` do repositório atual quando ele existe e salva um
`demo-plan.json` validado dentro de `output/`.

Depois de revisar o arquivo, pedir a gravação:

```bash
npm run record-plan -- output/.../demo-plan.json
```

Objetivo, resumo, alertas e passos aparecem antes da confirmação. Somente uma
resposta `s`/`sim` inicia o Playwright; em automação já aprovada, `--yes`
registra a confirmação explicitamente na chamada.

Para executar um roteiro escrito à mão:

```bash
npm run demo -- caminho/do/roteiro.demo.json
```

Use [examples/example.demo.json](examples/example.demo.json) como referência.

## Aplicações desktop

Um projeto desktop guarda a URL pública do produto para a história do
lançamento e adiciona o caminho local do projeto mais o comando de inicialização
que o worker executa.

O comando de inicialização é código executável, não metadado. Ele nunca passa
por shell: o caminho precisa cair dentro da lista de raízes autorizadas
(`AI_DEMO_DESKTOP_PROJECT_ROOTS`), o executável é resolvido dentro do próprio
projeto e invocado com uma lista de argumentos.

No Linux a gravação captura a região exata da janela X11 e produz MP4 H.264 via
GStreamer, sem depender de ferramentas expostas ao modelo. A execução exige
`xprop`, `xwininfo`, `gst-launch-1.0` e os plugins GStreamer correspondentes. Um
deploy só-web deixa o caminho desktop desligado simplesmente omitindo a lista de
raízes.

Duas travas de qualidade nasceram de falhas reais e continuam ativas:

- o plano desktop precisa conter pelo menos uma interação de verdade (clique,
  preenchimento ou tecla) com evidência visual do resultado — uma sequência só
  de verificações não demonstra o produto;
- a gravação é decodificada e reprovada se todos os quadros estiverem preto ou
  visualmente vazios, o que acontecia com o renderizador GPU do GTK4 mesmo com
  a janela visível na tela.

Detalhes e limites conhecidos em
[docs/desktop-app-demos.md](docs/desktop-app-demos.md).

## Qualidade e segurança dos posts

Os rascunhos passam por avaliações determinísticas antes de chegar à revisão:
formato válido, texto realmente em inglês, voz de portfólio em primeira pessoa
(sem linguagem de venda ou hype de lançamento), links obrigatórios quando o
projeto é open source, menções apenas entre as candidatas conhecidas e toda
afirmação amarrada a um `claimId` verificado.

A publicação exige aprovação explícita, é idempotente e nunca acontece por
efeito colateral de outra ação.

## Verificação

```bash
npm run check          # tipos
npm test               # testes de unidade e integração
npm run lint:web
npm run test:e2e       # jornada completa do dono no navegador
npm run validate:production
```

A jornada end-to-end prova que o dono autenticado consegue revisar a mídia
gerada, editar e aprovar um rascunho de X e conferir um resultado já publicado
no LinkedIn. O harness nunca chama X ou LinkedIn de verdade, então o CI não
consegue criar post público.

## Documentação

| Assunto | Documento |
| --- | --- |
| Modelo de dados | [docs/data-model.md](docs/data-model.md) |
| Arquitetura e runbook da aplicação web | [docs/web-foundation.md](docs/web-foundation.md) |
| Login privado e GitHub OAuth | [docs/workspace-authentication.md](docs/workspace-authentication.md) |
| Worker de geração (Hermes + Playwright) | [docs/generation-worker.md](docs/generation-worker.md) |
| Demonstrações de aplicações desktop | [docs/desktop-app-demos.md](docs/desktop-app-demos.md) |
| Qualidade e evals dos posts | [docs/social-draft-quality.md](docs/social-draft-quality.md) |
| OAuth de X e LinkedIn | [docs/social-oauth.md](docs/social-oauth.md) |
| Aprovação, publicação e incidentes | [docs/social-publishing.md](docs/social-publishing.md) |
| Verificação end-to-end | [docs/e2e-verification.md](docs/e2e-verification.md) |
| Deploy, health checks, backups e métricas | [docs/production-deployment.md](docs/production-deployment.md) |

## Integração com o Hermes Agent

O Hermes analisa o objetivo e propõe o plano; a execução e a gravação ficam com
o Playwright (web) ou com o Computer Use limitado ao processo lançado (desktop).
O contrato entre as partes são os schemas `hermesPlanningRequestSchema` e
`hermesDemoPlanSchema`, e toda resposta é validada antes de virar execução.

```bash
AI_DEMO_HERMES_COMMAND=hermes
AI_DEMO_HERMES_MODEL=
AI_DEMO_HERMES_PROVIDER=
AI_DEMO_HERMES_TIMEOUT_MS=300000
```

Modelo e provedor vazios preservam a configuração que já estiver ativa no
Hermes.

O ciclo web foi validado de ponta a ponta com o Hermes Agent v0.20.4: o Hermes
analisou o site oficial do Playwright, gerou um plano de oito passos e, depois
da aprovação, o Playwright concluiu todos eles com quatro evidências visuais e
status final `passed`. O ciclo desktop foi validado com o Water Reminder, que
produziu relatório `passed`, MP4 reproduzível e rascunhos de X e LinkedIn em
`READY_FOR_REVIEW`.

## Arquitetura

```text
URL + repositório + objetivo
           │
           ▼
  Analisador de produto
           │
           ▼
 Planejador de narrativa ──► aprovação humana
           │
           ▼
 Executor Playwright / Computer Use ──► evidências + vídeo
           │
           ▼
 Rascunhos com afirmações verificadas ──► aprovação humana
           │
           ▼
        X / LinkedIn
```

## Roadmap

- [x] Executar roteiros determinísticos
- [x] Gravar o navegador automaticamente
- [x] Validar passos e limitar esperas
- [x] Ler README e páginas do produto
- [x] Gerar roteiro com saída estruturada por IA
- [x] Mostrar e aprovar o plano antes da gravação
- [x] Dashboard privado com fila de geração
- [x] Gravar aplicações desktop nativas
- [x] Reprovar gravação preta ou sem interação real
- [x] Avaliar factualidade e voz dos posts
- [x] Publicar em X e LinkedIn com aprovação explícita
- [ ] Destacar cursor e aplicar zoom nas ações
- [ ] Gerar narração e legendas sincronizadas
- [ ] Exportar MP4 horizontal e vertical
- [ ] Detectar segredos e dados pessoais na tela
- [ ] Integrar com GitHub Releases

## Princípios de segurança

- Executar somente URLs, caminhos e comandos autorizados pelo usuário.
- Nunca passar comando de inicialização por shell.
- Bloquear ações destrutivas por padrão.
- Nunca gravar senhas, tokens ou informações pessoais.
- Exigir aprovação antes de publicar externamente.
- Manter registro das ações realizadas pelo agente.
- Separar ambiente de demonstração de dados de produção.

## Métricas do produto

- porcentagem de roteiros concluídos;
- afirmações comprovadas na interface;
- tempo economizado em relação à gravação manual;
- custo por vídeo;
- quantidade de intervenções humanas;
- estabilidade após mudanças na interface.

## Licença

Distribuído sob a licença MIT.
