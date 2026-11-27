# Blefe de Mesa

Jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. É possível jogar offline contra a IA ou online em salas de 2 a 4 jogadores.

## Como iniciar

### Modo offline

Abra `index.html` em um navegador moderno e escolha **Jogar offline vs. IA**. Não é necessário instalar pacotes nem estar conectado à internet para jogar offline.

### Servidor local e modo online

O modo online precisa do servidor de sinalização. Requer Node.js 20 ou superior:

```sh
npm ci
npm start
```

Abra `http://localhost:10000` em dois a quatro navegadores ou dispositivos e escolha **Jogar online**. Informe um nickname, crie uma sala ou entre em uma sala disponível. O anfitrião inicia quando houver pelo menos dois jogadores.

Para validar a sintaxe dos arquivos JavaScript, execute `npm run check`.

## Regras desta versão

- Cada jogador começa com 5 vidas e 7 cartas sorteadas.
- O baralho tem 42 cartas: 5 de cada um dos 8 animais e 1 de cada carta especial. Cada jogador recebe 7, e as 28 restantes ficam disponíveis na mesa.
- No modo online, um jogador joga por turno e todos os demais adivinham simultaneamente.
- Suas cartas ficam abertas em leque na parte inferior. Passe o mouse para ver o efeito e clique para jogar; ao adivinhar, a mão se recolhe para o lado. As cartas da IA ficam viradas para baixo no topo.
- O cronômetro e as opções de palpite aparecem dentro da mesa; vida e cartas são mostradas em indicadores circulares compactos.
- As opções de palpite formam um leque de cartas. O log da partida fica dentro do tabuleiro e, no modo offline, funciona sem envio de mensagens.
- O canvas usa a densidade de pixels do aparelho para manter os gráficos nítidos. A mesa se adapta a telas menores e pode ser jogada em celulares.
- Cada carta tocada emite um som curto, com controle para ligar ou desligar o áudio. Ganhos e perdas de vida, sorte, escudos e cartas são destacados com animações junto aos indicadores dos jogadores.
- Na distribuição inicial, cada jogador pode receber no máximo 3 cartas do mesmo animal. Troca e Coringa são únicas no baralho.
- Cartas bônus são compradas apenas do monte restante das 42 cartas. Quando ele acaba, não surgem cartas novas.
- Cartas jogadas não voltam à mão.
- Leão: um palpite errado tira 2 vidas de quem adivinhou.
- Coelho: um palpite certo dá 1 ponto de sorte a quem adivinhou. Gastar sorte elimina duas opções incorretas durante um palpite.
- Vaca: um palpite errado dá 2 cartas extras a quem adivinhou.
- Peixe: ao errar, o adversário compra 2 cartas e perde até 3 escudos; quem jogou ganha 1 sorte e 1 vida.
- Tigre: um palpite errado tira 1 vida.
- Macaco: um palpite errado causa 3 de dano, dá 1 carta ao adversário e 2 escudos a quem jogou.
- Elefante: um palpite errado tira 1 vida e até 2 escudos do adversário.
- Tartaruga: um palpite certo dá 1 escudo, que bloqueia o próximo evento de dano.
- Coringa: em erro, quem jogou ganha 1 vida e 1 escudo, revela 2 cartas da mão adversária e escolhe 1 delas para transferir para si.
- Cada ação online tem limite de 40 segundos. Se o tempo acabar, a ação é escolhida automaticamente.
- Os avisos de resultado aparecem abaixo da mesa; após 2,4 segundos, a próxima jogada começa automaticamente. Ao fim da partida, a mesa mostra o resultado e o botão para jogar novamente.
- Vence quem ficar sem cartas na mão ou deixar a vida do adversário em zero.

## Sobre a IA

A IA do modo offline combina os padrões da partida atual com estatísticas agregadas das jogadas e palpites recebidos pelo servidor. Conforme essas observações aumentam, ela reduz a escolha aleatória e passa a priorizar combinações mais informadas. O modelo fica em `.data/ai-learning.json` e também pode usar o arquivo definido por `AI_LEARNING_FILE`; em hospedagens efêmeras, configure armazenamento persistente para manter o aprendizado após reinícios ou implantações.

## Modo online e implantação

O servidor Node.js também oferece `GET /health`, salas públicas de 2 a 4 jogadores e um jogo autoritativo por WebSocket. Cada cliente recebe apenas a própria mão; os demais veem somente a contagem de cartas. Jogadores são eliminados ao chegar a zero vida ou zero cartas, e o último restante vence.

Para publicar o modo online no Render, use o Blueprint definido em `render.yaml` (serviço Docker). O Render define a variável `PORT` automaticamente. A publicação estática no Netlify continua possível para o modo offline, mas não inclui o matchmaking online sem um servidor de sinalização.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Adicionar partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

O projeto é versionado localmente com Git na branch `main` e está conectado ao repositório [MatheusPortal/blefe](https://github.com/MatheusPortal/blefe). Para publicar novas versões no GitHub, autentique o GitHub neste computador e execute `git push -u origin main`.

O jogo também pode ser hospedado no Netlify como site estático para jogar offline: publique a pasta do projeto, usando a raiz como diretório de publicação. Não há etapa de build. O modo online requer o serviço de sinalização descrito acima.
