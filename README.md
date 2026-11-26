# Blefe de Mesa

Primeira versão de um jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. A partida acontece localmente contra uma IA simples, sem servidor ou dependências de execução.

## Como iniciar

Abra `index.html` em um navegador moderno. Não é necessário instalar pacotes ou estar conectado à internet para jogar.

## Regras desta versão

- Você e a IA começam com 5 vidas.
- Na sua vez, escolha uma carta da mão. Ela fica virada para baixo e a IA tenta adivinhar.
- Depois, a IA joga uma carta e você tenta adivinhar.
- Cada jogador recebe 2 ou 3 cartas de cada tipo comum no início. Existe 2% de chance de haver um único Coringa na partida.
- Quando a mão acaba, as cartas descartadas daquele jogador são embaralhadas e voltam para a mão.
- Leão: um palpite errado tira 2 vidas de quem adivinhou.
- Coelho: um palpite certo dá 1 ponto de sorte a quem adivinhou. Gastar sorte elimina uma opção incorreta durante um palpite.
- Vaca: um palpite errado dá 2 cartas bônus aleatórias a quem adivinhou.
- Peixe: não tem efeito especial.
- Coringa: troca o palpite por outra carta comum aleatória, tira 1 vida e dá 3 cartas bônus a quem adivinhou.
- Cada ação do jogador tem limite de 60 segundos. Se o tempo acabar, a ação é escolhida automaticamente.
- Vence quem deixar a vida do adversário em zero.

## Sobre a IA

A IA usa o histórico das cartas jogadas pelo jogador para estimar probabilidades ao adivinhar. Ao escolher a própria carta, também considera os palpites anteriores do jogador. É uma estratégia inicial e determinística o bastante para ser compreensível; ainda não é um motor avançado de aprendizado.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Permitir partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

Este diretório pode ser inicializado com Git e conectado a um repositório remoto GitHub para publicar novas versões. O endereço do repositório remoto ainda precisa ser informado.
