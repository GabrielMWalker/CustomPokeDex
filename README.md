# Pokédex Checklist para Pixelmon

Aplicativo local para acompanhar o progresso de uma Pokédex no Pixelmon. Ele ajuda a visualizar quais Pokémon já foram adquiridos, quais ainda faltam e qual é o método mais provável para completar cada entrada.

O projeto roda no próprio computador, salva o progresso localmente e não precisa de conta, banco externo ou instalação de dependências.

## Recursos

- Pokédex Nacional com 1025 espécies, da Geração 1 à Geração 9.
- Dashboard com total de capturados, faltantes e progresso em porcentagem.
- Navegação lateral por gerações e categorias especiais.
- Busca por nome, número ou item.
- Filtros por status: faltando, capturados ou todos.
- Filtros por método: encontrar/capturar, evoluir por nível, item, troca e especial.
- Separação entre evolução por nível disponível e evolução por nível com Pokémon base ausente.
- Cards compactos com sprite, número nacional, método e botão de captura.
- Exportação da lista de Pokémon faltantes.
- Monitor opcional de logs locais para sugerir capturas detectadas no Pixelmon.

## Como usar

No Windows, execute:

```powershell
.\iniciar-checklist.bat
```

Isso abre um servidor local e carrega o app no navegador. Mantenha a janela do terminal aberta enquanto estiver usando a Pokédex.

Ao marcar ou desmarcar Pokémon, o progresso fica salvo no computador em um arquivo local criado automaticamente pelo app.

## Monitor de logs locais

O painel `Logs locais` pode acompanhar o chat gravado nos arquivos de log do Pixelmon e sugerir capturas detectadas.

Na primeira vez, informe no campo `Pasta de logs` o caminho da pasta de logs da sua instância do jogo. Um caminho comum é:

```text
%APPDATA%\CoreLauncher\game\instances\Pixelmon Brasil - Gen 9\logs
```

Esse caminho pode mudar conforme o launcher, o nome da instância ou a instalação do usuário.

As detecções aparecem como candidatos na lateral direita. Nada é marcado automaticamente: cada Pokémon precisa ser confirmado manualmente antes de entrar na Pokédex.

## Estrutura dos arquivos

- `pokemon-checklist.html`: interface principal do app.
- `servidor-local.ps1`: servidor local responsável por abrir o app, salvar o progresso e monitorar logs.
- `iniciar-checklist.bat`: atalho para iniciar o app no Windows.
- `pokemon-catalogo-data.js`: catálogo nacional de Pokémon.
- `lista-falta-pokemon-data.js`: lista base usada para classificar entradas e métodos iniciais.
- `pokemon-metodos-data.js`: métodos de obtenção e evolução.
- `pokemon-biomas-data.js`: informações de biomas e horários de encontro no Pixelmon.

## Observações

O app foi pensado para uso local e pessoal. O progresso e as configurações ficam no próprio computador do usuário.

As informações de biomas e métodos podem variar conforme versão do Pixelmon e configuração do servidor, então use os detalhes como apoio prático e confirme casos especiais dentro do seu servidor.
