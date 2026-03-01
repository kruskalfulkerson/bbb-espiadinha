# 👀 Espiadinha Dashboard

![Source Available](https://img.shields.io/badge/license-non--commercial-orange)
![Next.js](https://img.shields.io/badge/Next.js-14-black)
![Playwright](https://img.shields.io/badge/Playwright-scraping-45ba63)
![GitHub Pages](https://img.shields.io/badge/deploy-GitHub%20Pages-222)
![GitHub Actions](https://img.shields.io/badge/sync-GitHub%20Actions-2088FF)

Um dashboard nao oficial para acompanhar, filtrar e explorar posts publicos do canal **Espiadinha - BBB 26** no Telegram, com foco em **timeline**, **resumo analitico**, **ranking de reacoes** e **posts mais quentes**.

A aplicacao coleta os posts publicos do canal com **Playwright**, gera um `posts.json` e publica tudo como site estatico com **Next.js + GitHub Pages + GitHub Actions**.

---

## ✨ Visao geral

O projeto foi pensado para transformar um canal publico do Telegram em uma experiencia de navegacao mais rica, organizada e visual.

Voce pode:

- acompanhar uma **timeline interativa**
- filtrar por **texto**, **data** e **participantes**
- navegar por **dias especificos**
- visualizar o **post mais quente do periodo**
- visualizar o **post mais quente de hoje**
- analisar **reacoes**, **emoji campeao** e **horarios mais agitados**
- manter tudo atualizado com **sincronizacao automatica**

---

## 🧩 Como funciona

1. Um script abre a pagina publica do canal no Telegram com **Playwright**.
2. Os posts renderizados sao lidos do DOM.
3. Os dados sao normalizados e salvos em `public/posts.json`.
4. O frontend consome esse JSON.
5. O GitHub Actions roda o sync periodicamente e republica o site.

---

## 🚀 Stack

- **Next.js**
- **React**
- **TypeScript**
- **Tailwind CSS**
- **Playwright**
- **GitHub Pages**
- **GitHub Actions**

---

## 📌 Recursos principais

### Feed
- timeline com rolagem progressiva
- embeds dos posts do Telegram
- filtro por texto
- filtro por periodo
- filtro por participantes
- navegacao por dia
- botao para voltar ao topo
- botao para salvar posts

### Resumo
- total de posts do recorte
- total de reacoes
- emoji campeao
- hora mais agitada
- nome do momento
- top emojis do periodo
- post mais quente do periodo
- post mais quente de hoje

### Sincronizacao
- coleta dos posts publicos diretamente do canal
- atualizacao automatica por workflow
- suporte a execucao manual do sync
- geracao incremental de `posts.json`

---

## 🤝 Codigo aberto para estudo e forks

Este repositorio foi publicado para **estudo, aprendizado, adaptacao e criacao de forks**.

A proposta e incentivar que outras pessoas possam:

- clonar o projeto
- entender a implementacao
- melhorar a interface e a experiencia
- criar derivados e outros experimentos interessantes a partir desta base

O projeto **nao foi disponibilizado com foco em revenda ou exploracao comercial por terceiros**.
Consulte a licenca do repositorio para entender os limites de uso, redistribuicao e adaptacao.

---

## 📁 Estrutura do projeto

```text
.
├── app/
│   ├── page.tsx
│   ├── globals.css
│   └── favicon.ico
├── public/
│   └── posts.json
├── scripts/
│   └── sync-telegram-posts.mjs
├── .github/
│   └── workflows/
│       ├── sync-posts.yml
│       └── deploy-pages.yml
├── package.json
├── next.config.mjs
└── README.md
```

---

## 🛠️ Executando localmente

### 1) Instale as dependencias

```bash
npm install
```

### 2) Instale o Chromium do Playwright

```bash
npm run pw:install
```

### 3) Rode a sincronizacao

```bash
npm run sync
```

### 4) Inicie o ambiente local

```bash
npm run dev
```

Depois, abra:

```text
http://localhost:3000
```

---

## 🔄 Scripts disponiveis

### Instalar dependencias do navegador
```bash
npm run pw:install
```

### Sincronizar posts do canal
```bash
npm run sync
```

### Rodar em desenvolvimento
```bash
npm run dev
```

### Gerar build estatico
```bash
npm run build
```

---

## 🌐 Publicacao

O projeto foi preparado para rodar com:

- **GitHub Pages**
- **GitHub Actions**

### Estrategia de deploy
- o site e exportado como estatico
- o workflow publica a versao gerada no GitHub Pages
- outro workflow roda o sync automatico e atualiza o `posts.json`

### Frequencia do sync
Por padrao, o workflow esta configurado para rodar **a cada 5 minutos**.

---

## ✅ Fluxo recomendado de publicacao

Antes de colocar no ar, o ideal e:

1. rodar `npm install`
2. rodar `npm run pw:install`
3. rodar `npm run sync`
4. conferir se o `public/posts.json` esta correto
5. subir o projeto para o GitHub
6. ativar o GitHub Pages via Actions

Isso ajuda a evitar que o site entre no ar sem dados iniciais.

---

## ⚙️ Configuracao do Next.js

Se o projeto for publicado em um repositorio comum do GitHub Pages, ajuste o `basePath` no `next.config.mjs` para o nome do repositorio.

Exemplo:

```js
basePath: '/nome-do-repositorio'
```

Se estiver usando um repositorio do tipo `usuario.github.io`, normalmente nao precisa de `basePath`.

---

## 📊 Sobre os dados

Os dados exibidos na interface sao gerados a partir do arquivo:

```text
public/posts.json
```

Esse arquivo e a base do frontend.

Ele contem, entre outros campos:

- identificador do post
- data
- texto
- link do post
- lista de reacoes
- total de reacoes
- views
- indicadores auxiliares para filtros e dashboard

---

## 🧠 Observacoes sobre metricas

A interface calcula o resumo a partir do conjunto de dados disponivel no `posts.json`.

Isso inclui:

- soma total das reacoes
- total de reacoes por post
- ranking de emojis
- emoji mais usado
- post mais quente
- indicadores por periodo e por dia atual

Se o `posts.json` vier corretamente preenchido, o feed e o resumo usam a mesma base logica para os calculos.

---

## 📱 UX e interface

O projeto foi refinado para funcionar bem em desktop e mobile, com atencao para:

- visual limpo
- carregamento progressivo
- navegacao por dia
- cards de destaque
- mensagens editoriais discretas
- layout responsivo
- embeds ajustados para telas menores

---

## ⚠️ Aviso importante

Este projeto e **nao oficial**.

Ele foi desenvolvido como um **agregador independente** de posts publicos de um canal do Telegram.
Nao ha vinculo com o canal, com os administradores do canal, nem com os titulares das marcas relacionadas ao programa.

O desenvolvedor **nao se responsabiliza pelo conteudo publicado por terceiros** no canal de origem.
A aplicacao apenas organiza e apresenta publicacoes publicas ja disponiveis.

---

## 💡 Possiveis melhorias futuras

- favoritos persistentes
- exportacao de recortes
- comparacao entre dias
- destaques por participante
- filtros mais avancados
- historico incremental mais detalhado
- indicadores por faixa horaria
- painel comparativo entre periodo e dia atual

---

## 👨‍💻 Creditos

Feito com 🔮 por Tilap.io

---

## 📄 Licenca

Este projeto e disponibilizado sob uma licenca **nao comercial**, voltada para **estudo, aprendizado, adaptacao e criacao de forks**.

Voce pode clonar, estudar e modificar este repositorio para projetos pessoais, educacionais e experimentais, desde que respeite os termos descritos no arquivo [`LICENSE`](./LICENSE).
