import fs from "fs";

/**
 * ==========
 * Helpers
 * ==========
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function ymdToDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatICSDateTimeLocal(ymd, hh, mm) {
  // "floating" local time (sem Z). iOS interpreta no TZ do calendário.
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}${pad2(m)}${pad2(d)}T${pad2(hh)}${pad2(mm)}00`;
}

function formatICSDate(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return `${y}${pad2(m)}${pad2(d)}`;
}

function nowDTStamp() {
  // DTSTAMP em UTC (Z) é ok.
  const d = new Date();
  const y = d.getUTCFullYear();
  const mo = pad2(d.getUTCMonth() + 1);
  const da = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mm = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${y}${mo}${da}T${hh}${mm}${ss}Z`;
}

function addDays(ymd, days) {
  const dt = ymdToDate(ymd);
  dt.setUTCDate(dt.getUTCDate() + days);
  const y = dt.getUTCFullYear();
  const m = pad2(dt.getUTCMonth() + 1);
  const d = pad2(dt.getUTCDate());
  return `${y}-${m}-${d}`;
}

/**
 * ==========
 * Horário do FED em BRT (aprox)
 * ==========
 * O FOMC normalmente solta a decisão às 14:00 (ET).
 * Convertendo para BRT:
 * - Quando EUA estão em DST (EDT, UTC-4): 14:00 ET = 15:00 BRT
 * - Quando EUA estão em Standard (EST, UTC-5): 14:00 ET = 16:00 BRT
 *
 * Brasil não usa DST atualmente, então isso funciona bem como aproximação.
 */
function isUSDST(ymd) {
  // Regra EUA: 2º domingo de março até 1º domingo de novembro
  const dt = ymdToDate(ymd);
  const year = dt.getUTCFullYear();

  function nthSundayOfMonthUTC(y, monthIndex, nth) {
    // monthIndex: 0=Jan
    const first = new Date(Date.UTC(y, monthIndex, 1));
    const firstDay = first.getUTCDay(); // 0=Sun
    const offsetToSunday = (7 - firstDay) % 7;
    const day = 1 + offsetToSunday + 7 * (nth - 1);
    return new Date(Date.UTC(y, monthIndex, day));
  }

  const secondSundayMarch = nthSundayOfMonthUTC(year, 2, 2); // March
  const firstSundayNov = nthSundayOfMonthUTC(year, 10, 1);   // Nov

  return dt >= secondSundayMarch && dt < firstSundayNov;
}

function fedDecisionTimeBRT(ymd) {
  // 14:00 ET -> 15:00 BRT (DST) ou 16:00 BRT (sem DST)
  const dst = isUSDST(ymd);
  return dst ? { hh: 15, mm: 0, label: "15:00 BRT" } : { hh: 16, mm: 0, label: "16:00 BRT" };
}

/**
 * ==========
 * Description padrão (do jeito que você quer)
 * ==========
 */
function buildDescription({ taxa, expectativa, media12m, perspectivas }) {
  // \n precisa virar \\n dentro do ICS
  return [
    `taxa divulgada: ${taxa}`,
    `expectativa: ${expectativa}`,
    `média últimos 12 meses: ${media12m}`,
    `perspectivas: ${perspectivas}`,
  ].join("\\n");
}

/**
 * ==========
 * Evento ICS
 * ==========
 */
function createAllDayEvent({ uid, summary, dateYMD, description }) {
  const dtstart = formatICSDate(dateYMD);
  const dtend = formatICSDate(addDays(dateYMD, 1)); // all-day precisa terminar no dia seguinte
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${DTSTAMP}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "",
  ].join("\n");
}

function createTimedEvent({ uid, summary, dateYMD, hh, mm, durationMinutes, description }) {
  const dtstart = formatICSDateTimeLocal(dateYMD, hh, mm);
  // duration simples: +30min
  const end = new Date(Date.UTC(
    Number(dateYMD.slice(0, 4)),
    Number(dateYMD.slice(5, 7)) - 1,
    Number(dateYMD.slice(8, 10)),
    hh,
    mm,
    0
  ));
  end.setUTCMinutes(end.getUTCMinutes() + durationMinutes);
  const y = end.getUTCFullYear();
  const mo = pad2(end.getUTCMonth() + 1);
  const da = pad2(end.getUTCDate());
  const eh = pad2(end.getUTCHours());
  const em = pad2(end.getUTCMinutes());
  const dtend = `${y}${mo}${da}T${eh}${em}00`;

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${DTSTAMP}`,
    `DTSTART:${dtstart}`,
    `DTEND:${dtend}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "",
  ].join("\n");
}

/**
 * ==========
 * Datas (decisão = 2º dia)
 * ==========
 */

// FED/FOMC — decisão (2º dia)
const FOMC_DECISION_DATES_2025 = [
  "2025-01-29",
  "2025-03-19",
  "2025-05-07",
  "2025-06-18",
  "2025-07-30",
  "2025-09-17",
  "2025-10-29",
  "2025-12-10",
];

const FOMC_DECISION_DATES_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-07-29",
  "2026-09-16",
  "2026-10-28",
  "2026-12-09",
];

// COPOM — decisão (2º dia)
const COPOM_DECISION_DATES_2025 = [
  "2025-01-29",
  "2025-03-19",
  "2025-05-07",
  "2025-06-18",
  "2025-07-30",
  "2025-09-17",
  "2025-11-05",
  "2025-12-10",
];

const COPOM_DECISION_DATES_2026 = [
  "2026-01-28",
  "2026-03-18",
  "2026-04-29",
  "2026-06-17",
  "2026-08-05",
  "2026-09-16",
  "2026-11-04",
  "2026-12-09",
];

/**
 * ==========
 * Construção dos eventos
 * ==========
 */
const DTSTAMP = nowDTStamp();

const eventsICS = [];

// FED: evento com horário (calculado por DST EUA -> BRT)
function addFedEvents(dates) {
  for (const ymd of dates) {
    const { hh, mm, label } = fedDecisionTimeBRT(ymd);

    const uid = `fed-rate-${ymd.replaceAll("-", "")}@juros`;
    const summary = `🇺🇸 FED - Decisão de juros (${label})`;

    // Por enquanto: placeholders (vamos automatizar depois)
    const description = buildDescription({
      taxa: "a divulgar",
      expectativa: "a definir (mercado)",
      media12m: "a calcular",
      perspectivas: "a definir (mercado)",
    });

    eventsICS.push(
      createTimedEvent({
        uid,
        summary,
        dateYMD: ymd,
        hh,
        mm,
        durationMinutes: 30,
        description,
      })
    );
  }
}

// COPOM: all-day (após fechamento)
function addCopomEvents(dates) {
  for (const ymd of dates) {
    const uid = `copom-rate-${ymd.replaceAll("-", "")}@juros`;
    const summary = `🇧🇷 COPOM - Decisão da Selic (após fechamento)`;

    const description = buildDescription({
      taxa: "a divulgar",
      expectativa: "a definir (mercado)",
      media12m: "a calcular",
      perspectivas: "a definir (mercado)",
    });

    eventsICS.push(
      createAllDayEvent({
        uid,
        summary,
        dateYMD: ymd,
        description,
      })
    );
  }
}

// Adiciona 2025 e 2026
addFedEvents(FOMC_DECISION_DATES_2025);
addFedEvents(FOMC_DECISION_DATES_2026);
addCopomEvents(COPOM_DECISION_DATES_2025);
addCopomEvents(COPOM_DECISION_DATES_2026);

/**
 * ==========
 * Monta calendário ICS final
 * ==========
 * - Mantém nome do calendário sem emoji (mais estável no iOS)
 * - Emojis ficam só no SUMMARY dos eventos
 */
const ics =
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Calendario Taxa de Juros//PT-BR//v4.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Taxa de Juros (FED + COPOM)",
    "X-WR-TIMEZONE:America/Sao_Paulo",
    "",
    ...eventsICS,
    "END:VCALENDAR",
    "",
  ].join("\n");

fs.writeFileSync("taxas_de_juros.ics", ics, "utf8");
console.log("✅ taxas_de_juros.ics gerado com 2025 + 2026 (FED + COPOM).");
