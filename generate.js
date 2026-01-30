/**
 * Gera juros.ics com:
 * - COPOM: taxa (SGS 432 = Meta Selic), média 12m (12 últimas decisões),
 *          expectativa/perspectivas via API Expectativas (Olinda/BCB)
 * - FED: agenda (2025/2026) + placeholders (a gente automatiza depois)
 *
 * Saída: ./juros.ics
 */

import fs from "fs";

const OUT_FILE = "juros.ics";

// ===== Ajuste aqui se quiser =====
const TZ_SP = "America/Sao_Paulo";
const PRODID = "-//Calendario Taxa de Juros//PT-BR//v3.0";
const CALNAME = "📈 Taxa de Juros (FED + COPOM)";

// COPOM decisões (dia da decisão) — 2025 e 2026
// (copom decide no 2º dia; aqui já listamos o dia de decisão)
const COPOM_DATES = [
  "2025-01-29","2025-03-19","2025-05-07","2025-06-18","2025-07-30","2025-09-17","2025-10-29","2025-12-10",
  "2026-01-28","2026-03-18","2026-04-29","2026-06-17","2026-08-05","2026-09-16","2026-11-04","2026-12-09"
];

// FED (FOMC) decisões — 2025 e 2026 (datas do calendário oficial; horário típico 14:00 ET)
// OBS: preencher automaticamente “taxa divulgada” do Fed exige outra fonte/integração.
// Por ora: agenda + perspectiva via mercado (placeholder).
const FOMC_DATES = [
  "2025-01-29","2025-03-19","2025-05-07","2025-06-18","2025-07-30","2025-09-17","2025-10-29","2025-12-10",
  "2026-01-28","2026-03-18","2026-04-29","2026-06-17","2026-07-29","2026-09-16","2026-10-28","2026-12-09"
];

// ===== Utilidades ICS =====
const pad = (n) => String(n).padStart(2, "0");
const toICSDate = (yyyy_mm_dd) => yyyy_mm_dd.replaceAll("-", "");
const escapeICS = (s) =>
  String(s)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");

function dtstampNowUTC() {
  const d = new Date();
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// ===== HTTP helpers =====
async function fetchJSON(url) {
  const res = await fetch(url, { headers: { "accept": "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} - ${url}`);
  return res.json();
}

// ===== BCB SGS (Meta Selic) =====
// Série 432 = Meta Selic (a.a.) — melhor para “taxa divulgada” do Copom
async function getMetaSelicSeries(dateStart, dateEnd) {
  const di = formatBR(dateStart);
  const df = formatBR(dateEnd);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json&dataInicial=${encodeURIComponent(di)}&dataFinal=${encodeURIComponent(df)}`;
  // retorna [{data:"dd/mm/aaaa", valor:"x.xx"}]
  return fetchJSON(url);
}

function formatBR(yyyy_mm_dd) {
  const [y,m,d] = yyyy_mm_dd.split("-");
  return `${d}/${m}/${y}`;
}
function brToISO(dd_mm_yyyy) {
  const [d,m,y] = dd_mm_yyyy.split("/");
  return `${y}-${m}-${d}`;
}

// pega o último valor <= date (ISO)
function valueAtOrBefore(series, isoDate) {
  // series: [{data, valor}] (data BR)
  let best = null;
  for (const row of series) {
    const iso = brToISO(row.data);
    if (iso <= isoDate) best = row;
    else break;
  }
  return best ? Number(String(best.valor).replace(",", ".")) : null;
}

// ===== Expectativas (Olinda/BCB) =====
// Usaremos mediana de Selic (estatísticas) como proxy de “perspectiva do mercado”.
// Doc: serviço Expectativas, recurso Selic (OData/Olinda).
async function getSelicExpectationMedian(latestOnly = true) {
  // busca as últimas estatísticas disponíveis (ordenando por data-base)
  // Endpoint de estatísticas (retorna mediana, média etc.)
  const base = "https://olinda.bcb.gov.br/olinda/servico/Expectativas/versao/v1/odata/ExpectativasMercadoSelic";
  const query = latestOnly
    ? `?$top=1&$orderby=Data desc&$format=json`
    : `?$top=50&$orderby=Data desc&$format=json`;
  const url = base + query;
  const json = await fetchJSON(url);
  const row = json?.value?.[0];
  // campos variam; tentamos pegar a "Mediana"
  const mediana =
    row?.Mediana ?? row?.mediana ?? row?.MEDIANA ?? null;
  const data =
    row?.Data ?? row?.data ?? row?.DATA ?? null;
  return { mediana, data };
}

// ===== Lógica de classificação =====
function classifySurprise(actual, expected, tolerance = 0.01) {
  if (actual == null || expected == null) return "A PREENCHER";
  if (Math.abs(actual - expected) <= tolerance) return "dentro do esperado";
  return actual > expected ? "acima do esperado" : "abaixo do esperado";
}

// ===== Build descrição no formato que você pediu =====
function buildDescription({ taxa, expectativa, media12m, perspectivas }) {
  return [
    `taxa divulgada: ${taxa}`,
    `expectativa: ${expectativa}`,
    `média últimos 12 meses: ${media12m}`,
    `perspectivas: ${perspectivas}`
  ].join("\n");
}

// ===== Main =====
async function main() {
  // Para média 12m do Copom: vamos usar as 12 últimas DECISÕES (não 12 meses corridos)
  // Primeiro: baixar Meta Selic num range que cubra 2024-2026 para garantir valores.
  const sgs = await getMetaSelicSeries("2024-01-01", "2026-12-31");

  // Expectativa (proxy): última mediana disponível
  const exp = await getSelicExpectationMedian(true);
  const expectedMedian = exp?.mediana != null ? Number(exp.mediana) : null;
  const expectedTextForFuture =
    expectedMedian != null
      ? `mediana atual (Expectativas BCB): ${expectedMedian.toFixed(2)}% a.a.`
      : "A PREENCHER";

  // Pré-calcula taxas por decisão Copom (Meta Selic na data)
  const copomRates = COPOM_DATES.map((d) => valueAtOrBefore(sgs, d));

  // Função para média das últimas 12 decisões até aquela data (inclui a própria, se já houver)
  function avgLast12(index) {
    const slice = copomRates
      .slice(0, index + 1)
      .filter((v) => typeof v === "number" && !Number.isNaN(v));
    const last = slice.slice(-12);
    if (!last.length) return null;
    return last.reduce((a,b)=>a+b,0) / last.length;
  }

  // ===== Monta ICS =====
  let ics = "";
  ics += "BEGIN:VCALENDAR\r\n";
  ics += "VERSION:2.0\r\n";
  ics += `PRODID:${escapeICS(PRODID)}\r\n`;
  ics += "CALSCALE:GREGORIAN\r\n";
  ics += "METHOD:PUBLISH\r\n";
  ics += `X-WR-CALNAME:${escapeICS(CALNAME)}\r\n`;
  ics += `X-WR-TIMEZONE:${escapeICS(TZ_SP)}\r\n`;

  const dtstamp = dtstampNowUTC();

  // ---- COPOM eventos (com taxa + média + expectativa/perspectiva) ----
  for (let i = 0; i < COPOM_DATES.length; i++) {
    const date = COPOM_DATES[i];
    const actual = copomRates[i];
    const avg12 = avgLast12(i);

    const isPastOrToday = date <= new Date().toISOString().slice(0,10);

    // “expectativa”:
    // - se passado: compara com mediana (proxy) -> acima/abaixo/dentro
    // - se futuro: usa “mediana atual” como referência (texto)
    const expectation =
      isPastOrToday && actual != null && expectedMedian != null
        ? classifySurprise(actual, expectedMedian, 0.01)
        : "A PREENCHER";

    const taxaText = actual != null ? `${actual.toFixed(2)}% a.a.` : "a divulgar";
    const mediaText = avg12 != null ? `${avg12.toFixed(2)}% a.a.` : "A CALCULAR";

    const perspectivasText =
      isPastOrToday
        ? "A PREENCHER (atualizar após comunicado/ata)"
        : expectedTextForFuture;

    const desc = buildDescription({
      taxa: taxaText,
      expectativa,
      media12m: mediaText,
      perspectivas: perspectivasText
    });

    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${escapeICS(`copom-rate-${date}@juros`)}\r\n`;
    ics += `DTSTAMP:${dtstamp}\r\n`;
    // Copom: dia inteiro (mais estável no iOS) + “após fechamento” no título
    ics += `DTSTART;VALUE=DATE:${toICSDate(date)}\r\n`;
    // DTEND exclusivo (dia seguinte)
    const [y,m,d] = date.split("-").map(Number);
    const end = new Date(Date.UTC(y, m-1, d));
    end.setUTCDate(end.getUTCDate()+1);
    const endISO = `${end.getUTCFullYear()}-${pad(end.getUTCMonth()+1)}-${pad(end.getUTCDate())}`;
    ics += `DTEND;VALUE=DATE:${toICSDate(endISO)}\r\n`;

    ics += `SUMMARY:${escapeICS("🇧🇷 COPOM — Decisão da Selic (após fechamento)")}\r\n`;
    ics += `DESCRIPTION:${escapeICS(desc)}\r\n`;
    ics += "END:VEVENT\r\n";
  }

  // ---- FED eventos (agenda + placeholders por enquanto) ----
  for (const date of FOMC_DATES) {
    const desc = buildDescription({
      taxa: date <= new Date().toISOString().slice(0,10) ? "A PREENCHER" : "a divulgar",
      expectativa: "A PREENCHER",
      media12m: "A CALCULAR",
      perspectivas: "A PREENCHER"
    });

    ics += "BEGIN:VEVENT\r\n";
    ics += `UID:${escapeICS(`fed-rate-${date}@juros`)}\r\n`;
    ics += `DTSTAMP:${dtstamp}\r\n`;
    // Fed: manter “dia inteiro” ou colocar horário? (você pediu horário quando houver)
    // Para não errar DST sem lib de timezone, deixo como dia inteiro aqui
    // e depois a gente coloca horário correto com lib de TZ.
    ics += `DTSTART;VALUE=DATE:${toICSDate(date)}\r\n`;
    const [y,m,d] = date.split("-").map(Number);
    const end = new Date(Date.UTC(y, m-1, d));
    end.setUTCDate(end.getUTCDate()+1);
    const endISO = `${end.getUTCFullYear()}-${pad(end.getUTCMonth()+1)}-${pad(end.getUTCDate())}`;
    ics += `DTEND;VALUE=DATE:${toICSDate(endISO)}\r\n`;

    ics += `SUMMARY:${escapeICS("🇺🇸 FED — Decisão de juros (horário típico 14:00 ET)")}\r\n`;
    ics += `DESCRIPTION:${escapeICS(desc)}\r\n`;
    ics += "END:VEVENT\r\n";
  }

  ics += "END:VCALENDAR\r\n";

  fs.writeFileSync(OUT_FILE, ics, "utf8");
  console.log(`OK: gerado ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
