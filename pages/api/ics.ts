import type { NextApiRequest, NextApiResponse } from "next";
import { buildICS } from "../../lib/ics";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { entry, professional } = req.body || {};
  if (!entry?.id || !entry?.title || !entry?.dateTime) {
    res.status(400).json({ error: "Missing required entry fields" });
    return;
  }

  const ics = buildICS({ entry, professional: professional || null });

  const safeName = String(entry.title || "evento")
    .toLowerCase()
    .replace(/[^a-z0-9\- ]/gi, "")
    .trim()
    .replace(/\s+/g, "-");

  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${safeName || "evento"}.ics"`);
  res.status(200).send(ics);
}
