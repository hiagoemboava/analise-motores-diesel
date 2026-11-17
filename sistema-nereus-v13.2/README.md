# Sistema NEREUS: Monitoramento de Motores Diesel (V13.2)

**Divisão de Máquinas · EDCG Marambaia**

Este diretório contém o código-fonte do **NEREUS**, o sistema de monitoramento
embarcado dos motores principais (MCP BB, de bombordo, e MCP BE, de boreste)
que deu origem à análise de dados deste repositório. A análise exploratória na
raiz do projeto foi o ponto de partida; o NEREUS é a evolução dela para um
sistema operacional, pensado para rodar a bordo.

## Estado desta versão

A V13.2 foi montada e testada fora do navio, em cópia isolada do Node-RED 4.0.9
com Dashboard 3.6.6. Ainda não foi instalada no PC de bordo nem homologada.
A base é a V13.1; a versão em operação a bordo continua sendo a V12, cujo código
permanece acessível no histórico do repositório (commit `4cbfd5a`).

## O que o sistema faz

- Lê os motores via **Modbus**, através de um conversor **AMVIF08**, em ciclo
  contínuo.
- Aplica um motor de **alarmes de 6 níveis de severidade** sobre RPM, pressão
  de óleo e temperatura de cada motor.
- Grava todas as leituras em **CSV** (uma amostra anonimizada está na raiz
  deste repositório, em `motor_diesel_amostra.csv`).
- Mostra um **dashboard** (Node-RED Dashboard) com alarmes sonoros, painel de
  supervisão, diagnóstico por motor e disponibilidade do enlace.
- Apura **horímetro por motor** e controla um **quadro de manutenção
  programada**, cruzando o catálogo oficial de rotinas (SMP) com o tempo de
  operação real.
- Gera automaticamente dois relatórios diários em PDF, com timbre militar:
  um técnico (Chefe de Máquinas) e um sumário executivo (Comandante).
- Mantém uma aba de **Passagem de Serviço** (V13.1).

## Novidades da V13.2

- **Militar de serviço ao abrir o sistema:** janela "Quem assume o serviço?"
  sobre qualquer aba, com as condições do momento e registro do nome com data
  e hora.
- **Encerramento do serviço ao fechar o sistema:** sinal de vida a cada 30 s;
  no arranque seguinte, o serviço que ficou aberto é encerrado com a hora do
  último sinal e a marca "(desligamento do sistema)". Reinícios de até 60 min
  oferecem "Retomar" o serviço do mesmo militar.
- **Autenticação do painel:** usuário e senha antes de qualquer tela, com duas
  contas (operador e administrador), senhas guardadas com scrypt e registro de
  acessos.
- **Abertura animada e ícone único de inicialização** (Windows).
- **Layout da Supervisão:** letras maiores, cabeçalhos neutros, faixa de
  identidade BB/BE e linhas alinhadas. Alteração apenas de templates de
  apresentação.

Dos 295 nós da V13.1, nenhum foi removido e 9 foram alterados (3 templates de
apresentação e 6 nós do módulo de Passagem de Serviço). Foram acrescentados 4
nós. O nó de diagnóstico (`n6_fn_diag`) não foi alterado.

## Arquitetura

O núcleo roda em **Node-RED**. Dois cálculos que variam sobre arquivos CSV de
vários megabytes (horímetro e manutenção) ficam fora do laço de eventos do
Node-RED para não competir com a leitura Modbus: são scripts Node.js
independentes, chamados sob demanda.

| Item | Arquivo | Papel |
|---|---|---|
| Fluxo principal | `flows.json` | Leitura Modbus, motor de alarmes, dashboard, passagem de serviço, geração dos relatórios |
| Configuração do runtime | `settings.js` | Configuração do Node-RED (contexto em arquivo, autenticação do painel, versão) |
| Apurador de horímetro | `scripts/nereus_horimetro.js` | Consolida horas de operação por motor a partir dos CSV diários |
| Apurador de manutenção | `scripts/nereus_manutencao.js` | Cruza execuções registradas com o catálogo de rotinas e o horímetro |

Guia de aplicação: [`GUIA_APLICACAO.md`](./GUIA_APLICACAO.md).
Histórico de mudanças entre versões: [`CHANGELOG.md`](./CHANGELOG.md).

## Integridade dos arquivos

| Arquivo | SHA-256 |
|---|---|
| `flows.json` (299 nós) | `7c3b954e1ca1ffacc1aacb4ddc2f54ba2fbb4697affed17e8be9bce659c6bf95` |
| nó de diagnóstico `n6_fn_diag` (dentro do `flows.json`) | `da6967ba3becc01937be1110558ddac5a0f89f82c66e0a0322ef336485489e0c` |

O `settings.js` deste repositório difere do usado nos testes em uma única
linha: o hash da senha do editor (modo manutenção) foi substituído por um
marcador. Por isso o hash dele não é divulgado aqui.

## O que não está neste repositório

Não fazem parte desta publicação: o módulo de autenticação e de cadastro de
usuários, as telas de login e de abertura, o ícone e o script de inicialização,
a configuração por embarcação (perfis de motor, regras e mapeamento de canais),
o catálogo de rotinas de manutenção e as ferramentas de bancada. O
`settings.js` publicado espera o módulo de autenticação na pasta do Node-RED;
sem ele, o painel responde "autenticação indisponível" por desenho (a aquisição
e os alarmes em segundo plano continuam). Para instalar a V13.2 completa, é
preciso o pacote integral da Divisão de Máquinas.
