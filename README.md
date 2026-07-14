# Cobbleverse Companion

Aplicativo desktop local para acompanhar o modpack **COBBLEVERSE 1.7.31-CF**, Minecraft 1.21.1 e Cobblemon 1.7.3.

## Recursos

- Pokédex completa com 1025 espécies, atributos, evoluções e spawns consolidados do modpack instalado.
- Busca de drops por item ou Pokémon, incluindo porcentagem, quantidade e compatibilidade com o Pasture Block.
- Consulta dos 78 baits e recomendação de perks por tipo, Egg Group e EV yield.
- Catálogo de 70 berries e todas as 40 combinações de crossplanting.
- Compatibilidade de breeding por Egg Group, gênero e Ditto.
- Times pessoais e counters por tipo, sem lógica de escudo.
- Guia dos 32 ginásios de Kanto, Johto, Hoenn e Sinnoh, com bioma, ordem, equipes oficiais e recomendações.
- Dados pessoais salvos apenas no computador, com exportação e importação de backup.

Telemetria, Quiz, GTS, invasões, Collection, calculadora de breeding e fragmentos não fazem parte da v2.

## Migração da v1

A v2 começa com progresso zerado. No primeiro início:

- arquivos antigos do banco desktop são copiados para `backups/v1` dentro do diretório de dados do aplicativo;
- as chaves antigas do `localStorage` recebem um snapshot separado chamado `cobbleverse-companion-v1-backup`;
- os arquivos e chaves originais não são apagados nem importados no banco novo `cobbleverse-companion-db.json`.

## Desenvolvimento

Pré-requisitos: Node.js, Rust e as dependências de build do Tauri no Windows.

```powershell
npm install
npm run data:cobbleverse
npm run verify:data
npm run dev
```

O gerador lê a instalação local padrão do CurseForge. Para outra pasta:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-cobbleverse-data.ps1 -InstancePath "C:\caminho\para\COBBLEVERSE"
```

Para gerar instaladores:

```powershell
npm run build
```
