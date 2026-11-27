# Blefe de Mesa

Jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. É possível jogar offline contra a IA ou online em salas de 2 jogadores.

## Como iniciar

### Modo offline

Abra `index.html` em um navegador moderno e escolha **Jogar offline vs. IA**. Não é necessário instalar pacotes nem estar conectado à internet para jogar offline.

### Servidor local e modo online

O modo online precisa do servidor de sinalização. Requer Node.js 20 ou superior:

```sh
npm ci
npm start
```

Abra `http://localhost:10000` em dois navegadores ou dispositivos e escolha **Jogar online**. Informe um nickname, crie uma sala ou entre em uma sala disponível. O anfitrião inicia quando os dois jogadores estiverem na sala.

Para validar a sintaxe dos arquivos JavaScript, execute `npm run check`.
Para testar os cards do chat e uma partida online completa, execute `node --test`.

## Regras desta versão

- Cada jogador começa com 5 vidas e 7 cartas sorteadas.
- O baralho tem 42 cartas: 5 de cada um dos 8 animais e 1 de cada carta especial. Cada jogador recebe 7, e as 28 restantes ficam disponíveis na mesa.
- No modo online, um jogador joga por turno e todos os demais adivinham simultaneamente.
- Suas cartas ficam abertas em leque na parte inferior. Passe o mouse para ampliá-las e ver os efeitos em indicadores como nos cards das regras; clique para jogar. Ao adivinhar, a mão se recolhe para o lado. As cartas da IA ficam viradas para baixo no topo.
- A carta jogada fica virada para baixo no centro até o palpite e é revelada no mesmo lugar, sobre a pilha crescente de cartas já reveladas.
- O cronômetro e as opções de palpite aparecem dentro da mesa; vida e cartas são mostradas em indicadores circulares compactos.
- As opções de palpite formam um leque de cartas. O chat exibe eventos do sistema e resultados das cartas em cards; no modo offline, funciona como log sem envio de mensagens.
- O canvas usa a densidade de pixels do aparelho para manter os gráficos nítidos. A mesa se adapta a telas menores e pode ser jogada em celulares.
- Cada partida sorteia uma das três mesas: verde, azul ou vinho. No online, os dois jogadores veem a mesma mesa.
- As jogadas emitem o mesmo som, sem revelar a identidade da carta antes do palpite; o áudio pode ser desligado. Ganhos e perdas de vida, sorte, escudos e cartas são destacados com animações junto aos indicadores dos jogadores.
- No online, a mão adversária permanece no topo, inclusive durante a seleção de cartas do Coringa. Em telas pequenas, a mesa ocupa a largura disponível e a página pode ser rolada.
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
- Coringa: em erro, quem jogou ganha 1 vida e 1 escudo. Clique em até 2 cartas no leque adversário para revelá-las, escolha 1 delas e depois uma carta própria para trocá-las. Se o adversário tiver somente 1 carta, revele essa carta. Se o Coringa for sua última carta, você vence antes da troca.
- Cada ação online tem limite de 40 segundos. Se o tempo acabar, a ação é escolhida automaticamente.
- Os avisos de resultado aparecem abaixo da mesa; após 2,4 segundos, a próxima jogada começa automaticamente. Ao fim da partida, a mesa mostra o resultado e o botão para jogar novamente.
- Vence quem ficar sem cartas na mão ou deixar a vida do adversário em zero.

## Sobre a IA

A IA do modo offline avalia os efeitos previstos das cartas, considerando vidas, escudos, sorte, tamanho das mãos, cartas restantes e condições de vitória. Ao adivinhar, considera as cartas conhecidas e usa as opções realmente eliminadas pela sorte. Ela também combina padrões da partida atual com estatísticas agregadas das partidas contra jogadores e uma recompensa calculada pelas mudanças de recursos e pela vitória ou derrota. A exploração continua para que a IA possa descobrir estratégias melhores; o aprendizado não garante uma vitória nem melhora em todas as partidas.

Quando o servidor está disponível, essas observações são compartilhadas entre os jogadores que usam esse servidor. O modelo anterior é preservado e atualizado para o novo formato. Ele fica em `.data/ai-learning.json` ou no arquivo definido por `AI_LEARNING_FILE`; em hospedagens efêmeras, configure armazenamento persistente para manter o aprendizado após reinícios ou implantações. Ao jogar sem servidor ou se a comunicação falhar, o aprendizado fica apenas no armazenamento local do navegador e não é sincronizado posteriormente.

## Modo online e implantação

O servidor Node.js também oferece `GET /health`, salas públicas de 2 jogadores e um jogo autoritativo por WebSocket. Cada cliente recebe apenas a própria mão; o adversário vê somente a contagem de cartas.

Para publicar o modo online no Render, use o Blueprint definido em `render.yaml` (serviço Docker). O Render define a variável `PORT` automaticamente. A publicação estática no Netlify continua possível para o modo offline, mas não inclui o matchmaking online sem um servidor de sinalização.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Adicionar partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

O projeto é versionado localmente com Git na branch `main` e está conectado ao repositório [MatheusPortal/blefe](https://github.com/MatheusPortal/blefe). Para publicar novas versões no GitHub, autentique o GitHub neste computador e execute `git push -u origin main`.

O jogo também pode ser hospedado no Netlify como site estático para jogar offline: publique a pasta do projeto, usando a raiz como diretório de publicação. Não há etapa de build. O modo online requer o serviço de sinalização descrito acima.
