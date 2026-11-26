# Blefe de Mesa

Jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. É possível jogar offline contra a IA ou online em partidas 1 contra 1.

## Como iniciar

### Modo offline

Abra `index.html` em um navegador moderno e escolha **Jogar offline vs. IA**. Não é necessário instalar pacotes nem estar conectado à internet para jogar offline.

### Servidor local e modo online

O modo online precisa do servidor de sinalização. Requer Node.js 20 ou superior:

```sh
npm ci
npm start
```

Abra `http://localhost:10000` em dois navegadores ou dispositivos e escolha **Jogar online 1 contra 1**. Informe um nickname; o primeiro jogador aguarda como anfitrião e o próximo é pareado com ele. O anfitrião executa as regras da partida, enquanto as ações e os estados do jogo seguem diretamente entre os navegadores por WebRTC.

Para validar a sintaxe dos arquivos JavaScript, execute `npm run check`.

## Regras desta versão

- Cada jogador começa com 5 vidas e 7 cartas sorteadas.
- Um baralho extra de 20 cartas fica na mesa. Uma carta é revelada no centro; os jogadores dão um palpite antes da revelação.
- Quem acertar sozinho começa. Se ambos acertarem ou errarem, os dois rolam dados; empate é lançado novamente.
- Suas cartas ficam abertas em leque na parte inferior. Passe o mouse para ver o efeito e clique para jogar; ao adivinhar, a mão se recolhe para o lado. As cartas da IA ficam viradas para baixo no topo.
- O cronômetro e as opções de palpite aparecem dentro da mesa; vida e cartas são mostradas em indicadores circulares compactos.
- As opções de palpite formam um leque de cartas. Os avisos da rodada aparecem abaixo da mesa, sem cobrir as cartas; apenas o resultado final fica sobre o tabuleiro.
- O canvas usa a densidade de pixels do aparelho para manter os gráficos nítidos. A mesa se adapta a telas menores e pode ser jogada em celulares.
- Cada carta tocada emite um som curto, com controle para ligar ou desligar o áudio. Ganhos e perdas de vida, sorte, escudos e cartas são destacados com animações junto aos indicadores dos jogadores.
- Existe 2% de chance de um único Coringa entrar na partida, substituindo uma carta inicial.
- Cartas bônus são compradas do baralho extra. Quando ele acaba, as cartas extras descartadas são embaralhadas novamente. A mão da IA fica escondida e a mesa mostra no máximo 20 cartas viradas para baixo.
- Cartas jogadas não voltam à mão.
- Leão: um palpite errado tira 2 vidas de quem adivinhou.
- Coelho: um palpite certo dá 1 ponto de sorte a quem adivinhou. Gastar sorte elimina uma opção incorreta durante um palpite.
- Vaca: um palpite errado dá 2 cartas extras a quem adivinhou.
- Peixe: acertar dá 1 ponto de sorte; errar tira 1 sorte ou 1 vida.
- Tigre: um palpite errado tira 1 vida.
- Macaco: um palpite certo dá 1 carta extra.
- Elefante: um palpite errado recupera 1 vida de quem jogou (até 5).
- Tartaruga: um palpite certo dá 1 escudo, que bloqueia o próximo evento de dano.
- Coringa: troca o palpite, causa 1 de dano e dá até 3 cartas extras a quem adivinhou.
- Cada ação do jogador tem limite de 60 segundos. Se o tempo acabar, a ação é escolhida automaticamente.
- Os avisos de resultado aparecem abaixo da mesa; após 2,4 segundos, a próxima jogada começa automaticamente. Ao fim da partida, a mesa mostra o resultado e o botão para jogar novamente.
- Vence quem ficar sem cartas na mão ou deixar a vida do adversário em zero.

## Sobre a IA

A IA do modo offline usa o histórico das cartas jogadas pelo jogador para estimar probabilidades ao adivinhar. Ao escolher a própria carta, considera os palpites e a vida do jogador, mas também introduz variação aleatória para não repetir sempre a mesma opção.

## Modo online e implantação

O servidor Node.js também serve os arquivos do jogo e oferece `GET /health` para verificações de integridade. O matchmaking escolhe aleatoriamente um jogador que esteja aguardando; o servidor encaminha apenas a sinalização WebRTC. Durante as partidas online, os nicknames identificam os dois jogadores, e o cronômetro fica visível para ambos. Para iniciar uma revanche, um jogador solicita e o outro precisa aceitar. As conexões, as mudanças de estado da rede e as ações relevantes aparecem no painel **Logs** do jogo e nos logs do servidor, sem registrar as mensagens SDP/ICE completas.

O WebRTC usa um servidor STUN público. Algumas redes restritivas podem bloquear conexões diretas; nesses casos, será necessário configurar um serviço TURN em `online.js`.

Para publicar o modo online no Render, use o Blueprint definido em `render.yaml` (serviço Docker). O Render define a variável `PORT` automaticamente. A publicação estática no Netlify continua possível para o modo offline, mas não inclui o matchmaking online sem um servidor de sinalização.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Adicionar partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

O projeto é versionado localmente com Git na branch `main` e está conectado ao repositório [MatheusPortal/blefe](https://github.com/MatheusPortal/blefe). Para publicar novas versões no GitHub, autentique o GitHub neste computador e execute `git push -u origin main`.

O jogo também pode ser hospedado no Netlify como site estático para jogar offline: publique a pasta do projeto, usando a raiz como diretório de publicação. Não há etapa de build. O modo online requer o serviço de sinalização descrito acima.
