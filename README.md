# Pixelmon - Pokelist

Aplicativo desktop/local para acompanhar uma Pokedex pessoal no Pixelmon.

Ele ajuda a ver o que ja foi capturado, o que ainda falta, como obter cada Pokemon, quais especies sao compativeis para breeding, telemetria de capturas e counters por tipo para raids/bosses.

## Destaques

- Pokedex Nacional com 1025 especies, da geracao 1 a 9.
- Checklist com busca, filtros por status, metodo, tipo e ordenacao.
- Modal de detalhes por Pokemon com tipo, egg groups, evolucoes, obtencao e wiki.
- Telemetria com progresso geral, progresso por geracao/metodo e historico de capturas.
- Breeding com busca por Pokemon, egg groups e lista de compativeis.
- Counters por tipo com busca de boss, sugestoes com imagem e tipos super efetivos.
- Monitor opcional de logs locais do Pixelmon com confirmacao manual.
- Tema claro/escuro, modo compacto e exportacao de faltantes.
- App desktop Tauri com dados salvos localmente no computador.
- Botao manual para buscar atualizacoes via GitHub Releases.

## Fluxos Do App

### Checklist

Fluxo principal para marcar Pokemon como capturados ou faltantes.

Use os filtros para navegar por:

- status;
- metodo de obtencao;
- tipo do Pokemon;
- ordem numerica ou alfabetica;
- geracoes e categorias especiais no menu lateral.

### Telemetria

Mostra a evolucao da sua Pokedex com graficos e tabela de capturas.

A data de captura e definida quando o Pokemon e marcado como capturado.

### Breeding

Ajuda a encontrar Pokemon compativeis por egg group.

Voce pode buscar uma especie especifica ou filtrar por grupo.

### Counters

Ajuda a escolher o que levar contra um boss ou elemento.

Voce pode:

- buscar o boss por nome ou numero;
- selecionar automaticamente os tipos do boss;
- marcar tipos manualmente;
- ver quais tipos causam dano forte;
- ver sugestoes de Pokemon finais para levar.

### Logs Locais

O painel lateral pode monitorar logs do Pixelmon e sugerir capturas detectadas.

Nada entra automaticamente na Pokedex: toda sugestao precisa ser confirmada.

## Como Rodar Em Desenvolvimento

Pre-requisitos:

- Node.js com npm;
- Rust com Cargo;
- dependencias de build do Tauri no Windows.

Instale as dependencias:

```powershell
npm install
```

Rode o app em modo desenvolvimento:

```powershell
npm run dev
```

## Como Gerar O Installer

Crie o build desktop:

```powershell
npm.cmd run build
```

Os installers ficam em:

```text
src-tauri/target/release/bundle/
```

No Windows, o arquivo mais simples para compartilhar costuma ser:

```text
src-tauri/target/release/bundle/nsis/Pixelmon - Pokelist_X.X.X_x64-setup.exe
```

## Atualizacoes Pelo App

O app tem um botao manual `Buscar atualizacoes`.

Esse fluxo usa o updater do Tauri:

1. O usuario instala o app uma vez pelo installer.
2. Depois, quando voce publicar uma nova release no GitHub, ele pode clicar em `Buscar atualizacoes`.
3. Se houver versao nova, o app baixa, instala e reinicia.

Isso evita que seu amigo precise baixar e executar o installer manualmente toda vez.

## Como Publicar Uma Release Com Update

### Fluxo automatico

O caminho recomendado e deixar o GitHub Actions gerar o installer, a assinatura e o `latest.json`.

Antes de disparar:

1. Aumente a versao em `src-tauri/tauri.conf.json`.
2. Deixe `package.json` com a mesma versao.
3. Faca commit de todas as mudancas da release.
4. Rode:

```powershell
npm.cmd run release:github
```

Esse comando valida a tag esperada, roda checks locais, cria a tag `vX.Y.Z`, envia a branch/tag para o GitHub e dispara o workflow `.github/workflows/release.yml`.

Para testar sem enviar nada:

```powershell
npm.cmd run release:github -- --dry-run
```

### Fluxo manual

Se precisar publicar sem GitHub Actions, rode o build:

```powershell
npm run build
```

Depois gere a assinatura e o arquivo de update:

```powershell
npm.cmd run release:latest-json
```

Esse comando gera:

```text
src-tauri/target/release/bundle/nsis/Pixelmon - Pokelist_X.X.X_x64-setup.exe.sig
src-tauri/target/release/bundle/nsis/latest.json
```

Na release do GitHub, envie estes arquivos. Se o upload sanitizar espacos, mantenha o mesmo padrao com pontos usado pelo workflow:

```text
Pixelmon.-.Pokelist_X.X.X_x64-setup.exe
Pixelmon.-.Pokelist_X.X.X_x64-setup.exe.sig
latest.json
```

O endpoint configurado no app aponta para:

```text
https://github.com/GabrielMWalker/CustomPokeDex/releases/latest/download/latest.json
```

## Chave De Assinatura

O updater exige assinatura para garantir que o update veio de uma fonte confiavel.

A chave publica fica em `src-tauri/tauri.conf.json`.

A chave privada fica localmente em:

```text
.tauri/pixelmon-pokelist.key
```

Essa pasta esta no `.gitignore` e nao deve ser enviada para o GitHub.

Guarde essa chave com cuidado. Se ela for perdida, updates futuros nao serao aceitos pelos apps ja instalados com essa chave publica.

## Modo Navegador

Abrir `src/index.html` diretamente no navegador ainda funciona para consulta e progresso em `localStorage`.

O modo desktop e o recomendado para uso normal, porque habilita banco local do app, logs locais e updates assinados.

## Estrutura Principal

```text
src/
  index.html
  scripts/app.js
  styles/
  pokemon-*-data.js

src-tauri/
  src/lib.rs
  tauri.conf.json
  Cargo.toml

scripts/
  generate-latest-json.mjs
  release-github.mjs
  fetch-pokemon-*.mjs
  audit-missing-methods.mjs
  fill-missing-pokemon-methods.mjs
```

## Observacoes

As informacoes de biomas, metodos e disponibilidade podem variar conforme a versao do Pixelmon e a configuracao do servidor. Use a lista como apoio pratico e confirme casos especiais no seu servidor.
