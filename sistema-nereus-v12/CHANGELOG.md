# Changelog — Sistema NEREUS

Registro das principais mudanças entre as versões documentadas. Não cobre
todas as iterações intermediárias (v7 a v11), apenas os dois marcos com
decisões de projeto registradas.

## V12 — 22/08/2026

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

## V6 — 19/08/2026

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
