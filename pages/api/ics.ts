import type { NextApiRequest, NextApiResponse } from "next";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// Formato LOCAL "floating": YYYYMMDDTHHMMSS (sin Z)
function toLocalICS(d: Date) {
  return (
    d.getFullYear() +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function esc(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();

  const { entry, professional } = req.body || {};
  if (!entry?.title || !entry?.dateTime) return res.status(400).send("Missing entry");

  const start = new Date(entry.dateTime);
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 min

  // Alarma: día anterior a las 12:00 (mediodía)
  const alarm = new Date(start);
  alarm.setDate(alarm.getDate() - 1);
  alarm.setHours(12, 0, 0, 0);

  const location = entry.location || "";
  const profLine =
    professional?.name
      ? `Profesional: ${professional.name}${professional.specialty ? " (" + professional.specialty + ")" : ""}`
      : "";

  const descriptionParts = [
    entry.type ? `Tipo: ${entry.type}` : "",
    entry.status ? `Estado: ${entry.status}` : "",
    profLine,
    entry.notes ? `Notas: ${entry.notes}` : ""
  ].filter(Boolean);

  const uid = `${esc(entry.id || String(Date.now()))}@control-onco-papa`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Control Onco Papa//ES",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toLocalICS(new Date())}`,
    `DTSTART:${toLocalICS(start)}`,
    `DTEND:${toLocalICS(end)}`,
    `SUMMARY:${esc(entry.title)}`,
    location ? `LOCATION:${esc(location)}` : "",
    descriptionParts.length ? `DESCRIPTION:${esc(descriptionParts.join("\n"))}` : "",
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${esc("Recordatorio: " + entry.title)}`,
    `TRIGGER;VALUE=DATE-TIME:${toLocalICS(alarm)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ]
    .filter(Boolean)
    .join("\r\n");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(entry.title)}.ics"`);
  res.status(200).send(ics);
}
