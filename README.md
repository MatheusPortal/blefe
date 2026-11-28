# Blefe de Mesa

Jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. É possível jogar offline contra Lore, a IA, ou online em salas de 2 jogadores.

## Como iniciar

### Modo offline

Abra `index.html` em um navegador moderno, escolha um avatar e informe um nickname para continuar como visitante. Depois escolha **Offline**. Sem conta, é possível jogar sem instalar pacotes ou conectar à internet, mas a partida não conta para o ranking.

### Servidor local e modo online

O modo online precisa do servidor de sinalização. Requer Node.js 20 ou superior:

```sh
npm ci
npm start
```

Abra `http://localhost:10000` em dois navegadores ou dispositivos. Na entrada, escolha um avatar e continue com nickname de visitante ou entre na sua conta. Em **Online**, a página mostra as salas disponíveis, com botões para atualizar e criar sala. O servidor mantém três mesas competitivas disponíveis; elas exigem contas de ambos os jogadores. A partida começa automaticamente cinco segundos após a entrada do segundo jogador; se alguém sair, a contagem é cancelada. A lista informa a quantidade de conexões ativas. Se alguém sair ou se desconectar durante a partida, o chat informa o abandono e o vencedor.

Os 50 avatares ilustrados combinam dez personagens com cinco estilos. A escolha de visitantes vale enquanto a página estiver aberta; a escolha de contas é salva no perfil e aparece para os demais jogadores na espera e na partida.

As salas são hospedadas no mesmo servidor: o ping mostrado é o tempo de ida e volta entre o navegador e esse servidor, não entre jogadores. Configure `BLEFE_SERVER_REGION=us-ohio` para identificar a região Ohio, EUA, como no serviço Render incluído. Sem uma região reconhecida, a lista informa que ela está indisponível. O servidor local não representa a latência da implantação.

### Rank global

O botão **Rank global** exibe até 100 nomes ordenados por vitórias. Para participar, crie uma conta com e-mail, senha e apelido. Ao abrir o link de confirmação enviado por e-mail, você entra automaticamente no navegador em que o link foi aberto; também pode entrar com nickname ou e-mail e senha. O apelido Lore é reservado. Um cadastro ainda não utilizado reserva o nickname por sete dias; depois, entre com o e-mail para concluir o perfil. Contas criadas antes desta versão precisam entrar uma vez com o e-mail para habilitar o login por nickname. As mesas competitivas contam para o ranking quando ambos os jogadores usam contas diferentes. Ao escolher **Offline** com uma conta conectada, a partida contra Lore é conduzida pelo servidor e as vitórias de ambos contam. Se o servidor estiver indisponível, é possível escolher jogar sem pontuação. Uma desistência ou desconexão durante uma partida com ranking dá a vitória ao adversário. Partidas de convidados e salas casuais não contam.

O servidor exige um projeto Supabase com autenticação por e-mail habilitada e um PostgreSQL acessível pelo Session pooler. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chave publishable ou anon) e `DATABASE_URL` nas variáveis do servidor; localmente, elas também podem ser definidas em `.data/supabase.env`, arquivo ignorado pelo Git. Nunca publique a URL do banco com a senha. Não inclua parâmetros SSL na URL: o servidor usa o certificado público `supabase-ca.crt` para verificar a conexão; se necessário, indique outro certificado com `SUPABASE_CA_FILE`. Na inicialização, cria ou atualiza o esquema privado `blefe`, incluindo avatar e o e-mail necessário para o login por nickname. O servidor encaminha a autenticação ao Supabase sem armazenar senhas. Configure no Supabase Authentication a URL pública do jogo e as URLs de redirecionamento para que o e-mail de confirmação retorne ao site correto. No Render, configure as mesmas variáveis de ambiente no serviço; elas não são incluídas automaticamente na publicação.

Os resultados são determinados pelo servidor, mas contas múltiplas e partidas combinadas ainda podem manipular o ranking. O login fica ativo apenas nesta página; uma sessão expirada exige entrar novamente. Se o banco ou o Supabase estiver indisponível, o ranking informa o erro e os modos casuais continuam disponíveis.

Para validar a sintaxe dos arquivos JavaScript, execute `npm run check`.
Para testar os cards do chat e uma partida online completa, execute `node --test`.

## Regras desta versão

- Cada jogador começa com 5 vidas e 7 cartas sorteadas.
- O baralho tem 42 cartas: 5 de cada um dos 8 animais e 1 de cada carta especial. Cada jogador recebe 7, e as 28 restantes ficam disponíveis na mesa.
- No modo online, um jogador joga por turno e todos os demais adivinham simultaneamente.
- Suas cartas ficam abertas em leque na parte inferior. Passe o mouse para ampliá-las e ver os efeitos em indicadores como nos cards das regras; clique para jogar. Ao adivinhar, a mão se recolhe para o lado. As cartas da IA ficam viradas para baixo no topo.
- A carta jogada fica virada para baixo no centro até o palpite e é revelada no mesmo lugar, sobre a pilha crescente de cartas já reveladas.
- Vida (vermelho), escudo (azul) e sorte (amarelo) ficam em uma roda segmentada ao redor do avatar de cada jogador; cada atributo tem limite de 5. O cronômetro e a rodada ficam em lados opostos da mesa, e o ícone de sorte aparece próximo à mão durante o palpite.
- As cartas da mão e as escolhas do Coringa podem ser identificadas e acionadas por teclado ou leitor de tela.
- As opções de palpite formam um leque de cartas. Ao lado da mesa, o chat exibe eventos do sistema, da conexão e resultados das cartas em cards; no modo offline, funciona como log sem envio de mensagens.
- O canvas usa a densidade de pixels do aparelho para manter os gráficos nítidos. A mesa se adapta a telas menores e pode ser jogada em celulares.
- Cada partida sorteia uma das três mesas: verde, azul ou vinho. No online, os dois jogadores veem a mesma mesa.
- As jogadas emitem o mesmo som, sem revelar a identidade da carta antes do palpite; o áudio pode ser desligado. Ganhos e perdas de vida, sorte e escudos são destacados junto aos indicadores dos jogadores.
- No online, a mão adversária permanece no topo, inclusive durante a seleção de cartas do Coringa. Em telas pequenas, a mesa se ajusta à altura disponível; a página pode ser rolada quando necessário.
- Na distribuição inicial, cada jogador pode receber no máximo 3 cartas do mesmo animal. Troca e Coringa são únicas no baralho.
- Cartas bônus são compradas apenas do monte restante das 42 cartas. Quando ele acaba, não surgem cartas novas.
- Cartas jogadas não voltam à mão.
- Leão: um palpite errado causa 2 de dano a quem adivinhou.
- Coelho: um palpite certo dá 1 ponto de sorte a quem adivinhou. Gastar sorte elimina três opções incorretas durante um palpite.
- Vaca: um palpite errado dá 2 cartas extras a quem adivinhou.
- Peixe: ao errar, o adversário compra 2 cartas e perde até 3 escudos; quem jogou ganha 1 sorte e 1 vida.
- Tigre: um palpite errado causa 1 de dano.
- Macaco: um palpite errado causa 3 de dano, dá 1 carta ao adversário e 2 escudos a quem jogou.
- Elefante: um palpite errado tira 1 vida e até 2 escudos do adversário.
- Tartaruga: um palpite certo recupera 1 vida ou, com vida cheia, dá 1 escudo.
- Troca: em erro, as mãos são trocadas automaticamente na rodada. Se for a última carta de quem jogou, a vitória acontece antes da troca. Em acerto, não há troca.
- Coringa: em erro, quem jogou ganha 1 vida e 1 escudo. Clique em até 2 cartas no leque adversário para revelá-las, escolha 1 delas e depois uma carta própria para trocá-las. Se o adversário tiver somente 1 carta, revele essa carta. Se o Coringa for sua última carta, você vence antes da troca.
- Cada ação online tem limite de 40 segundos. Se o tempo acabar, a ação é escolhida automaticamente.
- Os avisos de resultado aparecem abaixo da mesa; após 2,4 segundos, a próxima jogada começa automaticamente. Ao fim da partida, a mesa mostra o resultado e o botão para jogar novamente.
- Vence quem ficar sem cartas na mão ou deixar a vida do adversário em zero.

## Sobre a IA

A IA do modo offline avalia os efeitos previstos das cartas, considerando vidas, escudos, sorte, tamanho das mãos, cartas restantes e condições de vitória. Ao adivinhar, considera as cartas conhecidas e usa as opções realmente eliminadas pela sorte. Ela também combina padrões da partida atual com estatísticas agregadas das partidas contra jogadores e uma recompensa calculada pelas mudanças de recursos e pela vitória ou derrota. A exploração continua para que a IA possa descobrir estratégias melhores; o aprendizado não garante uma vitória nem melhora em todas as partidas.

Quando o servidor está disponível, essas observações são compartilhadas entre os jogadores que usam esse servidor. Na partida ranqueada contra Lore, o servidor também registra observações e recompensas no mesmo modelo. O modelo anterior é preservado e atualizado para o novo formato. Ele fica em `.data/ai-learning.json` ou no arquivo definido por `AI_LEARNING_FILE`; em hospedagens efêmeras, configure armazenamento persistente para manter o aprendizado após reinícios ou implantações. Ao jogar sem servidor ou se a comunicação falhar, o aprendizado fica apenas no armazenamento local do navegador e não é sincronizado posteriormente.

## Modo online e implantação

O servidor Node.js também oferece `GET /health`, mesas competitivas e salas casuais de 2 jogadores e um jogo autoritativo por WebSocket. Cada cliente recebe apenas a própria mão; o adversário vê somente a contagem de cartas.

Para publicar o modo online no Render, use o Blueprint definido em `render.yaml` (serviço Docker). O Render define a variável `PORT` automaticamente. A publicação estática no Netlify continua possível para o modo offline, mas não inclui o matchmaking online sem um servidor de sinalização.

## Ideias para próximas versões

- Mostrar um histórico de jogadas e estatísticas entre partidas.
- Adicionar níveis de dificuldade e uma IA que se adapte ao estilo do jogador.
- Adicionar partidas locais para dois jogadores e opções de acessibilidade.
- Equilibrar os efeitos e permitir configurar as regras antes de iniciar.

## Versionamento e publicação

O projeto é versionado localmente com Git na branch `main` e está conectado ao repositório [MatheusPortal/blefe](https://github.com/MatheusPortal/blefe). Para publicar novas versões no GitHub, autentique o GitHub neste computador e execute `git push -u origin main`.

O cabeçalho mostra a versão carregada e, quando há uma versão mais recente publicada, oferece um botão para atualizar a página. A verificação ocorre ao abrir a página, a cada cinco minutos e ao voltar à aba ou recuperar a conexão. Atualizar durante uma partida exige confirmação. Ao abrir o arquivo diretamente, o jogo mostra a versão, mas não consegue verificar atualizações.

Em cada publicação, atualize a versão com `npm version X.Y.Z --no-git-tag-version` e altere em `index.html` o valor da meta `application-version` e o parâmetro `v` dos arquivos CSS e JavaScript para a mesma versão. Isso permite detectar a atualização e carregar os arquivos da nova versão; o teste de versão verifica a consistência.

O jogo também pode ser hospedado no Netlify como site estático para jogar offline: publique a pasta do projeto, usando a raiz como diretório de publicação. Não há etapa de build. O modo online requer o serviço de sinalização descrito acima.
