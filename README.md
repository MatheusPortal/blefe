# Blefe de Mesa

Jogo de cartas para navegador, feito com HTML, CSS, JavaScript e Canvas. É possível jogar offline contra Lore, a IA, ou online em salas de 2 jogadores.

## Como iniciar

### Modo offline

Abra `index.html` em um navegador moderno e escolha **Jogar offline vs. Lore**. Não é necessário instalar pacotes nem estar conectado à internet para jogar offline.

### Servidor local e modo online

O modo online precisa do servidor de sinalização. Requer Node.js 20 ou superior:

```sh
npm ci
npm start
```

Abra `http://localhost:10000` em dois navegadores ou dispositivos e escolha **Jogar online**. Informe um nickname, crie uma sala ou entre em uma sala disponível. O anfitrião inicia quando os dois jogadores estiverem na sala.

### Rank global

O botão **Rank global** exibe até 100 nomes ordenados por vitórias em partidas ranqueadas. Para participar, crie uma conta com e-mail, senha e apelido, confirme o e-mail e entre na conta. O apelido Lore é reservado. Uma sala online só conta para o ranking quando criada como **Sala ranqueada** e ambos os jogadores usam contas diferentes. Também é possível jogar uma **Partida ranqueada vs. Lore**: nessa modalidade a partida é conduzida pelo servidor e as vitórias da Lore também entram no ranking. Uma desistência ou desconexão durante uma partida ranqueada dá a vitória ao adversário. Partidas offline e salas casuais não contam.

O servidor exige um projeto Supabase com autenticação por e-mail habilitada e um PostgreSQL acessível pelo Session pooler. Configure `SUPABASE_URL`, `SUPABASE_ANON_KEY` (chave publishable ou anon) e `DATABASE_URL` nas variáveis do servidor; localmente, elas também podem ser definidas em `.data/supabase.env`, arquivo ignorado pelo Git. Nunca publique a URL do banco com a senha. Não inclua parâmetros SSL na URL: o servidor usa o certificado público `supabase-ca.crt` para verificar a conexão; se necessário, indique outro certificado com `SUPABASE_CA_FILE`. Na primeira inicialização, cria o esquema privado `blefe` e suas tabelas. Configure no Supabase Authentication a URL pública do jogo e as URLs de redirecionamento para que o e-mail de confirmação retorne ao site correto. No Render, configure as mesmas variáveis de ambiente no serviço; elas não são incluídas automaticamente na publicação.

Os resultados são determinados pelo servidor, mas contas múltiplas e partidas combinadas ainda podem manipular o ranking. O login fica ativo apenas nesta página; uma sessão expirada exige entrar novamente. Se o banco ou o Supabase estiver indisponível, o ranking informa o erro e os modos casuais continuam disponíveis.

Para validar a sintaxe dos arquivos JavaScript, execute `npm run check`.
Para testar os cards do chat e uma partida online completa, execute `node --test`.

## Regras desta versão

- Cada jogador começa com 5 vidas e 7 cartas sorteadas.
- O baralho tem 42 cartas: 5 de cada um dos 8 animais e 1 de cada carta especial. Cada jogador recebe 7, e as 28 restantes ficam disponíveis na mesa.
- No modo online, um jogador joga por turno e todos os demais adivinham simultaneamente.
- Suas cartas ficam abertas em leque na parte inferior. Passe o mouse para ampliá-las e ver os efeitos em indicadores como nos cards das regras; clique para jogar. Ao adivinhar, a mão se recolhe para o lado. As cartas da IA ficam viradas para baixo no topo.
- A carta jogada fica virada para baixo no centro até o palpite e é revelada no mesmo lugar, sobre a pilha crescente de cartas já reveladas.
- Vida, escudo e sorte dos jogadores e a rodada atual ficam acima da mesa. A barra de escudo fica cheia a partir de 5, mas o número mostra o total real, que não tem limite. O cronômetro e as habilidades ficam dentro da mesa, enquanto o monte extra e os palpites ocupam a região central, deixando as laterais livres.
- As opções de palpite formam um leque de cartas. Ao lado da mesa, o chat exibe eventos do sistema e resultados das cartas em cards; no modo offline, funciona como log sem envio de mensagens.
- O canvas usa a densidade de pixels do aparelho para manter os gráficos nítidos. A mesa se adapta a telas menores e pode ser jogada em celulares.
- Cada partida sorteia uma das três mesas: verde, azul ou vinho. No online, os dois jogadores veem a mesma mesa.
- As jogadas emitem o mesmo som, sem revelar a identidade da carta antes do palpite; o áudio pode ser desligado. Ganhos e perdas de vida, sorte e escudos são destacados junto aos indicadores dos jogadores.
- No online, a mão adversária permanece no topo, inclusive durante a seleção de cartas do Coringa. Em telas pequenas, a mesa ocupa a largura disponível e a página pode ser rolada.
- Na distribuição inicial, cada jogador pode receber no máximo 3 cartas do mesmo animal. Troca e Coringa são únicas no baralho.
- Cartas bônus são compradas apenas do monte restante das 42 cartas. Quando ele acaba, não surgem cartas novas.
- Cartas jogadas não voltam à mão.
- Leão: um palpite errado tira 2 vidas de quem adivinhou.
- Coelho: um palpite certo dá 1 ponto de sorte a quem adivinhou. Gastar sorte elimina três opções incorretas durante um palpite.
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

Quando o servidor está disponível, essas observações são compartilhadas entre os jogadores que usam esse servidor. Na partida ranqueada contra Lore, o servidor também registra observações e recompensas no mesmo modelo. O modelo anterior é preservado e atualizado para o novo formato. Ele fica em `.data/ai-learning.json` ou no arquivo definido por `AI_LEARNING_FILE`; em hospedagens efêmeras, configure armazenamento persistente para manter o aprendizado após reinícios ou implantações. Ao jogar sem servidor ou se a comunicação falhar, o aprendizado fica apenas no armazenamento local do navegador e não é sincronizado posteriormente.

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

O cabeçalho mostra a versão carregada e, quando há uma versão mais recente publicada, oferece um botão para atualizar a página. A verificação ocorre ao abrir a página, a cada cinco minutos e ao voltar à aba ou recuperar a conexão. Atualizar durante uma partida exige confirmação. Ao abrir o arquivo diretamente, o jogo mostra a versão, mas não consegue verificar atualizações.

Em cada publicação, atualize a versão com `npm version X.Y.Z --no-git-tag-version` e altere em `index.html` o valor da meta `application-version` e o parâmetro `v` dos arquivos CSS e JavaScript para a mesma versão. Isso permite detectar a atualização e carregar os arquivos da nova versão; o teste de versão verifica a consistência.

O jogo também pode ser hospedado no Netlify como site estático para jogar offline: publique a pasta do projeto, usando a raiz como diretório de publicação. Não há etapa de build. O modo online requer o serviço de sinalização descrito acima.
