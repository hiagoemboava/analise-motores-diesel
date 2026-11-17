/* ============================================================================
   NEREUS - MOTOR DE HORIMETRO E HISTORICO
   ----------------------------------------------------------------------------
   Le os CSV diarios gravados pelo Node-RED em C:\Dados_Motor e apura, por
   integracao do tempo real entre amostras, quantas horas cada MCP funcionou.

   Por que um script separado e nao uma funcao do Node-RED:
     - varrer arquivos de varios MB nao pode bloquear o laco de eventos do
       Node-RED, que ao mesmo tempo esta lendo Modbus a cada segundo;
     - o resultado passa a ser auditavel: qualquer pessoa roda o script na mao
       e confere o numero que saiu no relatorio;
     - o historico deixa de depender de contador em memoria, que zera a cada
       deploy. As horas passam a ser reconstruidas do proprio registro.

   USO
     node nereus_horimetro.js --dia hoje
     node nereus_horimetro.js --dia ontem
     node nereus_horimetro.js --dia 2026-08-18
     node nereus_horimetro.js --todos                 (reprocessa o historico)
     node nereus_horimetro.js --calibrar bb=1234.5 be=1180.2
     node nereus_horimetro.js --consulta 2026-08-01:2026-08-19

   SAIDAS
     C:\Dados_Motor\horimetro_diario.csv   uma linha por dia apurado
     C:\Dados_Motor\nereus_estado.json     base de calibracao + acumulado
   ========================================================================== */

"use strict";

const fs = require("fs");
const path = require("path");

/* --------------------------- parametros fixos --------------------------- */

const PASTA = process.env.NEREUS_PASTA || "C:\\Dados_Motor";
const PREFIXO = "motor_diesel_";
const RPM_MINIMO_OPERANDO = 200;   // abaixo disso o motor nao conta hora
const LACUNA_MAXIMA_S = 60;        // intervalo maior que isso nao e contado
const ARQ_DIARIO = "horimetro_diario.csv";
const ARQ_ESTADO = "nereus_estado.json";

const CABECALHO_PADRAO = [
    "DataHora",
    "Temp_OL_BB_C", "Temp_Agua_BB_C", "Pressao_OL_BB_bar", "Rotacao_MCP_BB_RPM",
    "Temp_OL_BE_C", "Temp_Agua_BE_C", "Pressao_OL_BE_bar", "Rotacao_MCP_BE_RPM",
    "Estado_BB", "Severidade_BB", "Criticos_BB", "Atencao_Alta_BB", "Atencao_BB", "Avisos_BB", "Informativos_BB",
    "Estado_BE", "Severidade_BE", "Criticos_BE", "Atencao_Alta_BE", "Atencao_BE", "Avisos_BE", "Informativos_BE",
    "Horimetro_BB_h", "Horimetro_BE_h",
    "Taxa_Temp_OL_BB_C_min", "Taxa_Temp_Agua_BB_C_min", "Taxa_Pressao_OL_BB_bar_min", "Taxa_RPM_BB_rpm_min",
    "Taxa_Temp_OL_BE_C_min", "Taxa_Temp_Agua_BE_C_min", "Taxa_Pressao_OL_BE_bar_min", "Taxa_RPM_BE_rpm_min",
    "Severidade_Geral", "Status_Comunicacao", "Canais_Inoperantes", "Canais_Suspeitos",
    "Disponibilidade_Enlace_pct", "Recomendacao_Prioritaria"
];

/* ------------------------------ utilitarios ------------------------------ */

function dois(n) { return n < 10 ? "0" + n : "" + n; }

function dataISO(d) {
    return d.getFullYear() + "-" + dois(d.getMonth() + 1) + "-" + dois(d.getDate());
}

function resolveDia(pedido) {
    if (!pedido || pedido === "hoje") return dataISO(new Date());
    if (pedido === "ontem") return dataISO(new Date(Date.now() - 86400000));
    if (/^\d{4}-\d{2}-\d{2}$/.test(pedido)) return pedido;
    throw new Error("Dia invalido: " + pedido);
}

/* Divide uma linha CSV com separador ";" respeitando aspas duplas. */
function dividir(linha) {
    const campos = [];
    let atual = "";
    let dentroAspas = false;
    for (let i = 0; i < linha.length; i++) {
        const c = linha[i];
        if (c === '"') {
            if (dentroAspas && linha[i + 1] === '"') { atual += '"'; i++; }
            else { dentroAspas = !dentroAspas; }
        } else if (c === ";" && !dentroAspas) {
            campos.push(atual); atual = "";
        } else {
            atual += c;
        }
    }
    campos.push(atual);
    return campos;
}

function paraNumero(txt) {
    if (txt === undefined || txt === null) return NaN;
    const s = String(txt).trim().replace(/^"|"$/g, "").replace(",", ".");
    if (s === "") return NaN;
    const n = Number(s);
    return isFinite(n) ? n : NaN;
}

/* "2026-08-18 14:14:09" -> ms locais. Formato proprio evita surpresa de fuso. */
function paraMs(txt) {
    const m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(String(txt));
    if (!m) return NaN;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
}

/* ------------------------- apuracao de um arquivo ------------------------- */

/*  Regra de apuracao das horas de funcionamento
 *
 *  Para cada par de amostras consecutivas, o intervalo entre elas so e
 *  creditado ao motor se, na amostra inicial, a rotacao estava igual ou acima
 *  de RPM_MINIMO_OPERANDO. Intervalos acima de LACUNA_MAXIMA_S sao descartados
 *  porque representam periodo sem supervisao (Node-RED parado, enlace mudo,
 *  computador desligado) e nada garante que o motor estivesse girando.
 *
 *  Isso substitui a contagem por "numero de amostras x intervalo nominal", que
 *  erra sempre que o intervalo de gravacao muda, e o contador incremental em
 *  memoria, que zera a cada deploy.
 */
function apurarArquivo(caminho) {
    const bruto = fs.readFileSync(caminho, "utf8");
    const linhas = bruto.split(/\r?\n/);

    let indice = null;
    const amostras = [];

    for (let i = 0; i < linhas.length; i++) {
        const linha = linhas[i];
        if (!linha || linha.trim() === "") continue;

        const campos = dividir(linha);
        const primeiro = String(campos[0]).replace(/^"|"$/g, "").trim();

        /* Cabecalho: pode aparecer no meio do arquivo depois de um restart. */
        if (primeiro === "DataHora") {
            indice = {};
            campos.forEach(function (c, k) { indice[c.replace(/^"|"$/g, "").trim()] = k; });
            continue;
        }

        /* Arquivo que comeca sem cabecalho: aplica o layout conhecido. */
        if (indice === null) {
            indice = {};
            CABECALHO_PADRAO.forEach(function (c, k) { indice[c] = k; });
        }

        const ms = paraMs(primeiro);
        if (!isFinite(ms)) continue;

        amostras.push({
            ms: ms,
            rpmBB: paraNumero(campos[indice["Rotacao_MCP_BB_RPM"]]),
            rpmBE: paraNumero(campos[indice["Rotacao_MCP_BE_RPM"]]),
            sevGeral: String(campos[indice["Severidade_Geral"]] || "").replace(/^"|"$/g, "").trim()
        });
    }

    amostras.sort(function (a, b) { return a.ms - b.ms; });

    let segundosBB = 0, segundosBE = 0, segundosCobertos = 0, segundosLacuna = 0, lacunas = 0;

    for (let i = 0; i < amostras.length - 1; i++) {
        const dt = (amostras[i + 1].ms - amostras[i].ms) / 1000;
        if (dt <= 0) continue;                       // amostra duplicada no mesmo segundo
        if (dt > LACUNA_MAXIMA_S) {
            lacunas++;
            segundosLacuna += dt;
            continue;
        }
        segundosCobertos += dt;
        if (isFinite(amostras[i].rpmBB) && amostras[i].rpmBB >= RPM_MINIMO_OPERANDO) segundosBB += dt;
        if (isFinite(amostras[i].rpmBE) && amostras[i].rpmBE >= RPM_MINIMO_OPERANDO) segundosBE += dt;
    }

    const intervalos = [];
    for (let i = 0; i < amostras.length - 1; i++) {
        const dt = (amostras[i + 1].ms - amostras[i].ms) / 1000;
        if (dt > 0 && dt <= LACUNA_MAXIMA_S) intervalos.push(dt);
    }
    intervalos.sort(function (a, b) { return a - b; });
    const intervaloMediano = intervalos.length ? intervalos[Math.floor(intervalos.length / 2)] : 0;

    return {
        registros: amostras.length,
        primeira: amostras.length ? new Date(amostras[0].ms) : null,
        ultima: amostras.length ? new Date(amostras[amostras.length - 1].ms) : null,
        horas_bb: segundosBB / 3600,
        horas_be: segundosBE / 3600,
        horas_cobertas: segundosCobertos / 3600,
        lacunas: lacunas,
        minutos_lacuna: segundosLacuna / 60,
        intervalo_mediano_s: intervaloMediano
    };
}

/* ------------------------------ estado ----------------------------------- */

function caminhoEstado() { return path.join(PASTA, ARQ_ESTADO); }

function lerEstado() {
    try {
        const j = JSON.parse(fs.readFileSync(caminhoEstado(), "utf8"));
        j.base = j.base || { bb_h: 0, be_h: 0, data: null, observacao: "" };
        j.dias = j.dias || {};
        return j;
    } catch (e) {
        return {
            versao: 1,
            base: { bb_h: 0, be_h: 0, data: null, observacao: "sem calibracao" },
            dias: {},
            acumulado: { bb_h: 0, be_h: 0 },
            atualizado_em: null
        };
    }
}

function gravarEstado(estado) {
    estado.atualizado_em = new Date().toISOString();
    const tmp = caminhoEstado() + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(estado, null, 2), "utf8");
    fs.renameSync(tmp, caminhoEstado());
}

function recalcularAcumulado(estado) {
    let bb = 0, be = 0;
    Object.keys(estado.dias).forEach(function (d) {
        bb += Number(estado.dias[d].horas_bb) || 0;
        be += Number(estado.dias[d].horas_be) || 0;
    });
    estado.soma_registrada = { bb_h: Number(bb.toFixed(2)), be_h: Number(be.toFixed(2)) };
    estado.acumulado = {
        bb_h: Number(((Number(estado.base.bb_h) || 0) + bb).toFixed(2)),
        be_h: Number(((Number(estado.base.be_h) || 0) + be).toFixed(2))
    };
    return estado;
}

/* --------------------------- planilha diaria ----------------------------- */

function gravarPlanilhaDiaria(estado) {
    const cab = [
        "Data", "Horas_BB", "Horas_BE", "Acumulado_BB_h", "Acumulado_BE_h",
        "Registros", "Primeira_Amostra", "Ultima_Amostra",
        "Horas_Cobertas", "Lacunas", "Minutos_Sem_Aquisicao", "Intervalo_Mediano_s", "Apurado_Em"
    ].join(";");

    const dias = Object.keys(estado.dias).sort();
    let accBB = Number(estado.base.bb_h) || 0;
    let accBE = Number(estado.base.be_h) || 0;

    const linhas = dias.map(function (d) {
        const r = estado.dias[d];
        accBB += Number(r.horas_bb) || 0;
        accBE += Number(r.horas_be) || 0;
        return [
            d,
            (Number(r.horas_bb) || 0).toFixed(2),
            (Number(r.horas_be) || 0).toFixed(2),
            accBB.toFixed(2),
            accBE.toFixed(2),
            r.registros,
            r.primeira || "",
            r.ultima || "",
            (Number(r.horas_cobertas) || 0).toFixed(2),
            r.lacunas,
            (Number(r.minutos_lacuna) || 0).toFixed(1),
            r.intervalo_mediano_s,
            r.apurado_em || ""
        ].join(";");
    });

    fs.writeFileSync(path.join(PASTA, ARQ_DIARIO), cab + "\r\n" + linhas.join("\r\n") + "\r\n", "utf8");
}

/* ------------------------------ operacoes -------------------------------- */

function arquivoDoDia(dia) { return path.join(PASTA, PREFIXO + dia + ".csv"); }

function listarDias() {
    return fs.readdirSync(PASTA)
        .filter(function (f) { return f.indexOf(PREFIXO) === 0 && /\.csv$/i.test(f); })
        .map(function (f) { return f.slice(PREFIXO.length, PREFIXO.length + 10); })
        .filter(function (d) { return /^\d{4}-\d{2}-\d{2}$/.test(d); })
        .sort();
}

function apurarDia(estado, dia, silencioso) {
    const caminho = arquivoDoDia(dia);
    if (!fs.existsSync(caminho)) {
        if (!silencioso) console.log("Sem arquivo para " + dia + " (" + caminho + ")");
        return null;
    }
    const r = apurarArquivo(caminho);
    estado.dias[dia] = {
        horas_bb: Number(r.horas_bb.toFixed(3)),
        horas_be: Number(r.horas_be.toFixed(3)),
        registros: r.registros,
        primeira: r.primeira ? r.primeira.toTimeString().slice(0, 8) : "",
        ultima: r.ultima ? r.ultima.toTimeString().slice(0, 8) : "",
        horas_cobertas: Number(r.horas_cobertas.toFixed(3)),
        lacunas: r.lacunas,
        minutos_lacuna: Number(r.minutos_lacuna.toFixed(1)),
        intervalo_mediano_s: r.intervalo_mediano_s,
        apurado_em: new Date().toISOString()
    };
    if (!silencioso) {
        console.log(dia + "  BB " + r.horas_bb.toFixed(2) + " h   BE " + r.horas_be.toFixed(2) +
            " h   (" + r.registros + " registros, " + r.lacunas + " lacunas)");
    }
    return estado.dias[dia];
}

/* -------------------------------- main ----------------------------------- */

function principal(argv) {
    const args = {};
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a.indexOf("--") === 0) {
            const chave = a.slice(2);
            const prox = argv[i + 1];
            /* "--calibrar bb=1234" nao consome o par chave=valor como valor da flag */
            args[chave] = (prox && prox.indexOf("--") !== 0 && prox.indexOf("=") < 0) ? prox : true;
            if (args[chave] !== true) i++;
        } else if (a.indexOf("=") > 0) {
            args[a.slice(0, a.indexOf("="))] = a.slice(a.indexOf("=") + 1);
        }
    }

    const jsonMode = !!args.json;
    const log = jsonMode ? function () { } : console.log;

    const estado = lerEstado();

    if (args.calibrar) {
        /* Alinha o horimetro do sistema ao contador oficial do motor. A base
           passa a valer a partir dos dias ja apurados: o acumulado do sistema
           e sempre base + soma dos dias em registro. */
        const bb = paraNumero(args.bb);
        const be = paraNumero(args.be);
        if (!isFinite(bb) || !isFinite(be)) {
            console.error("Informe as duas horas: --calibrar bb=1234.5 be=1180.2");
            process.exit(2);
        }
        let somaBB = 0, somaBE = 0;
        Object.keys(estado.dias).forEach(function (d) {
            somaBB += Number(estado.dias[d].horas_bb) || 0;
            somaBE += Number(estado.dias[d].horas_be) || 0;
        });
        estado.base = {
            bb_h: Number((bb - somaBB).toFixed(2)),
            be_h: Number((be - somaBE).toFixed(2)),
            data: new Date().toISOString().slice(0, 10),
            observacao: args.obs || "calibracao contra o contador oficial",
            informado: { bb_h: bb, be_h: be }
        };
        recalcularAcumulado(estado);
        gravarEstado(estado);
        gravarPlanilhaDiaria(estado);
        log("Calibrado. Acumulado agora: BB " + estado.acumulado.bb_h + " h / BE " + estado.acumulado.be_h + " h");
        if (jsonMode) process.stdout.write(JSON.stringify(estado));
        return;
    }

    if (args.consulta) {
        const faixa = String(args.consulta).split(":");
        const de = faixa[0], ate = faixa[1] || faixa[0];
        let bb = 0, be = 0, n = 0;
        Object.keys(estado.dias).sort().forEach(function (d) {
            if (d >= de && d <= ate) {
                bb += estado.dias[d].horas_bb; be += estado.dias[d].horas_be; n++;
                log("  " + d + "  BB " + estado.dias[d].horas_bb.toFixed(2) +
                    "  BE " + estado.dias[d].horas_be.toFixed(2));
            }
        });
        log("TOTAL " + de + " a " + ate + " (" + n + " dias): BB " + bb.toFixed(2) + " h / BE " + be.toFixed(2) + " h");
        return;
    }

    if (args.todos) {
        const dias = listarDias();
        log("Reprocessando " + dias.length + " arquivo(s) de " + PASTA);
        dias.forEach(function (d) { apurarDia(estado, d, jsonMode); });
    } else {
        const dia = resolveDia(args.dia === true ? "hoje" : args.dia);
        apurarDia(estado, dia, jsonMode);
    }

    recalcularAcumulado(estado);
    gravarEstado(estado);
    gravarPlanilhaDiaria(estado);

    log("");
    log("Base de calibracao ....... BB " + estado.base.bb_h + " h   BE " + estado.base.be_h + " h");
    log("Somado dos registros ..... BB " + estado.soma_registrada.bb_h + " h   BE " + estado.soma_registrada.be_h + " h");
    log("HORIMETRO ACUMULADO ...... BB " + estado.acumulado.bb_h + " h   BE " + estado.acumulado.be_h + " h");
    log("Estado gravado em " + caminhoEstado());

    /* Saida de maquina: o fluxo do Node-RED chama com --json e le o
       estado direto do stdout, sem precisar abrir o arquivo. */
    if (jsonMode) process.stdout.write(JSON.stringify(estado));
}

if (require.main === module) {
    try {
        principal(process.argv.slice(2));
    } catch (e) {
        console.error("ERRO: " + e.message);
        process.exit(1);
    }
}

module.exports = { apurarArquivo: apurarArquivo, lerEstado: lerEstado, RPM_MINIMO_OPERANDO: RPM_MINIMO_OPERANDO, LACUNA_MAXIMA_S: LACUNA_MAXIMA_S };
