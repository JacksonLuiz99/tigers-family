# TIGERS FAMILY · Família TIGERS OF WAR

Monitor do clã **#R0UPVVVY**, com painel público para Vercel, coleta agendada no Cloudflare Workers, histórico no D1 e aviso no Discord.

Painel: https://tigers-family-tow.vercel.app

Código: https://github.com/JacksonLuiz99/tigers-family

Monitor: https://clan-monitor.clan-monitor.workers.dev

O código está conectado ao projeto Vercel `tigers-family`. A variável de produção `PUBLIC_API_BASE` aponta para o monitor. As alterações no Worker continuam exigindo `npm run deploy:worker`; mudanças no GitHub publicam o painel pela integração da Vercel.

## O que já está implementado

- Membros, cargos, CVs, troféus, doações e recebimentos atuais.
- Busca e ordenação de membros; diferença do contador de doações em aproximadamente 24h.
- Guerra comum e rodadas da Liga, inclusive quando o clã está no lado oponente.
- Lista de ataques pendentes, placar e histórico das guerras observadas.
- Eventos de entradas/saídas, início e término de guerra.
- Lembretes de ataques nas janelas de 6h e 1h antes do término.
- Fila persistente com tentativas separadas por canal; lembretes vencidos não são enviados.
- Estado de conexão e data da coleta visíveis; dados antigos permanecem identificados em falhas.
- Painel de configuração sem dados fictícios quando a API não está conectada.

## Identidade Tigers e dados ampliados

O painel usa a identidade TIGERS OF WAR 4, emblema vetorial próprio, preto/laranja/dourado e fonte Barlow Condensed hospedada no projeto (licença OFL em `public/fonts/OFL.txt`). Inclui assinatura de Jackson Luiz com link para seu portfólio.

- Guerra em destaque: placar, contagem regressiva, destruição, ataques utilizados/pendentes e detalhes por participante.
- Pódio da linha de frente: ouro ao centro e elevado no desktop, prata à esquerda e bronze à direita; ordem de leitura ouro/prata/bronze e apresentação vertical no celular. Os três destaques exibem estatísticas reais da guerra selecionada. Empates nos indicadores são identificados, inclusive com jogadores fora dos três exibidos, e seguem o desempate alfabético do ranking. Vagas sem ataques não são preenchidas.
- Pódio do mês: o botão **Mês** ao lado de **Guerra atual** mostra os três melhores do clã selecionado no mês calendário de Brasília. Mesmo critério do pódio da guerra (estrelas, triplos, destruição média, ataques usados e nome), só guerras encerradas e só quem usou pelo menos 50% dos ataques do mês. Se o painel tiver guardado só as 20 guerras mais recentes e elas começarem no mês, aparece um aviso de pódio possivelmente incompleto.
- Elite: estrelas dos ataques, triplos, média de estrelas, destruição média e participação. O ranking histórico considera somente guerras encerradas com detalhes salvos. Resumos antigos não inventam desempenho individual. O total de estrelas dos ataques pode ultrapassar o placar do clã por ataques repetidos à mesma base.
- Histórico: reúne registros detalhados do monitor e resumos da API, sem duplicar confrontos. Os registros se identificam pela origem e podem ser filtrados por resultado.
- Capital: liga, nível, distritos e último fim de semana de ataques, quando a API disponibilizar.
- Tropa: descrição e requisitos do clã, doações, busca, ordenação e acesso ao perfil no jogo.
- Interface móvel: cartões para tabelas, navegação horizontal restrita à barra de seções e respeito à preferência de movimento reduzido.

Os endpoints `warlog` e `capitalraidseasons` são consultados no máximo uma vez por hora. Falhas são indicadas na respectiva seção, preservando a última resposta válida; não interrompem o acompanhamento principal nem notificações. Nas primeiras verificações, ambos retornaram HTTP 500 temporariamente; a coleta de produção voltou a responder e importou 30 registros de guerras e temporadas recentes da Capital. Novas falhas preservam os dados coletados e são tentadas novamente após o intervalo de cache.

O Instagram da família, https://www.instagram.com/tigers_of_war/, está disponível no cabeçalho, na central e na chamada de comunidade.

O link público de aviso é a variável do Worker `DISCORD_PUBLIC_URL`. A API valida os domínios e nunca reutiliza a URL secreta do webhook como convite. Atualmente os avisos são enviados ao canal do Discord configurado pelo administrador.

## Preferências de leitura e imagem do clã

O cabeçalho oferece temas Escuro (padrão), Claro e Confortável (sépia), além de controles de fonte entre 90% e 140% e restauração para 100%. A escolha é guardada somente no navegador (`localStorage`, chave `tigers-display`) e aplicada antes da primeira renderização. Os controles continuam funcionando se o armazenamento estiver indisponível. Valores persistidos inválidos retornam ao padrão. Atualizações entre abas sincronizam as preferências.

A tipografia usa unidades relativas para que o controle afete todas as seções. A arte enviada pelo usuário está preservada sem alterações em `public/images/tigers-of-war.png`, com enquadramento por CSS no cabeçalho e exibição integral no destaque principal. O antigo emblema vetorial permanece como fallback para dados sem brasão e ícone da aplicação.

## Família TIGERS: seleção de clã

O seletor oferece os 16 clãs confirmados na API, na ordem informada pela família. Os nomes curtos organizam a seleção; o painel mostra o nome oficial do jogo.

| Nome no seletor | Nome no jogo | Tag |
| --- | --- | --- |
| iTOW | iTOW Gaming | #2Y0P809CU |
| Tigers Champion | TIGERS CHAMPION | #2YJLQRLYL |
| TOW 1 | TIGERS OF WAR | #28L88PQ2 |
| TOW 2 | TIGERS OF WAR 2 | #992PPYP9 |
| TOW 3 | TIGERS OF WAR 3 | #QC9RY8GJ |
| TOW 4 | TIGERS OF WAR 4 | #R0UPVVVY |
| TOW 5 | TIGERS OF WAR 5 | #202YP22U9 |
| TOW 6 | TIGERS OF WAR 6 | #222RQ2C22 |
| TOW 8 | TIGERS OF WAR 8 | #28R20CPP8 |
| TOW 9 | TIGERS OF WAR 9 | #2P0Y8JRUL |
| TOW Academy | TOW ACADEMY | #2QLGRU29U |
| TOW Formation | TOW FORMATION | #2GY9JPQY2 |
| TOW Team | TOW TEAM tm | #29P0V8VCG |
| TOW Sport | TOW-eSports | #2PG9PV22C |
| TOW Evo | TOW-eVolution™ | #2LUJ0V08L |
| Trairi CE | TRAIRI-CE | #92RJJJ0Y |

A última escolha fica na chave `tigers-last-clan` do localStorage, independentemente do tema e da fonte. Uma preferência inválida retorna ao TIGERS OF WAR 4. A troca cancela a consulta anterior, limpa os dados exibidos e verifica a tag da resposta antes de atualizar a tela. O botão para abrir o clã no jogo também acompanha a seleção.

`GET /api/dashboard?clan=%23TAG` aceita somente as tags do catálogo em `public/clans.js`. Sem parâmetro, mantém a compatibilidade com o clã original. Os novos clãs usam cache isolado em `state`, sob `family:<tag>`, e uma trava própria. Perfil, guerra e histórico são atualizados automaticamente e também ao consultar o painel, com cache de cinco minutos e cache complementar de uma hora. Até 20 guerras detalhadas e 26 amostras horárias são retidas por clã consultado. Os dados e a fila de avisos do clã original permanecem isolados.

**Coleta automática:** o cron `*/5 * * * *` mantém o TOW 4 a cada cinco minutos. Um segundo cron `* * * * *` coleta um dos outros 15 clãs por minuto, escolhido pelo minuto UTC módulo 15. Cada clã completa um ciclo em aproximadamente 15 minutos mesmo sem visitantes. As execuções são separadas para respeitar limites por invocação do plano gratuito. Apenas TOW 4 envia avisos; canais dos demais ficam para outra etapa.

### Inteligência da família

- `GET /api/family` lê 16 resumos leves de `summary:<tag>` sem consultar a API do jogo. Totais incluem apenas coletas dos últimos 30 minutos; guerras exigem atualização própria recente. Exibe membros, vagas, ligas, placares e ataques pendentes, com botão para observar cada clã.
- A aba Inteligência filtra guerras encerradas em 7/14/30 dias, CV do atacante e relação com o CV do alvo. O CV é avaliado por confronto, inclusive se o jogador evoluiu entre guerras. Alvos desconhecidos são excluídos de comparações por CV. Médias mostram o tamanho da amostra.
- A comparação semanal usa duas janelas consecutivas de sete dias. Não calcula evolução sem amostra anterior.
- A série diária mantém a última captura por dia UTC por até 31 dias, com membros, troféus, Capital e contador de doações da temporada. Ela começa nesta versão, sem inventar dados retroativos. Os novos clãs guardam a série no próprio estado e o principal em `timeline`.
- A central CWL mostra rodadas, temporada, escalações e resultados efetivamente observados. A consulta continua limitada às três últimas rodadas disponíveis; não afirma cobertura completa da temporada.
- O botão Ver desempenho na tropa e os nomes dos relatórios abrem o perfil local do guerreiro, com ataques detalhados encerrados e participação na Capital. O perfil usa dados coletados no clã selecionado, não a carreira completa ou atividade online.
- Capital permite alternar os últimos três fins de semana e mostra ataques, limite, bônus e saque. Membros atuais sem registro são sinalizados sem atribuir zero ataques, pois podem ter entrado depois.

Na validação inicial, TIGERS OF WAR e TOW-eSports retornaram acesso negado aos dados de guerra. Seus perfis continuam disponíveis, e o painel identifica a guerra como indisponível em vez de inferir que não há confronto.

## Downloads do clã selecionado

O botão **Baixar dados** abre a central de exportação. Ele usa somente os dados carregados do clã em observação, sem novas chamadas à API e sem custo adicional de serviço.

- **Excel (.xlsx):** planilha OOXML real com sete abas (Resumo, Membros, Guerras, Ranking atual, Ranking histórico, Ataques e Capital), filtros, cabeçalho fixo e células numéricas. Também permite baixar um relatório específico junto da aba Resumo.
- **CSV:** um relatório por arquivo, com UTF-8/BOM, delimitador ponto e vírgula e decimais com vírgula, adequado ao Excel/LibreOffice em português.
- **JSON:** metadados do clã e da coleta, observações de cobertura e relatórios estruturados por coluna.

O relatório de ataques contém a ofensiva do clã nos confrontos detalhados disponíveis. A Capital exporta a participação dos membros nos fins de semana retidos. Rankings históricos excluem guerras sem dados individuais; resumos da API e guerras observadas são unificados sem duplicação. Os arquivos não prometem histórico ilimitado nem recuperação de dados restringidos pela API. Horários exportados são UTC e o nome do arquivo inclui tag e data.

A exportação congela a coleta quando o diálogo é aberto. Uma troca de clã fecha o diálogo, evitando baixar dados de uma seleção anterior. Segredos e configurações dos canais não são incluídos. Nomes são texto em XLSX; o CSV neutraliza prefixos de fórmulas de planilhas. A interface foi conferida em telas móveis e com fonte ampliada. A planilha completa foi aberta e salva com sucesso pelo LibreOffice.

## Arquitetura e custo

```text
GitHub ──build──> Vercel (painel estático público)
                         │ GET /api/dashboard
                         ▼
                  Cloudflare Worker ──> D1
                    │ cron 5 minutos
                    ├─> RoyaleAPI proxy ──> API oficial Clash
                    └─> Discord webhook
```

Usa as cotas gratuitas dos provedores, sem contratar plano pago. O cron principal executa 288 vezes por dia e o da família 1.440 vezes por dia; este último distribui as execuções entre os outros 15 clãs. O histórico usa uma captura do clã por hora (retenção de 30 dias), eventos por 90 dias e guerras por 180 dias. O painel mostra as últimas 20 guerras e 30 ocorrências. Cotas e termos dos serviços podem mudar. O plano gratuito do Worker tem orçamento de CPU reduzido; acompanhe métricas após conectar os dados reais.

O proxy é um serviço de terceiros, sem garantia de disponibilidade: ele recebe a chave dedicada da API Clash em cada consulta. Não recebe o token do Discord. Use uma chave exclusiva para este projeto. É possível migrar o acesso para API direta alterando CLASH_API_BASE e usando infraestrutura com IP autorizado.

## 1. Conectar o Clash antes de publicar

Pré-requisito: Node 22.13+ (Node 24 recomendado).

```sh
npm ci
cp .dev.vars.example .dev.vars
```

No [portal oficial](https://developer.clashofclans.com/), crie uma chave para este projeto e autorize **45.79.218.79**, IP publicado pelo [proxy RoyaleAPI](https://docs.royaleapi.com/proxy). Confirme o IP nessa documentação se houver falha.

Abra `.dev.vars` no editor e preencha somente `CLASH_API_TOKEN`. Não cole credenciais em commits, issues ou chat. Esse arquivo está ignorado pelo Git.

```sh
npm run connection:test
```

Esse comando consulta o clã por HTTPS, imprime apenas nome, tag, quantidade de membros e visibilidade do registro de guerras. Não imprime a chave nem corpos de erro.

## 2. Executar localmente

```sh
npm run db:local
npm run dev
```

Abra http://localhost:8787. O Worker também serve os arquivos estáticos durante o desenvolvimento. O banco local funciona com o ID provisório de `wrangler.jsonc`; o ID real só é exigido para publicação.

Para fazer uma coleta manual, gere `ADMIN_TOKEN` com pelo menos 32 caracteres aleatórios e salve em `.dev.vars`. A rota `POST /api/sync` exige `Authorization: Bearer <ADMIN_TOKEN>`. Nunca coloque esse segredo no painel. Alternativamente, use a execução do agendamento pelo painel Cloudflare. A atualização do navegador apenas relê o banco; ela não dispara consultas à API Clash.

```sh
npm test
npm run check
npm run build
```

Os testes usam SQLite real em memória e respostas HTTP controladas. Não enviam mensagens para canais reais.

## 3. Publicar o monitor gratuitamente no Cloudflare

Crie uma conta Cloudflare gratuita e execute:

```sh
npx wrangler login
npx wrangler d1 create clan-monitor
```

Copie o `database_id` retornado para `wrangler.jsonc`. Não é um segredo. Defina `PUBLIC_ORIGIN` com a origem exata do painel Vercel (ex.: `https://tigers-family-tow.vercel.app`), sem barra final.

```sh
npm run db:remote
npx wrangler secret put CLASH_API_TOKEN
npx wrangler secret put ADMIN_TOKEN
npm run deploy:worker
```

Os comandos `secret put` solicitam o valor sem colocá-lo no código. O cron de cinco minutos já está declarado. A publicação inicia a coleta; notificações só são enviadas quando os respectivos segredos são configurados.

## 4. Publicar o painel na Vercel

Importe o repositório GitHub na Vercel:

| Campo | Valor |
| --- | --- |
| Framework | Other |
| Build command | `npm run build` |
| Output directory | `dist` |
| Variável de build | `PUBLIC_API_BASE=https://clan-monitor.SEU-SUBDOMINIO.workers.dev` |

`PUBLIC_API_BASE` não contém segredo: é a origem do Worker, sem barra final e sem `/api`. Não configure CLASH_API_TOKEN nem tokens dos canais na Vercel: o painel é inteiramente estático. Depois de conhecer a URL definitiva Vercel, ajuste PUBLIC_ORIGIN no Worker e publique novamente. Sem a URL do Worker, o painel exibe instruções de conexão.

## 5. Conectar o Discord

### Discord

No canal desejado, use **Editar canal → Integrações → Webhooks**. Crie um webhook e copie a URL; ela é uma credencial.

```sh
npx wrangler secret put DISCORD_WEBHOOK_URL
```

O monitor desativa menções automáticas no Discord. Nenhuma associação automática entre tags Clash e usuários do Discord é realizada.

### Selecionar avisos

Variáveis públicas de configuração do Worker:

- `ALERT_CHANNELS`: `discord` (o único canal de avisos atual).
- `ALERT_TYPES`: lista global separada por vírgula de `member_join,member_leave,war_start,war_end,war_reminder`.
- `ALERT_TYPES_DISCORD`: filtro adicional opcional para o Discord. Para desativar o canal, remova-o de ALERT_CHANNELS.

As configurações são aplicadas após nova publicação. O painel de alertas mostra se existem credenciais e a última entrega confirmada, sem exibir destinos ou tokens. Configurar credenciais não comprova entrega: confirme o primeiro envio real no canal escolhido.

## Limites do acompanhamento

- O histórico começa na primeira coleta: eventos anteriores não são reconstruídos.
- Entradas e saídas entre duas consultas podem passar despercebidas. Os horários são de detecção, não horários exatos do jogo.
- A primeira coleta não anuncia membros ou guerras já existentes.
- Registro de guerra privado ou erros de permissão podem impedir acompanhamento de guerras. O painel informa a falha e mantém os dados anteriores com a data da última coleta válida.
- Lembretes são avaliados nas janelas de 15 minutos após os marcos de 6h e 1h restantes. Se o serviço ficar indisponível durante toda a janela, o lembrete é perdido, evitando mensagens atrasadas.
- Doações são contadores de temporada dos membros atuais. Uma redução é tratada como reinício, sem inventar diferenças negativas. Não medimos atividade online, último acesso ou ataques em tempo real.
- Liga: consultamos até as três últimas rodadas disponíveis. Interrupções prolongadas podem deixar lacunas no histórico.
- Trava com concessão de quatro minutos impede coletas concorrentes normais. Timeout de envio pode deixar confirmação ambígua: em casos raros uma nova tentativa pode duplicar uma mensagem. Não há garantia de entrega exatamente uma vez nas APIs externas.
- A fila tenta até quatro entregas por coleta para respeitar o plano gratuito. Mensagens são resumidas se ultrapassarem 1.800 caracteres; a lista completa fica no painel.
- O painel é público, incluindo dados do clã, participantes e eventos observados. Segredos, destinos dos avisos e rotas de alteração não são públicos. O endpoint público pode consumir cotas sob tráfego elevado; é possível restringir o acesso se necessário.

## Segurança do repositório

`.dev.vars`, `.env*`, `.wrangler`, `.vercel`, dependências e build não são versionados. Nenhum segredo vai para o navegador. `/api/sync` só aceita POST autenticado; a API pública só lê dados já coletados. Nomes dos jogadores são escapados na interface. Logs persistem apenas códigos internos de falha.

Projeto independente, sem vínculo com Supercell. Consulte a [Fan Content Policy](https://supercell.com/en/fan-content-policy/).

## Comando da tropa

A aba **Comando da tropa** reúne recrutamento, composição por CV, comparação de dois clãs, movimentações, metas e guerras manuais. Requisitos e vagas vêm dos perfis públicos; cumprir os campos informados não garante aprovação nem verifica automaticamente a liga do candidato. Resumos antigos exibem a data da coleta.

A migração `0002_management.sql` adiciona:

- `roster_days`: última captura por dia UTC e clã, por até 32 dias; guarda apenas tag, nome, CV, troféus, doações e recebidas. O perfil do guerreiro mostra a evolução na família. Capturas independentes não comprovam presença simultânea em dois clãs.
- `roster_moves`: entradas/saídas observadas, retidas por 90 dias; a API retorna os últimos 500 eventos. A primeira coleta é referência. Possível transferência exige par único de entrada/saída da mesma tag em clãs distintos dentro de 48h, nos dois sentidos da associação. Não prova transferência direta, nem ausência de passagem por outro clã.
- `clan_goals`: metas de doações por temporada e ataques da Capital, com vigência em UTC e revisão. O progresso de doações usa o contador da API e reinicia com ele. Ausentes no registro da Capital ficam sem amostra, não com zero; o fim de semana deve ter iniciado na vigência.
- `manual_wars`: placares e ataques ofensivos de guerras encerradas, com origem manual, validação de limites e revisão otimista. São exibidos em seção própria, com download de placares em CSV. Não são mesclados aos rankings automáticos ou às estrelas oficiais, evitando dupla contagem e confusão de origem. Até 50 registros recentes por clã são exibidos.

A coleta do roster ocorre com as coletas existentes dos clãs e continua quando a guerra é privada. Não mede tempo online e não recupera eventos anteriores ao início da captura. O resumo da família também guarda requisitos de entrada, distribuição por CV e indicadores da Capital, sem consultar dados privados da guerra.

### Edição protegida

1. Aplique as migrações com `npm run db:remote` antes de publicar a versão.
2. Execute `node scripts/setup-leadership.mjs`. Ele gera uma chave aleatória dedicada, guarda `LEADERSHIP_TOKEN` em `.dev.vars` (permissão 600, ignorado pelo Git) e envia somente essa chave por stdin ao Cloudflare. Não imprime o valor e não altera as credenciais existentes. Nova execução reaproveita a chave local; para rotação, o administrador deve substituir a chave local e executar novamente.
3. No painel, selecione o clã, abra **Comando da tropa → Área da liderança** e informe `LEADERSHIP_TOKEN`. Não é o token da API Clash nem `ADMIN_TOKEN`.
4. A chave fica apenas em memória durante a janela aberta; fechar, pressionar Escape, bloquear ou trocar de clã remove a chave. Não é salva em localStorage, sessão, URL ou bundle. Os resultados e metas são públicos; a gravação exige a chave no cabeçalho Authorization. A chave autoriza administração dos 16 clãs e deve ser distribuída apenas à liderança autorizada.

Rotas públicas: `GET /api/management`, `GET /api/player-evolution?player=%23TAG` e `GET /api/clan-management?clan=%23TAG`. Rotas protegidas: `POST /api/leadership` (verificação), `POST /api/goals` e `POST /api/manual-wars`. A chave de sincronização não libera a liderança. JSON de gravação é limitado a 64 KiB; validações ocorrem no servidor, e revisões desatualizadas recebem HTTP 409. Não há novas notificações ou destinos configurados nesta etapa.

## Prioridades e navegação

O painel reúne as seções em **Família**, **Clã** e **Liderança**. No celular, um seletor exibe as seções da área escolhida; em telas maiores, os botões da área ficam visíveis. A seção visitada em cada área é lembrada durante a página aberta. A preferência do clã continua em `tigers-last-clan`, e mudar de área não modifica o clã nem libera a edição protegida.

O resumo **O que precisa de atenção?** aparece antes das seções, com filtros e acesso direto ao clã correto:

- Ataques pendentes só entram quando o perfil e a guerra têm captura recente, a coleta está `ok`, a guerra está em andamento e o término ainda está no futuro. A janela é de dez minutos para TOW 4 e trinta para os demais. Confrontos cujo horário já terminou aguardam nova coleta, sem continuar cobrando ataques antigos. Guerras próximas do término aparecem primeiro.
- Metas em vigência, com pelo menos um objetivo ativo, geram lembrete nas últimas 48 horas. O lembrete pede revisão do progresso e não afirma descumprimento. As metas públicas por clã são incluídas em `/api/family`; atualizações no formulário também atualizam o resumo local.
- Ausência de captura, dados antigos e falha na última atualização do perfil geram prioridades de coleta. A última tentativa também é propagada ao resumo do TOW 4 quando sua sincronização falha.
- Guerras privadas, Liga parcial e guerra sem atualização recente ficam numa área separada de limitações, sem inventar pendências. Uma falha ao consultar o resumo conserva a captura anterior, sinaliza o problema e continua descartando dados conforme envelhecem.

O resumo usa as consultas já existentes de família, com uma leitura adicional das metas no D1; não dispara consultas a novas fontes da API Clash ou novas notificações. O botão de atualização do painel também relê a visão da família.

## Texto pronto para WhatsApp

O botão **Texto para WhatsApp** fica no resumo de atenção, em cada guerra com ataques pendentes e na lista da guerra do clã. Uma janela permite selecionar qualquer um dos 16 clãs, consultar seu dashboard, pré-visualizar o texto, incluir tags opcionalmente, copiar a mensagem ou abrir o link oficial `https://wa.me/?text=...`.

O texto contém clã/tag, modalidade, adversário, placar da captura, término, tempo restante na geração, jogadores com ataques disponíveis em ordem de posição, começando pelos ataques pendentes, e horários de término e coleta em Brasília. Nomes são tratados como texto simples para não injetar linhas ou formatação do WhatsApp. A geração exige guerra ativa, perfil e guerra recentes, saúde `ok` e escalação completa, sem tags ou posições duplicadas. CWL usa um ataque por membro; guerra comum usa o limite informado pela API ou dois. Guerras privadas, parciais, encerradas, sem pendências ou com dados antigos não geram cobrança.

Abrir a janela apenas consulta o dashboard existente. Copiar ou compartilhar revalida o prazo e a validade da captura; a mensagem perde a disponibilidade se os dados vencerem enquanto a janela estiver aberta. Troca de clã no painel ou fechamento cancela a consulta pendente. Se a área de transferência estiver bloqueada, o texto fica selecionado para cópia manual.

Não há envio automático, destinatários configurados, associação de tags com telefones, marcação automática de contatos ou novas credenciais/custos de integração. O usuário escolhe a conversa ou grupo e confirma o envio no WhatsApp. Os testes de interface verificam o texto, o link e a cópia, sem abrir conversas ou enviar mensagens.

## Identidade e domínio

O projeto e o repositório se chamam **tigers-family**, com a marca da família **TIGERS OF WAR**. O endereço público é **https://tigers-family-tow.vercel.app**. O endereço anterior `https://sentinela-clash.vercel.app` redireciona para o novo; a origem anterior também é aceita explicitamente pelo Worker durante a transição. O ID do projeto Vercel, a integração GitHub, o Worker, o banco D1 e os canais de aviso permanecem os mesmos. Os nomes internos `clan-monitor` no Worker e no banco são preservados para não duplicar infraestrutura nem perder histórico.

Nos celulares, o menu inferior fica fixo com **Família**, **Clã** e **Liderança**, ícones e indicação da área atual. Ele respeita a área segura do aparelho e o tamanho de fonte escolhido. A página reserva espaço para sua altura, com margem adicional, e os diálogos o ocultam enquanto estão abertos. O seletor de seção continua no topo. Em telas maiores, a navegação permanece no cabeçalho do painel.

Preferências de tema, fonte e último clã usam o localStorage do navegador e são específicas de cada domínio. O novo endereço inicia com os padrões do painel; a mudança não transfere essas preferências entre domínios e não afeta os dados no servidor.

## Aplicativo instalável e lembretes no aparelho

O painel oferece um aplicativo web instalável, com ícones próprios e modo de janela independente. Acesse **Instalar app e ativar alertas**, ou **Liderança → Canais e avisos**, escolha os clãs e autorize notificações neste aparelho. No Android e navegadores compatíveis, use o botão Instalar ou o menu do navegador. No iPhone/iPad, use Compartilhar → Adicionar à Tela de Início no Safari e abra pelo ícone antes de ativar os alertas (Web Push em apps da Tela de Início, iOS/iPadOS 16.4+). A instalação e a permissão dependem de uma ação da pessoa no aparelho.

Esta etapa implementa avisos **por clã**, para quem acompanha ou organiza as cobranças. Não vincula contas do jogo a números de telefone e não encaminha mensagens automaticamente a jogadores. O lembrete abre o clã correto e a janela de texto para WhatsApp, com nova consulta dos dados. A pessoa revisa, escolhe a conversa e confirma o envio.

- O agendamento existente cria lembretes nas janelas de vinte minutos após os marcos de seis horas e uma hora restantes, somente com dados recentes, guerra ativa e ataques confirmados. Uma inscrição recebe no máximo um trabalho por guerra e marco. Os outros clãs têm coleta de aproximadamente quinze minutos, portanto não há promessa de entrega no minuto exato do marco.
- Os avisos são criptografados com Web Push (`aes128gcm`/VAPID) usando `@block65/webcrypto-web-push`, fixado em 2.0.0. O Worker mantém uma fila no D1, revalida a guerra antes do envio, processa até três trabalhos por minuto, limita a três tentativas e descarta avisos vencidos. Inscrições recusadas como expiradas pelo serviço são removidas. O canal Discord atual continua independente.
- A confirmação do servidor significa que o serviço de push aceitou o aviso, não que o aparelho o mostrou ou que alguém leu. Entrega e apresentação dependem da conexão, permissão, instalação e preferências do sistema operacional. O botão Enviar teste ajuda a confirmar no aparelho real.
- Cada navegador guarda uma credencial aleatória própria para administrar apenas sua inscrição. Inscrições, endpoints e chaves do aparelho não são públicos. Endpoints são limitados a provedores reconhecidos, sem redirecionamento; o cadastro é limitado a vinte novas inscrições por conexão por dia e mil aparelhos no total. Não são guardados números de telefone. O controle por conexão guarda somente uma chave irreversível de curta duração, não o IP em texto.
- O service worker não guarda respostas de dados nem listas de ataques. Sem internet, exibe uma página explicando que a consulta depende de conexão; assim não apresenta cobranças antigas como se fossem atuais.

Para configurar, aplique `0003_push.sql` e execute `node scripts/setup-push.mjs`. O script gera ou reutiliza o par `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` em `.dev.vars` e envia por stdin aos segredos do Worker, sem imprimir os valores. Nunca substitua essas chaves sem planejar a reativação das inscrições existentes. A chave pública é retornada em `/api/push/config`; a privada nunca sai do servidor.

Rotas da inscrição: `/api/push/config`, `/api/push/subscribe`, `/api/push/status`, `/api/push/unsubscribe` e `/api/push/test`. As operações sobre um aparelho exigem sua credencial; ninguém pode enviar um texto arbitrário a outra inscrição. Não há nova assinatura paga, serviço de disparo de WhatsApp ou infraestrutura separada. As cotas gratuitas existentes continuam aplicáveis.

## Novidades e versões

A aba **Família → Novidades e versões** apresenta as melhorias em linguagem simples, com busca, filtro por data, horário de Cuiabá e atalho para a área correspondente. O catálogo está em `public/releases.js`; as entradas históricas foram reconstruídas com as datas dos registros Git, sem afirmar que esses horários são o minuto exato da publicação. A numeração pública `AAAA.MM.DD.N` identifica a ordem das atualizações daquele dia. `AGENTS.md` orienta a acrescentar uma entrada em cada próxima funcionalidade ou mudança visível.
