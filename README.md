# Pokedex Checklist

Aplicativo local para acompanhar Pokemon capturados e faltantes no Pixelmon.

## Como abrir

No Windows, execute:

```powershell
.\iniciar-checklist.bat
```

O atalho inicia `servidor-local.ps1`, abre o navegador e habilita o salvamento local.

## Estado local

O progresso do usuario fica em `pokemon-checklist-db.json`.

Esse arquivo nao faz parte do projeto publicado. Se ele nao existir, o servidor cria um novo automaticamente com a estrutura:

```json
{
  "version": 2,
  "updatedAt": "2026-06-03T00:00:00.000Z",
  "captured": []
}
```

As configuracoes da maquina ficam em `pokemon-checklist-config.json`, incluindo a pasta local de logs. Esse arquivo tambem nao deve ser publicado.

## Captura por logs locais

A tela possui um painel lateral para monitorar capturas detectadas nos logs do Pixelmon.

Na primeira vez que usar a ferramenta, informe no painel a pasta de logs do seu launcher. Um caminho comum e:

```text
%APPDATA%\CoreLauncher\game\instances\Pixelmon Brasil - Gen 9\logs
```

Esse caminho pode variar entre computadores, launchers e nomes de instancia.

Eventos detectados entram apenas como candidatos. O Pokemon so e salvo na Pokedex depois da confirmacao manual do usuario, evitando falso positivo.

## Arquivos do projeto

- `pokemon-checklist.html`: interface principal, filtros, cards, busca, painel de capturas detectadas e regras de exibicao.
- `servidor-local.ps1`: servidor local. Entrega os arquivos do app, cria/salva `pokemon-checklist-db.json` e monitora os logs reais do jogo.
- `iniciar-checklist.bat`: atalho para iniciar o servidor local.
- `pokemon-catalogo-data.js`: catalogo nacional de Pokemon.
- `lista-falta-pokemon-data.js`: lista base compilada usada pela tela para classificacao inicial.
- `pokemon-metodos-data.js`: metodos de obtencao/evolucao.
- `pokemon-biomas-data.js`: informacoes de encontro/captura no Pixelmon.

## Arquivos locais ignorados

- `pokemon-checklist-db.json`: progresso pessoal do usuario.
- `pokemon-checklist-config.json`: configuracoes locais da maquina, como a pasta de logs.
- `logs-game/` e `logs-launcher/`: copias locais de logs usadas apenas durante investigacao.
- `.chrome-preview/` e `.codex-db-function-test-*/`: artefatos temporarios locais.
