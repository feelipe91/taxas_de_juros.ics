import fs from "fs";

/**
 * =========================
 * Funções utilitárias
 * =========================
 */
function pad2(n) {
  return String(n).padStart(2, "0");
}

function nowDTStamp() {
  const d = new Date();
  return (
    d.getUTCFullYear() +
    pad2(d.getUTCMonth() + 1) +
    pad2(d.getUTCDate()) +
    "T" +
    pad2(d.getUTCHours()) +
    pad2(d.getUTCMinutes()) +
    pad2(d.getUTCSeconds()) +
    "Z"
  );
}

function formatDateICS(ymd) {
  const [y, m, d] = ymd.split("-");
  return `${y}${m}${d}`;
}

function addDays(ymd, days) {
  const dt = new Date(ymd + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return (
    dt.getUTCFullYear() +
    "-" +
    pad2(dt.getUTCMonth() + 1) +
    "-" +
    pad2(dt.getUTCDate())
  );
}

/**
 * =========================
 * Descrição padronizada
 * =========================
 */
function buildDescription({ taxa, expectativa, media12m, perspectivas }) {
  return [
    `taxa divulgada: ${taxa}`,
    `expectativa: ${expectativa}`,
    `média últimos 12 meses: ${media12m}`,
    `perspectivas: ${perspectivas}`,
  ].join("\\n");
}

/**
 * =========================
 * Criação de eventos ICS
 * =========================
 */
function createAllDayEvent({ uid, summary, date, description, dtstamp }) {
  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${formatDateICS(date)}`,
    `DTEND;VALUE=DATE:${formatDateICS(addDays(date, 1))}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description}`,
    "END:VEVENT",
    "",
  ].join("\n");
}

function createTimedEvent({
  uid,
  summary,
  date,
  hour,
  minute,
  durationMin,
  description,
  dtstamp,
}) {
  const dtstart = `${formatDateICS(date)}T${pad2(hour)}${pad2(minute)}00`;
  const end = new Date(`${date}T${pad2(hour)}:${pad2(minute)}:00Z`);
  end.setUTCMinutes(end.getUTCMinutes() + durationMin);

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

/**
 * =========================
 * Datas das decisões
 * =========================
 */
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

/**
 * =========================
 * Geração do calendário
 * =========================
 */
const DTSTAMP = nowDTStamp();
const events = [];

// FED — horário fixo aproximado (15h ou 16h BRT é refinável depois)
function addFed(dates, hourLabel) {
  for (const d of dates) {
    events.push(
      createTimedEvent({
        uid: `fed-${d.replaceAll("-", "")}@juros`,
        summary: `🇺🇸 FED - Decisão de juros (${hourLabel})`,
        date: d,
        hour: hourLabel === "15:00 BRT" ? 15 : 16,
        minute: 0,
        durationMin: 30,
        description: buildDescription({
          taxa: "a divulgar",
          expectativa: "a definir (mercado)",
          media12m: "a calcular",
          perspectivas: "a definir (mercado)",
        }),
        dtstamp: DTSTAMP,
      })
    );
  }
}

// COPOM — all day (após fechamento)
function addCopom(dates) {
  for (const d of dates) {
    events.push(
      createAllDayEvent({
        uid: `copom-${d.replaceAll("-", "")}@juros`,
        summary: "🇧🇷 COPOM - Decisão da Selic (após fechamento)",
        date: d,
        description: buildDescription({
          taxa: "a divulgar",
          expectativa: "a definir (mercado)",
          media12m: "a calcular",
          perspectivas: "a definir (mercado)",
        }),
        dtstamp: DTSTAMP,
      })
    );
  }
}

addFed(FED_2025, "16:00 BRT");
addFed(FED_2026, "15:00 BRT");
addCopom(COPOM_2025);
addCopom(COPOM_2026);

/**
 * =========================
 * Montagem final do ICS
 * =========================
 */
const ics = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Calendario Taxa de Juros//PT-BR//v5.0",
  "CALSCALE:GREGORIAN",
  "METHOD:PUBLISH",
  "X-WR-CALNAME:Taxa de Juros (FED + COPOM)",
  "X-WR-TIMEZONE:America/Sao_Paulo",
  "",
  ...events,
  "END:VCALENDAR",
  "",
].join("\n");

// 🔥 Gera dois arquivos para quebrar cache do iOS
fs.writeFileSync("taxas_de_juros.ics", ics, "utf8");
fs.writeFileSync("taxas_de_juros_v5.ics", ics, "utf8");

console.log("✅ Calendários gerados: taxas_de_juros.ics e taxas_de_juros_v5.ics");
