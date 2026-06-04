# Pixelmon Pokédex Checklist

Aplicativo local para acompanhar o progresso de uma Pokédex no Pixelmon. Ele mostra quais Pokémon já foram adquiridos, quais ainda faltam e qual método ajuda a completar cada entrada.

O app foi pensado para uso local: o progresso fica salvo no próprio computador, sem conta, banco externo ou serviço online.

## Recursos

- Pokédex Nacional com 1025 espécies, da Geração 1 à Geração 9.
- Dashboard com capturados, faltantes e progresso em porcentagem.
- Navegação lateral por gerações e categorias especiais.
- Busca por nome, número ou item.
- Filtros visíveis em chips por status e método.
- Separação entre evolução por nível disponível e evolução por nível com base ausente.
- Cards com sprite, número nacional, método, tipo e ação de captura.
- Tema claro, tema escuro e modo compacto.
- Exportação em `.txt` da lista de Pokémon faltantes.
- Monitor opcional de logs locais do Pixelmon, sempre com confirmação manual.

## Usar Como App Desktop

Este é o modo recomendado para uma experiência mais limpa, sem janela de terminal aberta ao lado.

Pré-requisitos:

- Node.js com npm.
- Rust com Cargo.

Depois de instalar os pré-requisitos, rode:

```powershell
npm install
npm run dev
```

Para gerar um instalador/app final:

```powershell
npm run build
```

No modo desktop, a base de capturados e a configuração da pasta de logs ficam salvas na pasta local de dados do aplicativo do Windows.

## Usar Pelo Navegador

Também é possível usar o modo anterior, com servidor local em PowerShell:

```powershell
.\iniciar-checklist.bat
```

Esse modo abre o app no navegador e salva o progresso em `pokemon-checklist-db.json`, criado automaticamente na pasta do projeto.

## Monitor de Logs Locais

O painel `Logs locais` acompanha o chat gravado nos logs do Pixelmon e sugere capturas detectadas.

Na primeira vez, informe a pasta de logs da sua instância do jogo. Um caminho comum é:

```text
%APPDATA%\CoreLauncher\game\instances\Pixelmon Brasil - Gen 9\logs
```

Esse caminho pode variar conforme o launcher, o nome da instância ou a instalação.

As detecções aparecem como candidatos na lateral direita. Nada é marcado automaticamente: cada Pokémon precisa ser confirmado antes de entrar na Pokédex.

## Estrutura

- `src/index.html`: interface principal do app.
- `src/pokemon-catalogo-data.js`: catálogo nacional de Pokémon.
- `src/lista-falta-pokemon-data.js`: lista base de entradas e classificações.
- `src/pokemon-metodos-data.js`: métodos de obtenção e evolução.
- `src/pokemon-biomas-data.js`: biomas e horários de encontro no Pixelmon.
- `src-tauri/`: app desktop em Tauri.
- `servidor-local.ps1`: servidor local para o modo navegador.
- `iniciar-checklist.bat`: atalho para iniciar o modo navegador no Windows.

## Observações

As informações de biomas e métodos podem variar conforme a versão do Pixelmon e a configuração do servidor. Use os detalhes como apoio prático e confirme casos especiais dentro do seu servidor.
