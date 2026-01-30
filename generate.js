import fs from "fs";

// =====================
// CONFIG
// =====================
const OUT_MAIN = "taxas_de_juros.ics";
const OUT_V = "taxas_de_juros_v6.ics"; // mude o sufixo quando quiser “forçar” iOS a ler como novo

// COPOM decisões (dia da decisão)
const COPOM_2025 = [
  "2025-01-29",
  "2025-03-19",
  "2025-05-07",
  "2025-06-18",
  "2025-07-30",
  "2025-09-17",
  "2025-11-05",
  "2025-12-10",
];

const COPOM_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-08-05",
  "2026-09-16",
  "2026-11-04",
  "2026-12-09",
];

// FOMC decisões (dia da decisão)
const FED_2025 = [
  "2025-01-29",
  "2025-03-19",
  "2025-05-07",
  "2025-06-18",
  "2025-07-30",
  "2025-09-17",
  "2025-10-29",
  "2025-12-10",
];

const FED_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
];

// =====================
// HELPERS (definidos antes de usar)
// =====================
function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowDTStamp() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const da = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${y}${mo}${da}T${hh}${mm}${ss}Z`;
}

function isPastOrToday(dateISO) {
  const today = new Date().toISOString().slice(0, 10);
  return dateISO <= today;
}

function isoToBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function brToISO(br) {
  const [d, m, y] = br.split("/");
  return `${y}-${m}-${d}`;
}

function fmtPctBR(x) {
  return `${x.toFixed(2).replace(".", ",")}% a.a.`;
}

function addDaysISO(dateYMD, days) {
  const dt = new Date(dateYMD + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

function formatDateICS(dateYMD) {
  const [y, m, d] = dateYMD.split("-");
  return `${y}${m}${d}`;
}

function formatDateTimeICS(dateYMD, hh, mm) {
  const [y, m, d] = dateYMD.split("-");
  return `${y}${m}${d}T${pad2(hh)}${pad2(mm)}00`;
}

// =====================
// FED time heuristic (BRT)
// =====================
function fedDecisionTimeBRT(dateISO) {
  return isUSDST(dateISO)
    ? { hh: 15, mm: 0, label: "15:00 BRT" }
    : { hh: 16, mm: 0, label: "16:00 BRT" };
}

function isUSDST(dateISO) {
  const dt = new Date(dateISO + "T00:00:00Z");
  const year = dt.getUTCFullYear();

  // 2º domingo de março
  const secondSundayMarch = nthSundayUTC(year, 3, 2);
  // 1º domingo de novembro
  const firstSundayNov = nthSundayUTC(year, 11, 1);

  return dt >= secondSundayMarch && dt < firstSundayNov;
}

function nthSundayUTC(year, month1to12, nth) {
  const monthIndex = month1to12 - 1;
  const first = new Date(Date.UTC(year, monthIndex, 1));
  const firstDay = first.getUTCDay(); // 0=Dom
  const offsetToSunday = (7 - firstDay) % 7;
  const day = 1 + offsetToSunday + 7 * (nth - 1);
  return new Date(Date.UTC(year, monthIndex, day));
}

// =====================
// DESCRIPTION + EVENTS
// =====================
function buildDescription({ taxa, expectativa, media12m, perspectivas }) {
  return [
    `taxa divulgada: ${taxa}`,
    `expectativa: ${expectativa}`,
    `média últimos 12 meses: ${media12m}`,
    `perspectivas: ${perspectivas}`,
  ].join("\\n");
}

function createAllDayEvent({ uid, summary, dateYMD, description, dtstamp }) {
  const dtstart = formatDateICS(dateYMD);
  const dtend = formatDateICS(addDaysISO(dateYMD, 1));
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "",
  ].join("\n");
}

function createTimedEvent({ uid, summary, dateYMD, hh, mm, durationMinutes, description, dtstamp }) {
  const dtstart = formatDateTimeICS(dateYMD, hh, mm);

  const end = new Date(Date.UTC(
    Number(dateYMD.slice(0, 4)),
    Number(dateYMD.slice(5, 7)) - 1,
    Number(dateYMD.slice(8, 10)),
    hh,
    mm,
    0
  ));
  end.setUTCMinutes(end.getUTCMinutes() + durationMinutes);

  const dtend =
    end.getUTCFullYear() +
    pad2(end.getUTCMonth() + 1) +
    pad2(end.getUTCDate()) +
    "T" +
    pad2(end.getUTCHours()) +
    pad2(end.getUTCMinutes()) +
    "00";

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "",
  ].join("\n");
}

function buildICS(events) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendario Taxa de Juros//PT-BR//v6.1",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Taxa de Juros (FED + COPOM)",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\n");
}

// =====================
// BCB SGS 432 (Meta Selic)
// =====================
async function fetchSGS432(startISO, endISO) {
  const url =
    `https://api.bcb.gov.br/dados/serie/bcdata.sgs.432/dados?formato=json` +
    `&dataInicial=${encodeURIComponent(isoToBR(startISO))}` +
    `&dataFinal=${encodeURIComponent(isoToBR(endISO))}`;

  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`BCB SGS 432 HTTP ${res.status}`);

  const json = await res.json();
  return json.map((row) => ({
    date: brToISO(row.data),
    value: Number(String(row.valor).replace(",", ".")),
  }));
}

function getRateAtOrBefore(series, dateISO) {
  let best = null;
  for (const row of series) {
    if (row.date <= dateISO) best = row.value;
    else break;
  }
  return best;
}

function avgLast12(values, idx) {
  const slice = values.slice(0, idx + 1).filter((v) => typeof v === "number" && !Number.isNaN(v));
  const last = slice.slice(-12);
  if (!last.length) return null;
  return last.reduce((a, b) => a + b, 0) / last.length;
}

// =====================
// MAIN
// =====================
async function main() {
  const dtstamp = nowDTStamp();

  // Busca série do BCB para preencher COPOM passado (2025)
  const sgs = await fetchSGS432("2024-01-01", "2026-12-31");
  sgs.sort((a, b) => (a.date < b.date ? -1 : 1));

  const events = [];

  // ---- COPOM
  const copomAll = [...COPOM_2025, ...COPOM_2026];
  const copomRates = copomAll.map((d) => getRateAtOrBefore(sgs, d));

  for (let i = 0; i < copomAll.length; i++) {
    const date = copomAll[i];
    const past = isPastOrToday(date);

    const actual = copomRates[i];
    const avg12 = avgLast12(copomRates, i);

    const taxa = past && actual != null ? fmtPctBR(actual) : "a divulgar";
    const media12m = avg12 != null ? fmtPctBR(avg12) : "a calcular";

    const expectativa = past ? "A PREENCHER" : "a definir (mercado)";
    const perspectivas = past ? "A PREENCHER" : "a definir (mercado)";

    const desc = buildDescription({ taxa, expectativa, media12m, perspectivas });

    events.push(
      createAllDayEvent({
        uid: `copom-${date.replaceAll("-", "")}@juros`,
        summary: "🇧🇷 COPOM - Decisão da Selic (após fechamento)",
        dateYMD: date,
        description: desc,
        dtstamp,
      })
    );
  }

  // ---- FED (agenda + horário)
  const fedAll = [...FED_2025, ...FED_2026];
  for (const date of fedAll) {
    const { hh, mm, label } = fedDecisionTimeBRT(date);
    const past = isPastOrToday(date);

    const desc = buildDescription({
      taxa: past ? "A PREENCHER" : "a divulgar",
      expectativa: past ? "A PREENCHER" : "a definir (mercado)",
      media12m: "a calcular",
      perspectivas: past ? "A PREENCHER" : "a definir (mercado)",
    });

    events.push(
      createTimedEvent({
        uid: `fed-${date.replaceAll("-", "")}@juros`,
        summary: `🇺🇸 FED - Decisão de juros (${label})`,
        dateYMD: date,
        hh,
        mm,
        durationMinutes: 30,
        description: desc,
        dtstamp,
      })
    );
  }

  const ics = buildICS(events);

  // gera 2 arquivos (quebra cache iOS pelo nome)
  fs.writeFileSync(OUT_MAIN, ics, "utf8");
  fs.writeFileSync(OUT_V, ics, "utf8");

  console.log(`✅ Gerados: ${OUT_MAIN} e ${OUT_V}`);
}

main().catch((err) => {
  console.error("❌ Erro ao gerar ICS:", err);
  process.exit(1);
});
