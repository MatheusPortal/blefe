# Blefe de Mesa

Segunda versão (v0.2) de um jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. A partida acontece localmente contra uma IA simples, sem servidor ou dependências de execução.

## Como iniciar

Abra `index.html` em um navegador moderno. Não é necessário instalar pacotes ou estar conectado à internet para jogar.

## Regras desta versão

- Você e a IA começam com 5 vidas e 7 cartas sorteadas.
- Suas cartas ficam abertas em leque na parte inferior da mesa. Clique em uma para jogá-la virada para baixo; as cartas da IA ficam viradas para baixo no topo.
- Um sorteio animado decide quem começa. Em cada turno, o adversário tenta adivinhar a carta jogada.
- Existe 2% de chance de um único Coringa entrar na partida, substituindo uma carta inicial.
- Cartas bônus entram na mão de quem as recebe; a mão da IA fica escondida. A mesa mostra no máximo 20 cartas da mão da IA.
- Cartas jogadas não voltam à mão.
- Leão: um palpite errado tira 2 vidas de quem adivinhou.
- Coelho: um palpite certo dá 1 ponto de sorte a quem adivinhou. Gastar sorte elimina uma opção incorreta durante um palpite.
- Vaca: um palpite errado dá 2 cartas bônus aleatórias a quem adivinhou.
- Peixe: não tem efeito especial.
- Coringa: troca o palpite por outra carta comum aleatória, tira 1 vida e dá 3 cartas bônus a quem adivinhou.
- Cada ação do jogador tem limite de 60 segundos. Se o tempo acabar, a ação é escolhida automaticamente.
- Vence quem ficar sem cartas na mão ou deixar a vida do adversário em zero.

## Sobre a IA

A IA usa o histórico das cartas jogadas pelo jogador para estimar probabilidades ao adivinhar. Ao escolher a própria carta, considera os palpites e a vida do jogador, mas também introduz variação aleatória para não repetir sempre a mesma opção. É uma estratégia inicial, não um motor avançado de aprendizado.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Permitir partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

O projeto é versionado localmente com Git na branch `main` e está conectado ao repositório [MatheusPortal/blefe](https://github.com/MatheusPortal/blefe). Para publicar novas versões, autentique o GitHub neste computador e execute `git push -u origin main`.
