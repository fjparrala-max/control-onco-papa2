import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { auth, db, storage } from "../lib/firebase";
import type { Professional } from "../lib/types";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";

function nowISO() {
  return new Date().toISOString();
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

type EntryStatus = "planned" | "done" | "cancelled";

// Adjuntos: campos esperados por tu types (mime/uploadedAt)
type Attachment = {
  id: string;
  name: string;
  url: string;
  path: string;
  mime: string;
  size: number;
  uploadedAt: string;
};

type Entry = {
  id: string;
  type: string; // dinámico para tipos nuevos
  title: string;
  dateTime: string; // ISO
  status: EntryStatus;

  doseAmount?: number;
  doseUnit?: string;
  location?: string;
  notes?: string;
  professionalId?: string;

  attachments: Attachment[];
  createdAt: string;
  updatedAt: string;

  createdByUid?: string;
  createdByEmail?: string;
  updatedByUid?: string;
  updatedByEmail?: string;
};

const DEFAULT_TYPES = ["control", "chemo", "exam", "med"];

function labelForType(key: string) {
  if (key === "control") return "Control";
  if (key === "chemo") return "Quimioterapia";
  if (key === "exam") return "Examen";
  if (key === "med") return "Medicamento (toma)";
  return key.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function statusLabel(s: EntryStatus) {
  return s === "planned" ? "Planificado" : s === "done" ? "Realizado" : "Cancelado";
}

export default function Home() {
  const r = useRouter();

  // ✅ CLAVE: null = “aún leyendo localStorage”
  // ""   = “no hay caso activo”
  // id   = caso activo
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);

  const [caseName, setCaseName] = useState<string>("");
  const [caseTypes, setCaseTypes] = useState<string[]>(DEFAULT_TYPES);

  const [entries, setEntries] = useState<Entry[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);

  // form
  const [type, setType] = useState<string>("control");
  const [title, setTitle] = useState("");
  const [dateTime, setDateTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [status, setStatus] = useState<EntryStatus>("planned");
  const [doseAmount, setDoseAmount] = useState<string>("");
  const [doseUnit, setDoseUnit] = useState<string>("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [professionalId, setProfessionalId] = useState<string>("");

  // ✅ Leer el caso activo desde localStorage (una vez)
  useEffect(() => {
    const id = typeof window !== "undefined" ? localStorage.getItem("activeCaseId") : null;
    setActiveCaseId(id || ""); // "" si no existe
  }, []);

  // ✅ Redirigir a /casos SOLO cuando ya cargó localStorage
  useEffect(() => {
    if (activeCaseId === null) return; // aún cargando
    if (activeCaseId === "") r.replace("/casos");
  }, [activeCaseId, r]);

  async function refresh(caseId: string) {
    // Cargar caso (nombre + tipos)
    const cSnap = await getDoc(doc(db, "cases", caseId));
    if (cSnap.exists()) {
      const c: any = cSnap.data();
      setCaseName(c.name || "");
      const types = Array.isArray(c.types) && c.types.length ? c.types : DEFAULT_TYPES;
      setCaseTypes(types);

      // asegurar que el tipo actual exista
      if (!types.includes(type)) setType(types[0] || "control");
    } else {
      // caso no existe -> volver a casos
      setCaseName("");
      setCaseTypes(DEFAULT_TYPES);
      localStorage.removeItem("activeCaseId");
      setActiveCaseId("");
      return;
    }

    // Entradas
    const eQ = query(collection(db, "cases", caseId, "entries"), orderBy("dateTime", "desc"));
    const pQ = query(collection(db, "cases", caseId, "professionals"), orderBy("name", "asc"));
    const [eSnap, pSnap] = await Promise.all([getDocs(eQ), getDocs(pQ)]);

    setEntries(eSnap.docs.map((d) => d.data() as Entry));
    setProfessionals(pSnap.docs.map((d) => d.data() as Professional));
  }

  useEffect(() => {
    if (activeCaseId && activeCaseId !== "") {
      refresh(activeCaseId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const summary = useMemo(() => {
    const done = entries.filter((e) => e.status === "done");
    const planned = entries.filter((e) => e.status === "planned");
    const count = (arr: Entry[], t: string) => arr.filter((e) => e.type === t).length;

    return caseTypes.map((t) => ({
      key: t,
      label: labelForType(t),
      done: count(done, t),
      planned: count(planned, t)
    }));
  }, [entries, caseTypes]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  function resetForm() {
    setEditingId(null);
    setType(caseTypes[0] || "control");
    setTitle("");
    setDateTime(new Date().toISOString().slice(0, 16));
    setStatus("planned");
    setDoseAmount("");
    setDoseUnit("");
    setLocation("");
    setNotes("");
    setProfessionalId("");
    setNewFile(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(e: Entry) {
    setEditingId(e.id);
    setShowForm(true);

    setType(e.type);
    setTitle(e.title || "");
    setDateTime(new Date(e.dateTime).toISOString().slice(0, 16));
    setStatus(e.status);
    setDoseAmount(e.doseAmount !== undefined ? String(e.doseAmount) : "");
    setDoseUnit(e.doseUnit || "");
    setLocation(e.location || "");
    setNotes(e.notes || "");
    setProfessionalId(e.professionalId || "");
    setNewFile(null);
  }

  async function addType() {
    if (!activeCaseId || activeCaseId === "") return alert("Abre un caso primero");
    const t = prompt("Nombre del nuevo tipo (ej: Traumatólogo, Radioterapia, etc.)");
    if (!t) return;

    const key = t.trim().toLowerCase().replace(/\s+/g, "_");
    const next = Array.from(new Set([...caseTypes, key]));

    await updateDoc(doc(db, "cases", activeCaseId), { types: next });
    setCaseTypes(next);
  }

  async function uploadAttachment(caseId: string, entryId: string, file: File): Promise<Attachment> {
    const attId = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\- ()]/g, "_");
    const path = `cases/${caseId}/entries/${entryId}/${attId}-${safeName}`;

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);

    return stripUndefined({
      id: attId,
      name: file.name,
      url,
      path,
      mime: file.type || "application/octet-stream",
      size: file.size || 0,
      uploadedAt: nowISO()
    });
  }

  async function addAttachmentToExisting(entry: Entry, file: File) {
    try {
      if (!activeCaseId || activeCaseId === "") return alert("Necesitas un caso activo (abre uno en Casos).");
      const u = auth.currentUser;
      if (!u) return alert("Debes estar logueada.");

      setUploadingEntryId(entry.id);

      const att = await uploadAttachment(activeCaseId, entry.id, file);
      const current = entry.attachments || [];

      const updated: Entry = stripUndefined({
        ...entry,
        attachments: [...current, att],
        updatedAt: nowISO(),
        updatedByUid: u.uid,
        updatedByEmail: u.email || undefined
      });

      await setDoc(doc(db, "cases", activeCaseId, "entries", entry.id), stripUndefined(updated));
      await refresh(activeCaseId);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo subir el archivo");
    } finally {
      setUploadingEntryId(null);
    }
  }

  async function saveEntry() {
    if (!title.trim()) return alert("Falta título (ej: Control Urología / PSA / Quimio ciclo 2)");
    if (!activeCaseId || activeCaseId === "") return alert("Necesitas un caso activo (abre uno en Casos).");

    const u = auth.currentUser;
    if (!u) return alert("Debes estar logueada.");

    const ts = nowISO();
    const iso = new Date(dateTime).toISOString();

    const baseExisting = editingId ? entries.find((x) => x.id === editingId) : null;

    const entry: Entry = stripUndefined({
      id: editingId || crypto.randomUUID(),
      type,
      title: title.trim(),
      dateTime: iso,
      status,
      doseAmount: doseAmount ? Number(doseAmount) : undefined,
      doseUnit: doseUnit ? doseUnit.trim() : undefined,
      professionalId: professionalId || undefined,
      location: location || undefined,
      notes: notes || undefined,

      attachments: baseExisting?.attachments || [],
      createdAt: baseExisting?.createdAt || ts,
      updatedAt: ts,

      createdByUid: baseExisting?.createdByUid || u.uid,
      createdByEmail: baseExisting?.createdByEmail || (u.email || undefined),
      updatedByUid: u.uid,
      updatedByEmail: u.email || undefined
    });

    await setDoc(doc(db, "cases", activeCaseId, "entries", entry.id), stripUndefined(entry));

    if (newFile) {
      try {
        setUploadingEntryId(entry.id);
        const att = await uploadAttachment(activeCaseId, entry.id, newFile);
        const updated: Entry = stripUndefined({
          ...entry,
          attachments: [...(entry.attachments || []), att],
          updatedAt: nowISO(),
          updatedByUid: u.uid,
          updatedByEmail: u.email || undefined
        });
        await setDoc(doc(db, "cases", activeCaseId, "entries", entry.id), stripUndefined(updated));
      } finally {
        setUploadingEntryId(null);
        setNewFile(null);
      }
    }

    await refresh(activeCaseId);
    setShowForm(false);
    resetForm();
  }

  async function toggleDone(e: Entry) {
    if (!activeCaseId || activeCaseId === "") return;
    const u = auth.currentUser;
    if (!u) return alert("Debes estar logueada.");

    const updated: Entry = stripUndefined({
      ...e,
      status: e.status === "done" ? "planned" : "done",
      updatedAt: nowISO(),
      updatedByUid: u.uid,
      updatedByEmail: u.email || undefined
    });

    await setDoc(doc(db, "cases", activeCaseId, "entries", updated.id), stripUndefined(updated));
    await refresh(activeCaseId);
  }

  async function deleteEntry(id: string) {
    if (!activeCaseId || activeCaseId === "") return;
    if (!confirm("¿Eliminar este registro?")) return;
    await deleteDoc(doc(db, "cases", activeCaseId, "entries", id));
    await refresh(activeCaseId);
  }

  async function exportICS(entry: Entry) {
    const prof = entry.professionalId ? professionals.find((p: any) => p.id === entry.professionalId) : null;

    const resp = await fetch("/api/ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, professional: prof || null })
    });

    if (!resp.ok) return alert("No se pudo generar el .ics");

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.title}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Mientras lee localStorage, no renderices nada (evita parpadeo/loop)
  if (activeCaseId === null) return null;

  return (
    <div className="container">
      <h1>Control Onco Papá</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Caso: {caseName || "(sin nombre)"}</b>
        <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <a className="btn2" href="/casos" style={{ textDecoration: "none" }}>
            Cambiar caso
          </a>
          <button className="btn2" onClick={addType}>+ Agregar tipo</button>
        </div>
        <div style={{ marginTop: 8 }}>
          <small>Tipos actuales: {caseTypes.map(labelForType).join(", ")}</small>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Resumen (Hechos / Pendientes)</b>
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {summary.map((s) => (
            <div key={s.key}>
              {s.label}: Hechos <b>{s.done}</b> /{" "}
              <span style={{ color: "red" }}>
                Pendientes <b>{s.planned}</b>
              </span>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={openCreate}>+ Añadir registro</button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>{editingId ? "Editar registro" : "Nuevo registro"}</b>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div>
              <small>Tipo</small>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {caseTypes.map((t) => (
                  <option key={t} value={t}>
                    {labelForType(t)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <small>Título</small>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Control Urología / PSA" />
            </div>

            <div className="row">
              <div style={{ flex: 1 }}>
                <small>Fecha y hora</small>
                <input type="datetime-local" value={dateTime} onChange={(e) => setDateTime(e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <small>Estado</small>
                <select value={status} onChange={(e) => setStatus(e.target.value as EntryStatus)}>
                  <option value="planned">Planificado</option>
                  <option value="done">Realizado</option>
                  <option value="cancelled">Cancelado</option>
                </select>
              </div>
            </div>

            <div className="row">
              <div style={{ flex: 1 }}>
                <small>Cantidad (opcional)</small>
                <input value={doseAmount} onChange={(e) => setDoseAmount(e.target.value)} placeholder="Ej: 1 / 500" />
              </div>
              <div style={{ flex: 1 }}>
                <small>Unidad (opcional)</small>
                <input value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} placeholder="Ej: comp / mg / ml" />
              </div>
            </div>

            <div>
              <small>Lugar (opcional)</small>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej: Clínica / Hospital" />
            </div>

            <div>
              <small>Notas (opcional)</small>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </div>

            <div>
              <small>Profesional (opcional)</small>
              <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                <option value="">(sin profesional)</option>
                {professionals.map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.specialty}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <small>Adjuntar archivo (opcional)</small>
              <input
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
              />
              {newFile && <small>Seleccionado: <b>{newFile.name}</b></small>}
              {uploadingEntryId && <small>Subiendo archivo…</small>}
            </div>

            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" onClick={saveEntry}>{editingId ? "Guardar cambios" : "Guardar"}</button>
              <button className="btn2" onClick={() => { setShowForm(false); resetForm(); }}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Filtrar</b>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginTop: 8 }}>
          <option value="all">Todo</option>
          {caseTypes.map((t) => (
            <option key={t} value={t}>
              {labelForType(t)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((e) => (
          <div className="card" key={e.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <b>{e.title}</b>
                <div><small>{labelForType(e.type)} • {new Date(e.dateTime).toLocaleString()}</small></div>
                <div>
                  <small>
                    Estado:{" "}
                    <span style={{ color: e.status === "planned" ? "red" : "inherit" }}>
                      {statusLabel(e.status)}
                    </span>
                  </small>
                </div>

                <div style={{ marginTop: 6 }}>
                  {e.createdByEmail && <div><small>Creado por: {e.createdByEmail}</small></div>}
                  {e.updatedByEmail && <div><small>Última edición: {e.updatedByEmail}</small></div>}
                </div>
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                <button className="btn2" onClick={() => exportICS(e)}>Añadir al Calendario</button>

                <label className="btn2" style={{ cursor: "pointer", textAlign: "center" }}>
                  {uploadingEntryId === e.id ? "Subiendo…" : "Adjuntar PDF/foto"}
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    style={{ display: "none" }}
                    disabled={uploadingEntryId === e.id}
                    onChange={(ev) => {
                      const file = ev.target.files?.[0];
                      ev.target.value = "";
                      if (file) addAttachmentToExisting(e, file);
                    }}
                  />
                </label>

                <button className="btn2" onClick={() => openEdit(e)}>Editar</button>
                <button className="btn2" onClick={() => toggleDone(e)}>
                  {e.status === "done" ? "Marcar pendiente" : "Marcar realizado"}
                </button>
                <button className="btn2" onClick={() => deleteEntry(e.id)}>Eliminar</button>
              </div>
            </div>

            {(e.doseAmount || e.doseUnit) && (
              <div style={{ marginTop: 8 }}>
                <small>Cantidad: {e.doseAmount ?? ""} {e.doseUnit ?? ""}</small>
              </div>
            )}
            {e.location && <div style={{ marginTop: 4 }}><small>Lugar: {e.location}</small></div>}
            {e.notes && <div style={{ marginTop: 8 }}>{e.notes}</div>}

            {!!(e.attachments?.length) && (
              <div style={{ marginTop: 12 }}>
                <b>Adjuntos</b>
                <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                  {e.attachments.map((a) => (
                    <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                      {a.name}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {!filtered.length && <div className="card">Sin registros aún.</div>}
      </div>
    </div>
  );
}
