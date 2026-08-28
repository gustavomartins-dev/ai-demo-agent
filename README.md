# AI Demo Agent

Transforme uma aplicação web funcionando em um vídeo de demonstração sem precisar gravar a tela manualmente.

> Projeto idealizado e dirigido por Gustavo Martins, desenvolvido com auxílio total de inteligência artificial.

## Visão

O AI Demo Agent recebe uma aplicação e cria uma demonstração reproduzível: entende o produto, planeja uma narrativa, utiliza a interface em um navegador real, grava o fluxo e prepara versões para GitHub, LinkedIn e redes sociais.

O projeto nasce com uma regra importante: a IA não deve inventar funcionalidades. Cada afirmação do vídeo precisa ser comprovada durante a execução.

## Estado atual — v0.1

O primeiro núcleo já está implementado:

- roteiro declarativo e validado em JSON;
- automação real do Chromium com Playwright;
- ações de navegação, clique, preenchimento, teclado e espera;
- verificações visuais antes da conclusão;
- gravação automática em WebM;
- testes do formato de roteiro.

A geração do roteiro por IA, narração e edição automática estão planejadas para as próximas versões.

## Integração planejada com Hermes Agent

O Hermes Agent será responsável por analisar o objetivo e propor um plano. O
Playwright continuará responsável por executar e gravar o roteiro validado.

O contrato entre os dois está definido pelos schemas
`hermesPlanningRequestSchema` e `hermesDemoPlanSchema`. A conexão usa o comando
local `hermes` por padrão e pode ser configurada sem alterar o código:

```bash
AI_DEMO_HERMES_COMMAND=hermes
AI_DEMO_HERMES_MODEL=
AI_DEMO_HERMES_PROVIDER=
AI_DEMO_HERMES_TIMEOUT_MS=120000
```

Modelo e provedor vazios preservam a configuração que já estiver ativa no
Hermes. O AI Demo Agent validará toda resposta antes de entregá-la ao executor.

Para gerar um plano sem iniciar a gravação:

```bash
npm run plan -- \
  --url https://produto.dev \
  --objective "Mostrar o fluxo principal"
```

O comando lê o `README.md` do repositório atual quando ele existe e salva um
`demo-plan.json` validado dentro de `output/`. A gravação não começa nessa etapa.

Depois de revisar o arquivo, solicite a gravação:

```bash
npm run record-plan -- output/.../demo-plan.json
```

O objetivo, o resumo, os alertas e os passos serão exibidos antes da confirmação.
Somente uma resposta `s`/`sim` inicia o Playwright. Em uma automação já aprovada,
`--yes` registra a confirmação explicitamente na chamada do comando.

## Como executar

Requisitos: Node.js 20 ou superior.

```bash
npm install
npx playwright install chromium
npm run demo:example
```

O vídeo será criado dentro de `output/`.

Para gravar outro produto:

```bash
npm run demo -- caminho/do/roteiro.demo.json
```

Use [examples/example.demo.json](examples/example.demo.json) como referência.

## Arquitetura planejada

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
 Executor Playwright ──► evidências + vídeo bruto
           │
           ▼
 Narração + legendas + edição
           │
           ▼
 GitHub / LinkedIn / vídeo vertical
```

## Roadmap

- [x] Executar roteiros determinísticos
- [x] Gravar o navegador automaticamente
- [x] Validar passos e limitar esperas
- [ ] Ler README e páginas do produto
- [ ] Gerar roteiro com saída estruturada por IA
- [ ] Mostrar e aprovar o plano antes da gravação
- [ ] Destacar cursor e aplicar zoom nas ações
- [ ] Gerar narração e legendas sincronizadas
- [ ] Exportar MP4 horizontal e vertical
- [ ] Detectar segredos e dados pessoais na tela
- [ ] Integrar com GitHub Releases e LinkedIn oficial
- [ ] Avaliar factualidade, conclusão e qualidade visual

## Princípios de segurança

- Executar somente URLs e roteiros autorizados pelo usuário.
- Bloquear ações destrutivas por padrão.
- Nunca gravar senhas, tokens ou informações pessoais.
- Exigir aprovação antes de publicar externamente.
- Manter um registro das ações realizadas pelo agente.
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
