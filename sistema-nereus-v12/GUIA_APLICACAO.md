# NEREUS v12 — aplicação e operação

Divisão de Máquinas · EDCG Marambaia · 22/08/2026

> Este é o guia original usado para aplicar a atualização v6 → v12 na
> instalação de produção e para operar os módulos novos no dia a dia.
> Mantido aqui como documentação do fluxo operacional do sistema.

Esta versão corrige o horímetro dos relatórios, redistribui a tela de Supervisão,
passa a manter horas acumuladas por motor e acrescenta o módulo de manutenção
programada.

---

## 1. Arquivos desta entrega

| Arquivo | Destino | Observação |
|---|---|---|
| `flows.json` | `.node-red/` | substitui o `flows.json` da instalação no passo 3 |
| `settings.js` | `.node-red/` | substitui o `settings.js` da instalação no passo 3 |
| `scripts/nereus_horimetro.js` | pasta de dados do motor | apurador de horas e histórico |
| `scripts/nereus_manutencao.js` | pasta de dados do motor | apurador do quadro de manutenção |
| `manutencao_rotinas.csv` (não incluso neste repositório) | pasta de dados do motor | catálogo de rotinas — **preencher** |

O `flows.json` e o `settings.js` da instalação anterior **não são alterados** por
este pacote. A troca é feita manualmente, no passo 3, com o Node-RED parado.

---

## 2. Antes de aplicar

Confirme que o Node.js responde na linha de comando, porque os dois apuradores
rodam fora do Node-RED:

```
node --version
```

Se o comando não for reconhecido, localize o `node.exe` e crie a variável de
ambiente `NEREUS_NODE` com o caminho completo. Os nós de comando já leem essa
variável.

---

## 3. Aplicação

1. Pare o Node-RED (feche a janela do console ou pare o serviço).
2. Na pasta de instalação do Node-RED (`.node-red`):
   - renomeie o `flows.json` atual para `flows_backup.json`;
   - renomeie o `settings.js` atual para `settings_backup.js`;
   - copie o `flows.json` e o `settings.js` deste pacote para o lugar deles.
3. Suba o Node-RED e abra o editor.
4. Confira, na aba correspondente, se os nós novos aparecem sem triângulo
   vermelho: *Comando de consolidação do horímetro*, *nereus_horimetro.js*,
   *Estado do horímetro*, *Comando de apuração da manutenção*,
   *nereus_manutencao.js*, *Quadro de manutenção*, *Painel de supervisão*.
5. Faça um **Deploy** (mesmo sem alterar nada) para que os `inject` de arranque
   disparem.

Se algo sair errado, o retorno é o inverso do passo 2: os dois arquivos de
backup voltam aos nomes originais.

---

## 4. Primeira carga do horímetro

### 4.1 Reprocessar o histórico

Na aba **Sistema** do dashboard, botão **"Reprocessar todo o histórico de horas"**.
Ele relê todos os `motor_diesel_AAAA-MM-DD.csv` da pasta de dados e grava:

- `horimetro_diario.csv` — uma linha por dia, com horas de cada motor,
  acumulado, registros, lacunas e intervalo mediano de amostragem;
- `nereus_estado.json` — base de calibração, dias apurados e acumulado.

O mesmo pode ser feito na linha de comando:

```
node nereus_horimetro.js --todos
```

### 4.2 Calibrar contra o contador oficial

Na aba **Manutenção**, bloco *Calibração do horímetro*: informe as horas lidas
no contador físico de cada MCP e grave. O sistema passa a somar a partir daí,
mantendo o histórico já apurado dos registros.

Equivalente na linha de comando:

```
node nereus_horimetro.js --calibrar bb=1234.5 be=1180.2
```

A conta é sempre a mesma: **acumulado = base de calibração + soma dos dias
apurados dos CSV**. Recalibrar não apaga histórico: apenas redefine a base.

### 4.3 Consultar horas de um período

```
node nereus_horimetro.js --consulta 2026-08-01:2026-08-19
```

---

## 5. Catálogo de rotinas

Editar o `manutencao_rotinas.csv` (Excel abre direto; separador `;`). Uma
linha por rotina:

| Coluna | Conteúdo |
|---|---|
| `ID` | identificador curto e estável, ex.: `R01` |
| `Motor` | `BB`, `BE` ou `AMBOS` |
| `Rotina` | nome como aparece no plano de manutenção |
| `Sistema` | lubrificação, arrefecimento, injeção… |
| `Periodicidade_h` | horas de funcionamento entre execuções |
| `Periodicidade_dias` | dias de calendário, para rotinas que vencem por tempo |
| `Tolerancia_h` | antecedência com que a rotina entra como PRÓXIMA |
| `Responsavel` | quem executa |
| `Parametros` | parâmetros que devem responder à rotina: `temp_oleo`, `temp_agua`, `pressao_oleo`, `rotacao` |
| `Descricao` | o que fazer, em uma ou duas frases |
| `Alerta` | `SIM`/`NAO` — rotinas com `NAO` entram no quadro mas não geram recomendação nem contam em vencidas/próximas (uso típico: rondas diárias/semanais já cobertas por cartão de papel) |

A coluna `Parametros` é o que liga manutenção a medição: ao registrar a
execução, o sistema compara a mediana desses parâmetros em regime de carga nos
três dias anteriores e nos três posteriores e informa se houve melhora, piora
ou nenhuma mudança mensurável.

---

## 6. Registro de execução

Aba **Manutenção** → *Registrar rotina executada*. Rotina, motor, data,
executante, itens aplicados e observação. O sistema grava **o horímetro do
motor naquela data** — inclusive para lançamentos retroativos, reconstruindo
o valor a partir dos dias apurados. É esse número que determina o vencimento
da próxima execução.

Nada digitado no formulário chega a interpretador de comandos: a gravação é
feita por nó `file` do próprio Node-RED.

Ao registrar, o quadro é reapurado em poucos segundos e o resultado aparece
no painel de Supervisão, na aba Manutenção e nos dois relatórios do dia
seguinte.

---

## 7. Conferência dos números

O relatório e o apurador usam exatamente a mesma regra de contagem de horas,
sobre o mesmo arquivo. Para conferir um dia publicado:

```
node nereus_horimetro.js --dia 2026-08-18
```

O valor impresso tem de bater com o cartão "Operação MCP BB / BE" do relatório
técnico daquele dia. Divergência é sinal de arquivo alterado depois da
geração — vale investigar.

---

## 8. Regra de contagem (para constar)

Uma amostra credita tempo ao motor quando a rotação registrada nela é igual ou
superior a **200 RPM**. O tempo creditado é o intervalo real até a amostra
seguinte, **limitado a 60 s**: intervalo maior que isso é período sem
supervisão — Node-RED parado, enlace mudo, computador desligado — e não pode
ser atribuído a nenhuma condição do motor. Amostras gravadas no mesmo segundo
(efeito de deploy) são reduzidas à última, que é a que carrega a leitura
fresca.

Essa regra vale igualmente para o horímetro, para os tempos de severidade e
para os tempos por estado operacional.

---

## 9. Pendências conhecidas nesta versão

- Óleo da redutora continua sem canal de medição após o remapeamento do
  AMVIF08.
- Teste discriminante da queda do enlace (24 h com o par RS485 desconectado e
  o conversor plugado) continua pendente.
- O catálogo de rotinas precisa refletir os dados oficiais do manual do
  fabricante além do SMP já incorporado.
