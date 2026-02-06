import type { Entry, Professional } from "./types";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// “Floating time” (sin Z) para que iPhone lo interprete como hora local
function toICSDate(dtISO: string) {
  const d = new Date(dtISO);
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}${mm}${dd}T${hh}${mi}00`;
}

function esc(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildICS(params: {
  entry: Entry;
  professional?: Professional | null;
  defaultDurationMinutes?: number;
  alarmsMinutesBefore?: number[]; // ej: [1440, 60] = 1 día y 1 hora antes
}) {
  const { entry, professional, defaultDurationMinutes = 30, alarmsMinutesBefore = [1440, 60] } = params;

  const start = toICSDate(entry.dateTime);

  let endISO = entry.endDateTime;
  if (!endISO) {
    const d = new Date(entry.dateTime);
    d.setMinutes(d.getMinutes() + defaultDurationMinutes);
    endISO = d.toISOString();
  }
  const end = toICSDate(endISO);

  const summary = entry.title || "Evento";
  const location = entry.location || professional?.center || "";

  const doctorLine = professional ? `Profesional: ${professional.name} (${professional.specialty})` : "";
  const doseLine =
    entry.doseAmount !== undefined && entry.doseUnit ? `Cantidad: ${entry.doseAmount} ${entry.doseUnit}` : "";
  const notesLine = entry.notes ? `Notas: ${entry.notes}` : "";

  const description = [doctorLine, doseLine, notesLine].filter(Boolean).join("\n");

  const uid = `${entry.id}@control-onco-papa`;
  const dtstamp = toICSDate(new Date().toISOString());

  const alarms = alarmsMinutesBefore
    .map((m) =>
      [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${esc(summary)}`,
        `TRIGGER:-PT${m}M`,
        "END:VALARM"
      ].join("\r\n")
    )
    .join("\r\n");

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Control Onco Papá//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${esc(summary)}`,
    location ? `LOCATION:${esc(location)}` : "",
    description ? `DESCRIPTION:${esc(description)}` : "",
    alarms,
    "END:VEVENT",
    "END:VCALENDAR"
  ]
    .filter(Boolean)
    .join("\r\n");

  return ics;
}
