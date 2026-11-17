# NEREUS V13.2: aplicação

Divisão de Máquinas · EDCG Marambaia · 17/11/2026

> Guia da aplicação da V13.2 sobre uma instalação da V13.1. A V13.2 ainda não
> foi instalada a bordo nem homologada; o roteiro abaixo é o previsto para a
> instalação. O guia operacional da V12 (horímetro, catálogo de rotinas,
> registro de execução, regra de contagem de horas) continua válido para esses
> módulos, que não mudaram, e está no histórico:
> `git show 4cbfd5a:sistema-nereus-v12/GUIA_APLICACAO.md`.

---

## 1. Arquivos desta entrega

| Arquivo | Destino | Observação |
|---|---|---|
| `flows.json` | `.node-red/` | substitui o `flows.json` da instalação (299 nós) |
| `settings.js` | `.node-red/` | substitui o `settings.js` da instalação; ver seção 4 |
| `scripts/nereus_horimetro.js` | pasta de dados do motor | idêntico ao da V12 |
| `scripts/nereus_manutencao.js` | pasta de dados do motor | idêntico ao da V12 |

A autenticação do painel, as telas de login e de abertura, a configuração por
embarcação e as ferramentas de bancada não fazem parte desta publicação (ver o
README). Uma instalação completa depende do pacote integral.

---

## 2. Antes de aplicar

1. Confirme que o Node.js responde na linha de comando (`node --version`). Os
   dois apuradores rodam fora do Node-RED. Se não for reconhecido, defina a
   variável de ambiente `NEREUS_NODE` com o caminho completo do `node.exe`.
2. Faça backup dos dois arquivos da instalação atual, com a data e os hashes
   anotados:
   - `flows.json` como `flows_v13.1_ANTES_V13.2.json`;
   - `settings.js` como `settings_v13.1_ANTES_V13.2.js`.
3. Não há dependência nova a instalar.

---

## 3. Aplicação (com o motor parado)

1. Pare o Node-RED (serviço ou janela de console).
2. Copie `flows.json` e `settings.js` desta entrega para a pasta `.node-red`,
   depois de resolver a seção 4.
3. Copie os módulos de autenticação e as telas do pacote integral, que o
   `settings.js` espera na pasta `.node-red`. Sem eles o painel não abre.
4. Suba o Node-RED em modo de manutenção e abra o editor. O rodapé do painel
   mostra "FLUXO ALTERADO". Isso é esperado: o hash do `flows.json` mudou.
5. Faça um **Deploy** para que os `inject` de arranque disparem.
6. Confira as tabelas e janelas novas: a tabela `passagem_sistema` é criada no
   arranque, e a janela "Quem assume o serviço?" aparece ao abrir o painel.

---

## 4. Senha do editor (modo manutenção)

No `settings.js` publicado, o campo `password` do usuário `manutencao` traz o
marcador `SUBSTITUIR_PELO_HASH_BCRYPT_DO_EDITOR`. Gere o seu hash e substitua o
marcador:

```
node-red admin hash-pw
```

Cole o hash bcrypt gerado no lugar do marcador. Enquanto o marcador permanecer,
nenhuma senha dá acesso ao editor em modo manutenção. Não registre esse hash em
repositório público.

---

## 5. Conferências e homologação

- **Hash do fluxo:** `flows.json` deve ter SHA-256
  `7c3b954e1ca1ffacc1aacb4ddc2f54ba2fbb4697affed17e8be9bce659c6bf95`.
- **Bancada:** rodar o harness contra o `flows.json` instalado. O resultado
  esperado é 48 casos iguais, 0 divergentes e 0 ausentes.
- **Diagnóstico:** o nó `n6_fn_diag` não foi alterado. Seu hash é
  `da6967ba3becc01937be1110558ddac5a0f89f82c66e0a0322ef336485489e0c` e a
  verificação deve dar CONFORME.
- **Homologação:** calcule o novo hash do `flows.json`, atualize o arquivo de
  homologação da instalação e reinicie. O rodapé deve voltar a "fluxo íntegro".

---

## 6. Reversão

Pare o Node-RED, restaure os dois arquivos do passo 2 da seção 2 e suba de novo.
As tabelas novas ficam no banco e não interferem na V13.1. Os módulos de
autenticação e as telas, se já copiados, podem permanecer: o `settings.js` da
V13.1 não os chama.

---

## 7. Pendências

- Instalação a bordo e homologação do novo hash do fluxo.
- Verificação em equipamento físico: script de inicialização, ícone, vídeo de
  abertura em MP4 e layout em tela de bordo.
