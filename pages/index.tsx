import { useEffect, useMemo, useState } from "react";
import { localDB } from "../lib/db";
import { auth, db, storage } from "../lib/firebase";
import type { Entry, EntryStatus, EntryType, Professional } from "../lib/types";
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { onAuthStateChanged, type User } from "firebase/auth";

function nowISO() {
  return new Date().toISOString();
}
function typeLabel(t: EntryType) {
  return t === "med" ? "Medicamento (toma)" : t === "chemo" ? "Quimioterapia" : t === "exam" ? "Examen" : "Control";
}
function statusLabel(s: EntryStatus) {
  return s === "planned" ? "Planificado" : s === "done" ? "Realizado" : "Cancelado";
}

// Firestore NO acepta undefined → lo removemos
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

type Attachment = {
  id: string;
  name: string;
  url: string;
  path: string;
  mime: string;
  size: number;
  uploadedAt: string;
};


// Extendemos Entry sin tocar lib/types
type EntryExt = Entry & {
  createdByUid?: string;
  createdByEmail?: string;
  updatedByUid?: string;
  updatedByEmail?: string;
};

export default function Home() {
  const [activeCaseId, setActiveCaseId] = useState<string>("");

  const [user, setUser] = useState<User | null>(null);

  const [entries, setEntries] = useState<EntryExt[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filter, setFilter] = useState<EntryType | "all">("all");

  // Form / edit
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Subida
  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);

  // form fields
  const [type, setType] = useState<EntryType>("control");
  const [title, setTitle] = useState("");
  const [dateTime, setDateTime] = useState(() => new Date().toISOString().slice(0, 16));
  const [status, setStatus] = useState<EntryStatus>("planned");
  const [doseAmount, setDoseAmount] = useState<string>("");
  const [doseUnit, setDoseUnit] = useState<string>("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [professionalId, setProfessionalId] = useState<string>("");

  useEffect(() => {
    const id = typeof window !== "undefined" ? localStorage.getItem("activeCaseId") : null;
    setActiveCaseId(id || "");
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  async function refresh() {
    if (activeCaseId) {
      const eQ = query(collection(db, "cases", activeCaseId, "entries"), orderBy("dateTime", "desc"));
      const pQ = query(collection(db, "cases", activeCaseId, "professionals"), orderBy("name", "asc"));
      const [eSnap, pSnap] = await Promise.all([getDocs(eQ), getDocs(pQ)]);

      setEntries(eSnap.docs.map((d) => d.data() as EntryExt));
      setProfessionals(pSnap.docs.map((d) => d.data() as Professional));
      return;
    }

    const e = (await localDB.entries.orderBy("dateTime").reverse().toArray()) as any as EntryExt[];
    const p = await localDB.professionals.orderBy("name").toArray();
    setEntries(e);
    setProfessionals(p);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const summary = useMemo(() => {
    const done = entries.filter((e) => e.status === "done");
    const planned = entries.filter((e) => e.status === "planned");
    const count = (arr: EntryExt[], t: EntryType) => arr.filter((e) => e.type === t).length;
    return {
      chemo: { done: count(done, "chemo"), planned: count(planned, "chemo") },
      med: { done: count(done, "med"), planned: count(planned, "med") },
      control: { done: count(done, "control"), planned: count(planned, "control") },
      exam: { done: count(done, "exam"), planned: count(planned, "exam") }
    };
  }, [entries]);

  const filtered = useMemo(() => {
    return filter === "all" ? entries : entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  function resetForm() {
    setEditingId(null);
    setType("control");
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

  function openEdit(e: EntryExt) {
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
    setNewFile(null); // archivo opcional nuevo al editar
  }

  async function uploadAttachment(entryId: string, file: File): Promise<Attachment> {
    if (!activeCaseId) throw new Error("No hay caso activo");

    const attId = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\- ()]/g, "_");
    const path = `cases/${activeCaseId}/entries/${entryId}/${attId}-${safeName}`;

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

  async function addAttachmentToExisting(entry: EntryExt, file: File) {
    if (!activeCaseId) return alert("Para adjuntar archivos necesitas un caso activo (nube).");
    if (!user) return alert("Debes estar logueado para adjuntar.");

    try {
      setUploadingEntryId(entry.id);

      const att = await uploadAttachment(entry.id, file);
      const current = ((entry.attachments || []) as any[]) as Attachment[];

      const updated: EntryExt = {
        ...entry,
        attachments: [...current, att],
        updatedAt: nowISO(),
        updatedByUid: user.uid,
        updatedByEmail: user.email || undefined
      };

      await setDoc(doc(db, "cases", activeCaseId, "entries", entry.id), stripUndefined(updated));
      await refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo subir el archivo");
    } finally {
      setUploadingEntryId(null);
    }
  }

  async function saveEntry() {
    if (!title.trim()) return alert("Falta título (ej: Control Urología / PSA / Quimio ciclo 2)");

    // Autor (para nube)
    const byUid = user?.uid;
    const byEmail = user?.email || undefined;

    const ts = nowISO();
    const iso = new Date(dateTime).toISOString();

    // Si estamos editando, partimos del registro actual (para no perder attachments/createdBy)
    const baseExisting = editingId ? entries.find((x) => x.id === editingId) : null;

    const entry: EntryExt = {
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

      // conservar adjuntos si existe
      attachments: (baseExisting?.attachments as any) || [],

      // created/updated
      createdAt: baseExisting?.createdAt || ts,
      updatedAt: ts,

      // autoría
      createdByUid: baseExisting?.createdByUid || byUid,
      createdByEmail: baseExisting?.createdByEmail || byEmail,
      updatedByUid: byUid,
      updatedByEmail: byEmail
    };

    // Guardado base
    if (activeCaseId) {
      if (!user) return alert("Debes estar logueado para guardar en nube.");

      await setDoc(doc(db, "cases", activeCaseId, "entries", entry.id), stripUndefined(entry));

      // Si eligió archivo en el formulario, lo subimos y actualizamos el entry
      if (newFile) {
        try {
          setUploadingEntryId(entry.id);
          const att = await uploadAttachment(entry.id, newFile);
          const updated: EntryExt = {
            ...entry,
            attachments: [...(((entry.attachments || []) as any[]) as Attachment[]), att],
            updatedAt: nowISO(),
            updatedByUid: user.uid,
            updatedByEmail: user.email || undefined
          };
          await setDoc(doc(db, "cases", activeCaseId, "entries", entry.id), stripUndefined(updated));
        } finally {
          setUploadingEntryId(null);
          setNewFile(null);
        }
      }
    } else {
      // Local (sin nube)
      if (editingId) {
        await localDB.entries.put(entry as any);
      } else {
        await localDB.entries.put(entry as any);
      }
      setNewFile(null);
    }

    await refresh();
    setShowForm(false);
    resetForm();
  }

  async function toggleDone(e: EntryExt) {
    const updated: EntryExt = {
      ...e,
      status: e.status === "done" ? "planned" : "done",
      updatedAt: nowISO(),
      updatedByUid: user?.uid,
      updatedByEmail: user?.email || undefined
    };

    if (activeCaseId) {
      await setDoc(doc(db, "cases", activeCaseId, "entries", updated.id), stripUndefined(updated));
    } else {
      await localDB.entries.put(updated as any);
    }
    await refresh();
  }

  async function deleteEntry(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;

    if (activeCaseId) {
      await deleteDoc(doc(db, "cases", activeCaseId, "entries", id));
    } else {
      await localDB.entries.delete(id);
    }
    await refresh();
  }

  async function exportICS(entry: EntryExt) {
    const prof = entry.professionalId ? professionals.find((p) => p.id === entry.professionalId) : null;

    const r = await fetch("/api/ics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entry, professional: prof || null })
    });

    if (!r.ok) return alert("No se pudo generar el .ics");

    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${entry.title}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container">
      <h1>Control Onco Papá</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Caso activo</b>
        <div style={{ marginTop: 8 }}>
          <small>
            {activeCaseId ? (
              <>✅ Guardando en nube (Firestore/Storage) • ID: {activeCaseId}</>
            ) : (
              <>⚠️ Sin caso activo (guardando local en este computador)</>
            )}
          </small>
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <a className="btn2" href="/casos" style={{ textDecoration: "none" }}>
            Casos
          </a>
          <a className="btn2" href="/profesionales" style={{ textDecoration: "none" }}>
            Profesionales
          </a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Resumen (Hechos / Pendientes)</b>
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          <div>
            💉 Quimioterapias: Hechas <b>{summary.chemo.done}</b> /{" "}
            <span style={{ color: "red" }}>
              Pendientes <b>{summary.chemo.planned}</b>
            </span>
          </div>
          <div>
            💊 Medicamentos (tomas): Hechas <b>{summary.med.done}</b> /{" "}
            <span style={{ color: "red" }}>
              Pendientes <b>{summary.med.planned}</b>
            </span>
          </div>
          <div>
            🗓️ Controles: Hechos <b>{summary.control.done}</b> /{" "}
            <span style={{ color: "red" }}>
              Pendientes <b>{summary.control.planned}</b>
            </span>
          </div>
          <div>
            🧪 Exámenes: Hechos <b>{summary.exam.done}</b> /{" "}
            <span style={{ color: "red" }}>
              Pendientes <b>{summary.exam.planned}</b>
            </span>
          </div>
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={openCreate}>
            + Añadir registro
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>{editingId ? "Editar registro" : "Nuevo registro"}</b>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div>
              <small>Tipo</small>
              <select value={type} onChange={(e) => setType(e.target.value as EntryType)}>
                <option value="control">Control</option>
                <option value="chemo">Quimioterapia</option>
                <option value="exam">Examen</option>
                <option value="med">Medicamento (toma)</option>
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
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Qué llevar, preguntas, etc." />
            </div>

            <div>
              <small>Profesional (opcional)</small>
              <select value={professionalId} onChange={(e) => setProfessionalId(e.target.value)}>
                <option value="">(sin profesional)</option>
                {professionals.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.specialty}
                  </option>
                ))}
              </select>
            </div>

            {/* ✅ Adjuntar archivo EN CREAR/EDITAR */}
            <div>
              <small>Adjuntar archivo (opcional)</small>
              <input
                type="file"
                accept="application/pdf,image/*"
                disabled={!activeCaseId}
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
              />
              {!activeCaseId && (
                <small style={{ color: "red" }}>Para adjuntar archivos necesitas un caso activo (nube).</small>
              )}
              {newFile && (
                <small>
                  Seleccionado: <b>{newFile.name}</b>
                </small>
              )}
              {uploadingEntryId && <small>Subiendo archivo…</small>}
            </div>

            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn" onClick={saveEntry}>
                {editingId ? "Guardar cambios" : "Guardar"}
              </button>
              <button
                className="btn2"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Filtrar</b>
        <select value={filter} onChange={(e) => setFilter(e.target.value as any)} style={{ marginTop: 8 }}>
          <option value="all">Todo</option>
          <option value="control">Controles</option>
          <option value="chemo">Quimioterapias</option>
          <option value="exam">Exámenes</option>
          <option value="med">Medicamentos (tomas)</option>
        </select>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map((e) => {
          const atts = ((e.attachments || []) as any[]) as Attachment[];

          return (
            <div className="card" key={e.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                <div>
                  <b>{e.title}</b>
                  <div>
                    <small>
                      {typeLabel(e.type)} • {new Date(e.dateTime).toLocaleString()}
                    </small>
                  </div>

                  <div>
                    <small>
                      Estado:{" "}
                      <span style={{ color: e.status === "planned" ? "red" : "inherit" }}>{statusLabel(e.status)}</span>
                    </small>
                  </div>

                  {/* ✅ Autoría */}
                  <div style={{ marginTop: 6 }}>
                    {e.createdByEmail && (
                      <div>
                        <small>Creado por: {e.createdByEmail}</small>
                      </div>
                    )}
                    {e.updatedByEmail && (
                      <div>
                        <small>Última edición: {e.updatedByEmail}</small>
                      </div>
                    )}
                  </div>
                </div>

                <div style={{ display: "grid", gap: 8 }}>
                  {(e.type === "control" || e.type === "exam" || e.type === "chemo") && (
                    <button className="btn2" onClick={() => exportICS(e)}>
                      Añadir al Calendario
                    </button>
                  )}

                  {/* ✅ Adjuntar también desde la tarjeta */}
                  <label className="btn2" style={{ cursor: "pointer", textAlign: "center" }}>
                    {uploadingEntryId === e.id ? "Subiendo…" : "Adjuntar PDF/foto"}
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      style={{ display: "none" }}
                      disabled={!activeCaseId || uploadingEntryId === e.id}
                      onChange={(ev) => {
                        const file = ev.target.files?.[0];
                        ev.target.value = "";
                        if (file) addAttachmentToExisting(e, file);
                      }}
                    />
                  </label>

                  {/* ✅ Editar */}
                  <button className="btn2" onClick={() => openEdit(e)}>
                    Editar
                  </button>

                  <button className="btn2" onClick={() => toggleDone(e)}>
                    {e.status === "done" ? "Marcar pendiente" : "Marcar realizado"}
                  </button>

                  <button className="btn2" onClick={() => deleteEntry(e.id)}>
                    Eliminar
                  </button>
                </div>
              </div>

              {(e.doseAmount || e.doseUnit) && (
                <div style={{ marginTop: 8 }}>
                  <small>
                    Cantidad: {e.doseAmount ?? ""} {e.doseUnit ?? ""}
                  </small>
                </div>
              )}
              {e.location && (
                <div style={{ marginTop: 4 }}>
                  <small>Lugar: {e.location}</small>
                </div>
              )}
              {e.notes && <div style={{ marginTop: 8 }}>{e.notes}</div>}

              {/* ✅ Lista de adjuntos */}
              {!!atts.length && (
                <div style={{ marginTop: 12 }}>
                  <b>Adjuntos</b>
                  <div style={{ marginTop: 6, display: "grid", gap: 6 }}>
                    {atts.map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                        {a.name}
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {!filtered.length && <div className="card">Sin registros aún.</div>}
      </div>
    </div>
  );
}
