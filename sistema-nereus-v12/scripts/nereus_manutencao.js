/* ============================================================================
   NEREUS - MOTOR DE MANUTENCAO PROGRAMADA
   ----------------------------------------------------------------------------
   Cruza tres coisas:
     1. o catalogo de rotinas do fabricante / da praxe de bordo
        C:\Dados_Motor\manutencao_rotinas.csv      (voce edita)
     2. o registro do que foi efetivamente executado
        C:\Dados_Motor\manutencao_execucoes.csv    (o dashboard escreve)
     3. o horimetro acumulado apurado dos registros
        C:\Dados_Motor\nereus_estado.json          (nereus_horimetro.js escreve)

   e produz:
     C:\Dados_Motor\manutencao_status.json
        - situacao de cada rotina por motor (EM DIA / PROXIMA / VENCIDA)
        - horas que faltam e previsao em dias no ritmo de uso recente
        - efeito medido das ultimas rotinas executadas sobre os parametros

   USO
     node nereus_manutencao.js                      apura tudo
     node nereus_manutencao.js --registrar id=R01 motor=BB executante="SO-MO Silva" obs="..."
     node nereus_manutencao.js --efeito             so recalcula o efeito das rotinas
     node nereus_manutencao.js --lista              imprime o quadro no console
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

const PASTA = process.env.NEREUS_PASTA || "C:\\Dados_Motor";
const ARQ_ROTINAS = "manutencao_rotinas.csv";
const ARQ_EXEC = "manutencao_execucoes.csv";
const ARQ_ESTADO = "nereus_estado.json";
const ARQ_STATUS = "manutencao_status.json";
const PREFIXO_CSV = "motor_diesel_";

/* Janela de comparacao antes/depois de uma rotina, em dias de calendario. */
const JANELA_EFEITO_DIAS = 3;
/* Regime minimo para comparar parametro com parametro: so amostras em carga. */
const RPM_REGIME = 700;
/* Rotinas executadas ha mais de isso nao entram na analise de efeito. */
const EFEITO_MAX_DIAS = 120;

/* Direcao esperada de cada parametro depois de uma rotina bem sucedida. */
const PARAMETROS = {
    temp_oleo: { rotulo: "Temperatura do \u00f3leo", colBB: "Temp_OL_BB_C", colBE: "Temp_OL_BE_C", direcao: -1, unidade: "\u00b0C", ruido: 1.5 },
    temp_agua: { rotulo: "Temperatura da \u00e1gua", colBB: "Temp_Agua_BB_C", colBE: "Temp_Agua_BE_C", direcao: -1, unidade: "\u00b0C", ruido: 1.5 },
    pressao_oleo: { rotulo: "Press\u00e3o do \u00f3leo", colBB: "Pressao_OL_BB_bar", colBE: "Pressao_OL_BE_bar", direcao: 1, unidade: "bar", ruido: 0.15 },
    rotacao: { rotulo: "Rota\u00e7\u00e3o", colBB: "Rotacao_MCP_BB_RPM", colBE: "Rotacao_MCP_BE_RPM", direcao: 0, unidade: "RPM", ruido: 40 }
};

/* ------------------------------ utilitarios ------------------------------ */

function dois(n) { return n < 10 ? "0" + n : "" + n; }
function dataISO(d) { return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate()); }

function dividir(linha) {
    const campos = []; let atual = ""; let aspas = false;
    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            if (aspas && linha[i + 1] === '"') { atual += '"'; i++; } else { aspas = !aspas; }
        } else if (c === ";" && !aspas) { campos.push(atual); atual = ""; }
        else { atual += c; }
    }
    campos.push(atual); return campos;
}

function paraNumero(t) {
    if (t === undefined || t === null) return NaN;
    const s = String(t).trim().replace(/^"|"$/g, "").replace(",", ".");
    if (s === "") return NaN;
    const n = Number(s); return isFinite(n) ? n : NaN;
}

function texto(t) { return String(t === undefined || t === null ? "" : t).trim().replace(/^"|"$/g, ""); }

function campoCsv(v) { return '"' + String(v === undefined || v === null ? "" : v).replace(/"/g, '""') + '"'; }

function lerCsvNomeado(caminho) {
    if (!fs.existsSync(caminho)) return [];
    const linhas = fs.readFileSync(caminho, "utf8").split(/\r?\n/).filter(function (l) { return l.trim() !== ""; });
    if (linhas.length < 1) return [];
    const cab = dividir(linhas[0]).map(texto);
    const saida = [];
    for (let i = 1; i < linhas.length; i++) {
        const c = dividir(linhas[i]);
        if (texto(c[0]) === cab[0]) continue;               // cabecalho repetido
        if (texto(c[0]).indexOf("#") === 0) continue;        // comentario
        const o = {};
        cab.forEach(function (nome, k) { o[nome] = texto(c[k]); });
        saida.push(o);
    }
    return saida;
}

function mediana(v) {
    const x = v.filter(function (n) { return isFinite(n); }).sort(function (a, b) { return a - b; });
    if (!x.length) return null;
    return x[Math.floor(x.length / 2)];
}

/* ------------------------- leitura das amostras -------------------------- */

function lerAmostrasDoDia(dia) {
    const caminho = path.join(PASTA, PREFIXO_CSV + dia + ".csv");
    if (!fs.existsSync(caminho)) return [];
    const linhas = fs.readFileSync(caminho, "utf8").split(/\r?\n/);
    let idx = null; const saida = [];
    for (let i = 0; i < linhas.length; i++) {
        const l = linhas[i]; if (!l || l.trim() === "") continue;
        const c = dividir(l); const p = texto(c[0]);
        if (p === "DataHora") { idx = {}; c.forEach(function (nome, k) { idx[texto(nome)] = k; }); continue; }
        if (idx === null) continue;
        if (!/^\d{4}-\d{2}-\d{2}/.test(p)) continue;
        saida.push({ linha: c, idx: idx, hora: p.slice(11, 19) });
    }
    return saida;
}

function diasAoRedor(diaBase, quantos, sentido) {
    const base = new Date(diaBase + "T12:00:00");
    const lista = [];
    for (let i = 1; i <= quantos; i++) {
        lista.push(dataISO(new Date(base.getTime() + sentido * i * 86400000)));
    }
    return lista;
}

/* Estatistica de um parametro em uma lista de dias, so em regime de carga. */
function estatFaixa(dias, motor, chaveParam) {
    const p = PARAMETROS[chaveParam]; if (!p) return null;
    const colValor = motor === "BE" ? p.colBE : p.colBB;
    const colRpm = motor === "BE" ? "Rotacao_MCP_BE_RPM" : "Rotacao_MCP_BB_RPM";
    let valores = [];
    dias.forEach(function (d) {
        lerAmostrasDoDia(d).forEach(function (a) {
            const rpm = paraNumero(a.linha[a.idx[colRpm]]);
            if (!isFinite(rpm) || rpm < RPM_REGIME) return;
            const v = paraNumero(a.linha[a.idx[colValor]]);
            if (isFinite(v)) valores.push(v);
        });
    });
    if (valores.length < 30) return null;                     // amostra insuficiente
    return { n: valores.length, mediana: mediana(valores) };
}

/* --------------------------- carga do contexto --------------------------- */

function lerEstado() {
    try { return JSON.parse(fs.readFileSync(path.join(PASTA, ARQ_ESTADO), "utf8")); }
    catch (e) { return { base: { bb_h: 0, be_h: 0 }, dias: {}, acumulado: { bb_h: 0, be_h: 0 } }; }
}

function ritmoDiario(estado, motor) {
    /* Media de horas por dia com operacao, nos ultimos 30 dias com registro.
       Serve para traduzir "faltam 84 h" em "cerca de 9 dias no ritmo atual". */
    const dias = Object.keys(estado.dias || {}).sort().slice(-30);
    let soma = 0, n = 0;
    dias.forEach(function (d) {
        const h = motor === "BE" ? estado.dias[d].horas_be : estado.dias[d].horas_bb;
        if (h > 0.05) { soma += h; n++; }
    });
    return n ? soma / n : 0;
}

/* ------------------------------- apuracao -------------------------------- */

/*  SITUACOES
 *    VENCIDA      passou do intervalo previsto
 *    PROXIMA      dentro da tolerancia de vencimento
 *    EM_DIA       executada e ainda dentro do intervalo
 *    SEM_REGISTRO nenhuma execucao lancada - o sistema nao sabe quando venceu
 *    CARTAO       rotina controlada pelo cartao de papel do SMP (diaria e
 *                 semanal). Aparece no quadro para registro e historico, mas
 *                 nao entra em contador nem gera recomendacao: quem cobra a
 *                 ronda diaria e o cartao, e alarme que toca todo dia deixa
 *                 de ser alarme.
 */
const ROTULO_SITUACAO = {
    VENCIDA: "VENCIDA", PROXIMA: "PR\u00d3XIMA", EM_DIA: "EM DIA",
    SEM_REGISTRO: "SEM REGISTRO", CARTAO: "CART\u00c3O SMP"
};

function motoresDaRotina(r, alerta) {
    /* Rotina de cartao vale para a praca de maquinas inteira: uma linha so,
       em vez de duas iguais. As de horimetro precisam ser por motor, porque
       cada motor tem o seu proprio contador. */
    if (!alerta) return ["AMBOS"];
    const m = texto(r.Motor).toUpperCase();
    if (m === "BB") return ["BB"];
    if (m === "BE") return ["BE"];
    return ["BB", "BE"];
}

function apurar() {
    const rotinas = lerCsvNomeado(path.join(PASTA, ARQ_ROTINAS));
    const execucoes = lerCsvNomeado(path.join(PASTA, ARQ_EXEC));
    const estado = lerEstado();

    const acumulado = {
        BB: Number((estado.acumulado || {}).bb_h) || 0,
        BE: Number((estado.acumulado || {}).be_h) || 0
    };
    const ritmo = { BB: ritmoDiario(estado, "BB"), BE: ritmoDiario(estado, "BE") };
    const hoje = dataISO(new Date());

    const itens = [];

    rotinas.forEach(function (r) {
        const id = texto(r.ID); if (!id) return;
        const periodo = paraNumero(r.Periodicidade_h);
        const periodoDias = paraNumero(r.Periodicidade_dias);
        const tolerancia = isFinite(paraNumero(r.Tolerancia_h)) ? paraNumero(r.Tolerancia_h)
            : (isFinite(periodo) ? Math.max(5, periodo * 0.1) : 0);
        const alerta = texto(r.Alerta).toUpperCase() !== "NAO" &&
                       texto(r.Alerta).toUpperCase() !== "N\u00c3O";

        motoresDaRotina(r, alerta).forEach(function (motor) {
            const feitas = execucoes.filter(function (e) {
                if (texto(e.ID_Rotina) !== id) return false;
                const m = texto(e.Motor).toUpperCase();
                return motor === "AMBOS" || m === motor || m === "AMBOS";
            }).sort(function (a, b) { return texto(a.DataHora) < texto(b.DataHora) ? -1 : 1; });

            const ultima = feitas.length ? feitas[feitas.length - 1] : null;
            const horimetroUltima = ultima ? paraNumero(ultima.Horimetro_h) : NaN;
            const dataUltima = ultima ? texto(ultima.DataHora).slice(0, 10) : null;

            /* Referencia por horas. Sem execucao registrada, a referencia passa
               a ser o inicio do registro: o sistema informa que nao sabe, em vez
               de fingir que a rotina acabou de ser feita. */
            const acumMotor = acumulado[motor] === undefined ? null : acumulado[motor];

            let horasDesde = null, horasFaltam = null, percentual = null;
            if (isFinite(periodo) && periodo > 0 && acumMotor !== null) {
                if (isFinite(horimetroUltima)) {
                    horasDesde = Number((acumMotor - horimetroUltima).toFixed(1));
                    horasFaltam = Number((periodo - horasDesde).toFixed(1));
                    percentual = Math.max(0, Math.min(999, Math.round((horasDesde / periodo) * 100)));
                }
            }

            /* Referencia por calendario, para rotinas de periodicidade fixa. */
            let diasDesde = null, diasFaltam = null;
            if (isFinite(periodoDias) && periodoDias > 0 && dataUltima) {
                diasDesde = Math.round((new Date(hoje + "T12:00:00") - new Date(dataUltima + "T12:00:00")) / 86400000);
                diasFaltam = periodoDias - diasDesde;
            }

            let situacao = "SEM_REGISTRO";
            if (!alerta) {
                situacao = "CARTAO";
            } else if (horasFaltam !== null || diasFaltam !== null) {
                const venceuHoras = horasFaltam !== null && horasFaltam <= 0;
                const venceuDias = diasFaltam !== null && diasFaltam <= 0;
                const proximaHoras = horasFaltam !== null && horasFaltam > 0 && horasFaltam <= tolerancia;
                const proximaDias = diasFaltam !== null && diasFaltam > 0 && diasFaltam <= 7;
                situacao = (venceuHoras || venceuDias) ? "VENCIDA"
                    : (proximaHoras || proximaDias) ? "PROXIMA" : "EM_DIA";
            }

            const previsaoDias = (horasFaltam !== null && horasFaltam > 0 && ritmo[motor] > 0.05)
                ? Math.round(horasFaltam / ritmo[motor]) : null;

            itens.push({
                id: id,
                rotina: texto(r.Rotina),
                sistema: texto(r.Sistema),
                motor: motor,
                periodicidade_h: isFinite(periodo) ? periodo : null,
                periodicidade_dias: isFinite(periodoDias) ? periodoDias : null,
                tolerancia_h: tolerancia,
                responsavel: texto(r.Responsavel),
                parametros: texto(r.Parametros),
                descricao: texto(r.Descricao),
                ultima_execucao: dataUltima,
                ultimo_horimetro_h: isFinite(horimetroUltima) ? horimetroUltima : null,
                executante: ultima ? texto(ultima.Executante) : null,
                horimetro_atual_h: acumMotor === null ? null : Number(acumMotor.toFixed(1)),
                alerta: alerta,
                horas_desde_h: horasDesde,
                horas_faltam_h: horasFaltam,
                percentual_consumido: percentual,
                dias_desde: diasDesde,
                dias_faltam: diasFaltam,
                previsao_dias: previsaoDias,
                situacao: situacao,
                situacao_texto: ROTULO_SITUACAO[situacao] || situacao,
                execucoes: feitas.length
            });
        });
    });

    const ordem = { "VENCIDA": 0, "PROXIMA": 1, "SEM_REGISTRO": 2, "EM_DIA": 3, "CARTAO": 4 };
    itens.sort(function (a, b) {
        if (ordem[a.situacao] !== ordem[b.situacao]) return ordem[a.situacao] - ordem[b.situacao];
        const fa = a.horas_faltam_h === null ? 1e9 : a.horas_faltam_h;
        const fb = b.horas_faltam_h === null ? 1e9 : b.horas_faltam_h;
        return fa - fb;
    });

    return { itens: itens, execucoes: execucoes, rotinas: rotinas, acumulado: acumulado, ritmo: ritmo };
}

/* --------------------- efeito da rotina nos parametros ------------------- */

/*  A pergunta que isso responde: a rotina resolveu alguma coisa?
 *
 *  Compara a mediana de cada parametro afetado nos dias anteriores e nos dias
 *  posteriores a execucao, considerando apenas amostras em regime (RPM >= 700),
 *  que e a unica forma de comparar condicao com condicao. Diferenca menor que
 *  o ruido tipico do canal e tratada como "sem mudanca mensuravel" - o sistema
 *  nao inventa melhora que os dados nao mostram.
 */
function apurarEfeitos(execucoes) {
    const limite = new Date(Date.now() - EFEITO_MAX_DIAS * 86400000);
    const saida = [];

    execucoes.forEach(function (e) {
        const dia = texto(e.DataHora).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return;
        if (new Date(dia + "T12:00:00") < limite) return;

        const params = texto(e.Parametros_afetados || e.Parametros || "")
            .split(/[,|]/).map(function (s) { return s.trim(); }).filter(Boolean);
        if (!params.length) return;

        const motor = texto(e.Motor).toUpperCase() === "BE" ? "BE" : "BB";
        const antes = diasAoRedor(dia, JANELA_EFEITO_DIAS, -1);
        const depois = diasAoRedor(dia, JANELA_EFEITO_DIAS, +1);

        params.forEach(function (chave) {
            const p = PARAMETROS[chave]; if (!p) return;
            const a = estatFaixa(antes, motor, chave);
            const d = estatFaixa(depois, motor, chave);
            if (!a || !d) {
                saida.push({
                    id_rotina: texto(e.ID_Rotina), motor: motor, data: dia, parametro: chave,
                    rotulo: p.rotulo, conclusao: "SEM_DADOS", conclusao_texto: "SEM DADOS",
                    detalhe: "Amostragem insuficiente em regime nos dias comparados."
                });
                return;
            }

            /* Canal sem leitura valida (transdutor fora de servico) nao permite
               concluir nada sobre o efeito da rotina. Dizer "sem mudanca" aqui
               seria transformar falha de instrumento em avaliacao de servico. */
            if (a.mediana === 0 && d.mediana === 0) {
                saida.push({
                    id_rotina: texto(e.ID_Rotina), motor: motor, data: dia, parametro: chave,
                    rotulo: p.rotulo, conclusao: "SEM_DADOS", conclusao_texto: "SEM DADOS",
                    detalhe: p.rotulo + " permaneceu em zero antes e depois: canal sem leitura " +
                        "v\u00e1lida. Sem valor de refer\u00eancia, o efeito da rotina n\u00e3o pode ser avaliado."
                });
                return;
            }

            const delta = d.mediana - a.mediana;
            let conclusao, conclusaoTexto;
            if (Math.abs(delta) < p.ruido) { conclusao = "SEM_MUDANCA"; conclusaoTexto = "SEM MUDAN\u00c7A"; }
            else if (p.direcao === 0) { conclusao = "MUDOU"; conclusaoTexto = "MUDOU"; }
            else if (delta * p.direcao > 0) { conclusao = "MELHOROU"; conclusaoTexto = "MELHOROU"; }
            else { conclusao = "PIOROU"; conclusaoTexto = "PIOROU"; }

            saida.push({
                id_rotina: texto(e.ID_Rotina), motor: motor, data: dia, parametro: chave,
                rotulo: p.rotulo, unidade: p.unidade,
                antes: Number(a.mediana.toFixed(2)), depois: Number(d.mediana.toFixed(2)),
                delta: Number(delta.toFixed(2)),
                amostras_antes: a.n, amostras_depois: d.n,
                conclusao: conclusao, conclusao_texto: conclusaoTexto,
                detalhe: p.rotulo + " passou de " + a.mediana.toFixed(2) + " para " + d.mediana.toFixed(2) +
                    " " + p.unidade + " (mediana em regime, " + JANELA_EFEITO_DIAS + " dias antes e depois)."
            });
        });
    });

    return saida;
}

/* ------------------------- recomendacoes derivadas ----------------------- */

function montarRecomendacoes(itens, efeitos) {
    const rec = [];

    itens.filter(function (i) { return i.situacao === "VENCIDA"; }).forEach(function (i) {
        rec.push({
            prioridade: "ALTA",
            titulo: "Rotina vencida: " + i.rotina + " (" + i.motor + ")",
            detalhe: "Prevista a cada " + i.periodicidade_h + " h de funcionamento. J\u00e1 acumula " +
                (i.horas_desde_h === null ? "per\u00edodo desconhecido" : i.horas_desde_h + " h") +
                " desde a \u00faltima execu\u00e7\u00e3o registrada" +
                (i.ultima_execucao ? " em " + i.ultima_execucao.split("-").reverse().join("/") : "") +
                ". Programar a execu\u00e7\u00e3o e registr\u00e1-la na aba Manuten\u00e7\u00e3o.",
            motor: "MCP " + i.motor, responsavel: i.responsavel || "Encarregado de M\u00e1quinas",
            origem: "manutencao"
        });
    });

    itens.filter(function (i) { return i.situacao === "PROXIMA"; }).forEach(function (i) {
        rec.push({
            prioridade: "ROTINA",
            titulo: "Programar: " + i.rotina + " (" + i.motor + ")",
            detalhe: "Faltam " + i.horas_faltam_h + " h de funcionamento" +
                (i.previsao_dias !== null ? ", cerca de " + i.previsao_dias + " dia(s) no ritmo atual de uso" : "") +
                ". Providenciar sobressalente e janela de indisponibilidade.",
            motor: "MCP " + i.motor, responsavel: i.responsavel || "Encarregado de M\u00e1quinas",
            origem: "manutencao"
        });
    });

    /* Rotinas sem execucao registrada viram UMA recomendacao, e nao uma por
       rotina: no primeiro uso do modulo praticamente todas estao nessa
       condicao, e uma lista de vinte itens iguais so faz o leitor parar de
       ler as recomendacoes. */
    const semReg = itens.filter(function (i) { return i.situacao === "SEM_REGISTRO"; });
    if (semReg.length) {
        const nomes = [];
        semReg.forEach(function (i) {
            const n = i.id + " " + i.rotina;
            if (nomes.indexOf(n) < 0) nomes.push(n);
        });
        rec.push({
            prioridade: "ROTINA",
            titulo: "Lan\u00e7ar a \u00faltima execu\u00e7\u00e3o de " + semReg.length + " rotina(s)",
            detalhe: "Sem a data e o hor\u00edmetro da \u00faltima execu\u00e7\u00e3o, o sistema n\u00e3o tem como prever " +
                "vencimento e informa \u0027sem registro\u0027 em vez de supor uma data. Pendentes: " +
                nomes.slice(0, 6).join("; ") + (nomes.length > 6 ? " e mais " + (nomes.length - 6) + "." : "."),
            motor: "MCP BB / MCP BE", responsavel: "Encarregado de M\u00e1quinas",
            origem: "manutencao"
        });
    }

    efeitos.filter(function (f) { return f.conclusao === "PIOROU" || f.conclusao === "SEM_MUDANCA"; })
        .forEach(function (f) {
            rec.push({
                prioridade: f.conclusao === "PIOROU" ? "ALTA" : "ROTINA",
                titulo: (f.conclusao === "PIOROU" ? "Par\u00e2metro piorou ap\u00f3s " : "Sem efeito mensur\u00e1vel de ") +
                    f.id_rotina + " (" + f.motor + ")",
                detalhe: f.detalhe + " Confrontar com o servi\u00e7o executado e com o registro do livro de m\u00e1quinas.",
                motor: "MCP " + f.motor, responsavel: "Encarregado de M\u00e1quinas",
                origem: "manutencao"
            });
        });

    return rec;
}

/* ------------------------------ registro --------------------------------- */

/* O nó "file" do Node-RED grava a execucao acrescentando uma linha ao
   arquivo. Se o arquivo ainda nao existir, ele seria criado sem cabecalho e
   a primeira execucao registrada viraria cabecalho na leitura seguinte.
   Por isso o apurador garante o arquivo com cabecalho a cada rodada. */
const CABECALHO_EXEC = ["DataHora", "ID_Rotina", "Motor", "Horimetro_h", "Executante",
    "Observacao", "Itens", "Parametros_afetados", "Origem"].join(";");

function garantirArquivoExecucoes() {
    const caminho = path.join(PASTA, ARQ_EXEC);
    if (!fs.existsSync(caminho)) {
        fs.writeFileSync(caminho, CABECALHO_EXEC + "\r\n", "utf8");
    }
}

function registrar(args) {
    const estado = lerEstado();
    const motor = texto(args.motor).toUpperCase() === "BE" ? "BE" : "BB";
    const acumulado = motor === "BE" ? (estado.acumulado || {}).be_h : (estado.acumulado || {}).bb_h;

    const agora = new Date();
    const carimbo = dataISO(agora) + " " + dois(agora.getHours()) + ":" + dois(agora.getMinutes()) + ":" + dois(agora.getSeconds());

    const rotinas = lerCsvNomeado(path.join(PASTA, ARQ_ROTINAS));
    const cat = rotinas.filter(function (r) { return texto(r.ID) === texto(args.id); })[0] || {};

    const linha = [
        campoCsv(args.data ? texto(args.data) : carimbo),
        campoCsv(texto(args.id)),
        campoCsv(motor),
        campoCsv(isFinite(Number(acumulado)) ? Number(acumulado).toFixed(1) : ""),
        campoCsv(texto(args.executante)),
        campoCsv(texto(args.obs)),
        campoCsv(texto(args.itens)),
        campoCsv(texto(cat.Parametros || "")),
        campoCsv(texto(args.origem || "dashboard"))
    ].join(";");

    garantirArquivoExecucoes();
    const caminho = path.join(PASTA, ARQ_EXEC);
    fs.appendFileSync(caminho, linha + "\r\n", "utf8");
    if (!args.json) console.log("Registrado: " + texto(args.id) + " / MCP " + motor + " / horimetro " + acumulado + " h");
}

/* -------------------------------- main ----------------------------------- */

function gravarStatus() {
    const a = apurar();
    const efeitos = apurarEfeitos(a.execucoes);
    const rec = montarRecomendacoes(a.itens, efeitos);

    const status = {
        gerado_em: new Date().toISOString(),
        horimetro: a.acumulado,
        ritmo_diario_h: { BB: Number(a.ritmo.BB.toFixed(2)), BE: Number(a.ritmo.BE.toFixed(2)) },
        resumo: {
            vencidas: a.itens.filter(function (i) { return i.situacao === "VENCIDA"; }).length,
            proximas: a.itens.filter(function (i) { return i.situacao === "PROXIMA"; }).length,
            sem_registro: a.itens.filter(function (i) { return i.situacao === "SEM_REGISTRO"; }).length,
            em_dia: a.itens.filter(function (i) { return i.situacao === "EM_DIA"; }).length,
            cartao: a.itens.filter(function (i) { return i.situacao === "CARTAO"; }).length,
            total: a.itens.length
        },
        itens: a.itens,
        efeitos: efeitos,
        recomendacoes: rec,
        catalogo_rotinas: a.rotinas.length,
        execucoes_registradas: a.execucoes.length
    };

    const tmp = path.join(PASTA, ARQ_STATUS) + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(status, null, 2), "utf8");
    fs.renameSync(tmp, path.join(PASTA, ARQ_STATUS));
    return status;
}

function principal(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.indexOf("--") === 0) {
            const chave = a.slice(2); const prox = argv[i + 1];
            args[chave] = (prox && prox.indexOf("--") !== 0 && prox.indexOf("=") < 0) ? (i++, prox) : true;
        } else if (a.indexOf("=") > 0) {
            const k = a.slice(0, a.indexOf("="));
            args[k] = a.slice(a.indexOf("=") + 1);
        }
    }

    const jsonMode = !!args.json;
    const log = jsonMode ? function () { } : console.log;

    garantirArquivoExecucoes();

    if (args.registrar) { registrar(args); }

    const status = gravarStatus();

    if (args.lista || args.registrar) {
        log("");
        log("HORIMETRO  BB " + status.horimetro.BB + " h   BE " + status.horimetro.BE + " h");
        log("ROTINAS    " + status.resumo.vencidas + " vencida(s) · " + status.resumo.proximas +
            " proxima(s) · " + status.resumo.sem_registro + " sem registro · " + status.resumo.em_dia +
            " em dia · " + status.resumo.cartao + " no cartao");
        log("");
        status.itens.forEach(function (i) {
            log(
                ((i.situacao_texto || i.situacao) + "             ").slice(0, 14) +
                (i.id + "          ").slice(0, 10) +
                ((i.motor === "AMBOS" ? "AMBOS" : "MCP " + i.motor) + "   ").slice(0, 9) +
                (i.rotina + "                                        ").slice(0, 42) +
                (i.horas_faltam_h === null ? "  faltam ?" : "  faltam " + i.horas_faltam_h + " h") +
                (i.previsao_dias !== null ? "  (~" + i.previsao_dias + " d)" : "")
            );
        });
        if (status.efeitos.length) {
            log("");
            log("EFEITO DAS ROTINAS");
            status.efeitos.forEach(function (f) {
                log("  " + f.data + "  " + f.id_rotina + "  MCP " + f.motor + "  " +
                    f.rotulo + ": " + (f.conclusao_texto || f.conclusao) + (f.delta !== undefined ? "  (" + f.delta + " " + f.unidade + ")" : ""));
            });
        }
    }

    log("");
    log("Status gravado em " + path.join(PASTA, ARQ_STATUS));

    if (jsonMode) process.stdout.write(JSON.stringify(status));
}

if (require.main === module) {
    try { principal(process.argv.slice(2)); }
    catch (e) { console.error("ERRO: " + e.message); process.exit(1); }
}

module.exports = { apurar: apurar, apurarEfeitos: apurarEfeitos, gravarStatus: gravarStatus };
