# Blefe de Mesa

Quarta versão (v0.4) de um jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. A partida acontece localmente contra uma IA, sem servidor ou dependências de execução.

## Como iniciar

Abra `index.html` em um navegador moderno. Não é necessário instalar pacotes ou estar conectado à internet para jogar.

## Regras desta versão

- Você e a IA começam com 5 vidas e 7 cartas sorteadas.
- Um baralho extra de 20 cartas fica na mesa. Uma carta é revelada no centro; os dois jogadores dão um palpite antes da revelação.
- Quem acertar sozinho começa. Se ambos acertarem ou errarem, os dois rolam dados; empate é lançado novamente.
- Suas cartas ficam abertas em leque na parte inferior. Passe o mouse para ver o efeito e clique para jogar; as cartas da IA ficam viradas para baixo no topo.
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
- Vence quem ficar sem cartas na mão ou deixar a vida do adversário em zero.

## Sobre a IA

A IA usa o histórico das cartas jogadas pelo jogador para estimar probabilidades ao adivinhar. Ao escolher a própria carta, considera os palpites e a vida do jogador, mas também introduz variação aleatória para não repetir sempre a mesma opção.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Permitir partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

O projeto é versionado localmente com Git na branch `main` e está conectado ao repositório [MatheusPortal/blefe](https://github.com/MatheusPortal/blefe). Para publicar novas versões, autentique o GitHub neste computador e execute `git push -u origin main`.
