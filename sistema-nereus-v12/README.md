# Sistema NEREUS — Monitoramento de Motores Diesel (V12)

**Divisão de Máquinas · EDCG Marambaia**

Este diretório contém o código-fonte em produção do **NEREUS**, o sistema de
monitoramento embarcado dos motores principais (MCP BB — boreste, e MCP BE —
bombordo) que deu origem à análise de dados deste repositório. A análise
exploratória na raiz do projeto foi o ponto de partida; o NEREUS é a evolução
dela para um sistema operacional, rodando a bordo.

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

## Arquitetura

O núcleo roda em **Node-RED**. Dois cálculos que variam sobre arquivos CSV de
vários megabytes (horímetro e manutenção) foram tirados do laço de eventos do
Node-RED para não competir com a leitura Modbus: são scripts Node.js
independentes, chamados sob demanda.

| Item | Arquivo | Papel |
|---|---|---|
| Fluxo principal | `flows.json` | Leitura Modbus, motor de alarmes, dashboard, geração dos relatórios |
| Configuração do runtime | `settings.js` | Configuração do Node-RED (armazenamento de contexto, etc.) |
| Apurador de horímetro | `scripts/nereus_horimetro.js` | Consolida horas de operação por motor a partir dos CSV diários |
| Apurador de manutenção | `scripts/nereus_manutencao.js` | Cruza execuções registradas com o catálogo de rotinas e o horímetro |

Guia completo de aplicação e operação: [`GUIA_APLICACAO.md`](./GUIA_APLICACAO.md).
Histórico de mudanças entre versões: [`CHANGELOG.md`](./CHANGELOG.md).

## Principais módulos da V12

- **Horímetro corrigido**: passou a integrar o tempo real entre amostras com
  RPM ≥ 200 (em vez de somar em memória, que zerava a cada reinício do
  Node-RED).
- **Painel de supervisão redistribuído**: motores, ações e enlace consolidados
  em um único widget responsivo, resolvendo o empilhamento incorreto do
  Dashboard.
- **Módulo de manutenção programada**: catálogo oficial de 13 rotinas do SMP
  de 1º escalão das MCP, com quadro de vencimentos, registro de execução e
  avaliação de efeito (mediana de parâmetros antes/depois de cada rotina).
- **Relatórios** ampliados com seção de manutenção programada e horímetro
  acumulado.

## Pendências conhecidas

- Calibrar o horímetro contra o contador físico dos dois MCP.
- Lançar a última execução conhecida das rotinas controladas por horímetro.
- Reconectar o AMVIF08 (aquisição parada desde 19/08/2026).
- Óleo da redutora sem canal de medição após o remapeamento do AMVIF08.
- Transdutor de pressão do MCP BE (ch7) com assinatura de falha do sensor.
- Teste discriminante da queda recorrente do enlace RS485 (24h com o par
  desconectado).
