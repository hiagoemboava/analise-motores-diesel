# Changelog: Sistema NEREUS

Registro das principais mudanças entre as versões documentadas. Não cobre
todas as iterações intermediárias, apenas os marcos com decisões de projeto
registradas.

## V13.2 (27/10/2026, publicada em 17/11/2026)

Montada e testada fora do navio, a partir da V13.1. Ainda não instalada a
bordo nem homologada.

**Passagem de serviço**

- Janela "Quem assume o serviço?" ao abrir o painel (qualquer aba), com as
  condições do momento (situação geral, MCP BB, MCP BE, enlace). O nome
  digitado fica gravado como militar de serviço, com data e hora.
- Sinal de vida a cada 30 s. No arranque de um processo novo, o serviço que
  ficou aberto é encerrado com a hora do último sinal e a marca "(desligamento
  do sistema)". Um deploy do Node-RED não encerra o serviço.
- "Retomar [nome]" quando o reinício ocorreu há até 60 min, sem registrar
  rendição falsa. "Ver o painel agora, assumo depois" adia a janela por 10 min,
  para não bloquear o monitoramento em caso de alarme na abertura.
- Nova tabela `passagem_sistema` no registro histórico, criada no arranque.

**Autenticação do painel**

- Usuário e senha antes de qualquer tela do Dashboard, com perfis operador e
  administrador. Sessão de 12 h, renovada enquanto a janela estiver aberta.
- Senhas guardadas com scrypt (módulo nativo do Node), sem dependência nova.
  Cinco tentativas erradas bloqueiam o endereço por 60 s. Falha fechada: sem
  usuário cadastrado, ninguém entra no painel; a aquisição, o diagnóstico, o
  CSV e os alarmes em segundo plano seguem funcionando.
- Registro de acessos em arquivo de log (login, falha, bloqueio, troca de
  senha).
- `settings.js`: constantes novas, `NEREUS_BOOT_MS` e a chave `ui` com os
  middlewares de autenticação.

**Abertura e inicialização (Windows)**

- Abertura animada (carta náutica: anel de azimute, N-E-R-E-U-S letra por letra
  com a palavra da sigla abaixo de cada uma). Toca `abertura.mp4` ou
  `abertura.webm`, se existirem; caso contrário, usa a animação de reserva.
- Um único ícone de inicialização liga o núcleo, espera o painel responder e
  abre a janela em tela cheia.

**Layout da Supervisão** (somente templates de apresentação)

- Valores dos instrumentos em 28 px (antes 16 px); rótulos de 13,5 a 16 px
  (antes 10 a 12,5 px).
- Cabeçalhos dos motores em azul-marinho, com a identidade BB/BE numa faixa
  lateral e a severidade numa etiqueta própria. O cabeçalho do MCP BE deixou de
  usar o laranja de ATENÇÃO.
- Linhas de BB e BE alinhadas; horímetro sem caixas que lembravam campos de
  formulário; cabeçalho do NEREUS mais baixo; botões do banner de alarme
  maiores.

**Verificação**

- Dos 295 nós da V13.1: 0 removidos, 9 alterados (3 templates de apresentação e
  6 nós do módulo de passagem de serviço), 4 acrescentados. Total de 299 nós.
- Nó de diagnóstico `n6_fn_diag` sem alteração. Bancada contra o `flows.json`
  da V13.2: 48 casos iguais, 0 divergentes, 0 ausentes.
- O hash do `flows.json` mudou, então o rodapé mostra "FLUXO ALTERADO" até a
  homologação a bordo.
- Não verificado (exige Windows e o PC de bordo): script de inicialização,
  criação do atalho, MP4 H.264 no Edge e layout em tela física.

## V13.1

- Nova aba de Passagem de Serviço (módulo `pas_`). Base da V13.2, com 295 nós.

## V12 (22/08/2026)

**Arquitetura**

- Criados dois apuradores externos em Node.js (`nereus_horimetro.js` e
  `nereus_manutencao.js`), fora do laço de eventos do Node-RED, para não
  bloquear a leitura Modbus ao varrer CSV de vários MB.
- `settings.js`: `contextStorage` habilitado com escopo `file` (persistência
  em disco), mantendo o escopo padrão em memória para não alterar o
  comportamento dos nós existentes.

**Correção do horímetro**

- Corrigidas duas causas de zeragem do contador: (1) contador mantido em
  memória, que zerava a cada reinício do Node-RED; (2) fallback incorreto no
  cálculo de horas do período nos relatórios.
- Horas do período passaram a ser integradas do tempo real entre amostras com
  RPM ≥ 200, com regras de desconto de lacunas (> 60 s) e de amostras
  duplicadas.

**Painel de supervisão**

- Motores, ações e enlace consolidados em um único widget de largura
  inteira, com grade responsiva (três colunas → duas → uma, conforme a
  largura da tela), substituindo o empilhamento problemático do Dashboard.
- Correção de um bug de medição de altura em `ui_template` (`ng-if` na raiz
  do template impedia o Dashboard de medir a altura do cartão corretamente).

**Módulo de manutenção programada (novo)**

- Catálogo de rotinas cruzado com o horímetro e com registros de execução.
- Situação por rotina: em dia, próxima, vencida, sem registro ou cartão SMP
  (rondas diárias/semanais, que não geram alarme).
- Avaliação de efeito da rotina: mediana de parâmetros relevantes 3 dias
  antes/depois da execução (com RPM ≥ 700), classificando como melhora,
  piora, sem mudança mensurável ou sem dados.
- Catálogo populado com as 13 rotinas oficiais do SMP de 1º escalão das MCP
  da EDCG Marambaia.

**Relatórios**

- Nova seção de manutenção programada nos relatórios técnico e sumário ao
  comando; horímetro acumulado nos cartões do sumário.

## V6 (19/08/2026)

**Dashboard**

- Redesenho da grade do painel (32 unidades), calibrada para a resolução de
  tela em uso a bordo.
- Logo corrigido por problema de contraste (âncora azul-marinho sobre fundo
  azul-marinho).

**Integridade da instrumentação (novo)**

- Nó dedicado, a cada 30 s, detectando quatro assinaturas de falha de sensor
  (tensão nula, tensão saturada, variação abaixo da resolução com motor
  girando, pressão nula com motor girando).
- Três estados por canal: OK, SUSPEITO (severidade limitada a ATENÇÃO) e
  INOPERANTE (regras suspensas, aviso permanente).

**Relatórios**

- Unificação da geração dos dois relatórios (técnico e sumário ao comando)
  em uma função só, com timbre militar.
- Novas seções: integridade da instrumentação e disponibilidade do enlace.

**Enlace Modbus**

- Corrigido bug em que o contador de erros era alimentado pela saída de
  sucesso do nó `modbus-read` (não pela saída de erro).
- Métrica principal passou a ser disponibilidade (leituras recebidas ÷
  esperadas), com registro de interrupções e reconexão automática da porta
  serial após 60 s de silêncio.

**Pendências herdadas para a V12**

- Horímetro ainda em memória (resolvido na V12).
- Módulo de manutenção não implementado (resolvido na V12).
- Óleo da redutora sem canal de medição (segue pendente).
