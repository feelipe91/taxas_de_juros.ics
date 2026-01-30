import fs from "fs";

/**
 * Gera descrição padronizada para eventos de juros
 */
function buildDescription({ taxa, expectativa, media12m, perspectivas }) {
  return [
    `taxa divulgada: ${taxa}`,
    `expectativa: ${expectativa}`,
    `média últimos 12 meses: ${media12m}`,
    `perspectivas: ${perspectivas}`
  ].join("\\n");
}

/**
 * Cria um evento ICS
 */
function createEvent({
  uid,
  dtstart,
  dtend,
  summary,
  description,
  allDay = false
}) {
  if (allDay) {
    return `
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstart}T000000Z
DTSTART;VALUE=DATE:${dtstart}
DTEND;VALUE=DATE:${dtend}
SUMMARY:${summary}
DESCRIPTION:${description}
END:VEVENT
`;
  }

  return `
BEGIN:VEVENT
UID:${uid}
DTSTAMP:${dtstart}Z
DTSTART:${dtstart}
DTEND:${dtend}
SUMMARY:${summary}
DESCRIPTION:${description}
END:VEVENT
`;
}

/**
 * Eventos FED + COPOM (2025 e 2026)
 * Dados fixos por enquanto
 */
const events = [
  // COPOM 2026
  {
    uid: "copom-20260128@juros",
    dtstart: "20260128",
    dtend: "20260129",
    summary: "COPOM - Decisao da Selic (apos fechamento)",
    allDay: true,
    desc: buildDescription({
      taxa: "15,00% a.a.",
      expectativa: "dentro do esperado",
      media12m: "14,75% a.a.",
      perspectivas: "mercado avalia cortes graduais ao longo do ano"
    })
  },

  {
    uid: "copom-20260318@juros",
    dtstart: "20260318",
    dtend: "20260319",
    summary: "COPOM - Decisao da Selic (apos fechamento)",
    allDay: true,
    desc: buildDescription({
      taxa: "a divulgar",
      expectativa: "manutencao da taxa",
      media12m: "14,60% a.a.",
      perspectivas: "foco em inflacao e atividade economica"
    })
  },

  // FED 2026
  {
    uid: "fed-20260128@juros",
    dtstart: "20260128T190000",
    dtend: "20260128T193000",
    summary: "FED - Decisao de juros (16:00 BRT)",
    desc: buildDescription({
      taxa: "5,50% a.a.",
      expectativa: "dentro do esperado",
      media12m: "5,45% a.a.",
      perspectivas: "mercado precifica primeiro corte no segundo semestre"
    })
  },

  {
    uid: "fed-20260318@juros",
    dtstart: "20260318T150000",
    dtend: "20260318T153000",
    summary: "FED - Decisao de juros (15:00 BRT)",
    desc: buildDescription({
      taxa: "a divulgar",
      expectativa: "manutencao da taxa",
      media12m: "5,40% a.a.",
      perspectivas: "dados de inflacao seguirao determinantes"
    })
  }
];

/**
 * Montagem do calendário
 */
let ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Calendario Taxa de Juros//PT-BR//v3.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Taxa de Juros (FED + COPOM)
X-WR-TIMEZONE:America/Sao_Paulo
`;

for (const ev of events) {
  ics += createEvent({
    uid: ev.uid,
    dtstart: ev.dtstart,
    dtend: ev.dtend,
    summary: ev.summary,
    description: ev.desc,
    allDay: ev.allDay
  });
}

ics += `
END:VCALENDAR
`;

/**
 * Escreve o arquivo final
 */
fs.writeFileSync("taxas_de_juros.ics", ics.trim(), "utf8");

console.log("Arquivo taxas_de_juros.ics gerado com sucesso.");
