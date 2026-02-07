import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { auth, db, storage } from "../lib/firebase";
import { signOut } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import type { Professional } from "../lib/types";

function nowISO() {
  return new Date().toISOString();
}

function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

type EntryStatus = "planned" | "done" | "cancelled";

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
  type: string;
  title: string;
  dateTime: string;
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

// Un solo “caso” global
const GLOBAL_DOC = doc(db, "app", "global");
const ENTRIES_COL = collection(db, "app", "global", "entries");
const PROS_COL = collection(db, "app", "global", "professionals");

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

function normalizeTypeKey(input: string) {
  return input.trim().toLowerCase().replace(/\s+/g, "_");
}

export default function Home() {
  const r = useRouter();

  const [ready, setReady] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [types, setTypes] = useState<string[]>(DEFAULT_TYPES);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [filter, setFilter] = useState<string>("all");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [uploadingEntryId, setUploadingEntryId] = useState<string | null>(null);
  const [newFile, setNewFile] = useState<File | null>(null);

  // manage types UI
  const [showManageTypes, setShowManageTypes] = useState(false);

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

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        setUserEmail(null);
        setReady(true);
        return;
      }
      setUserEmail(u.email ?? null);
      await ensureGlobalDoc();
      await refresh();
      setReady(true);
    });
    return () => unsub();
  }, []);

  async function ensureGlobalDoc() {
    const snap = await getDoc(GLOBAL_DOC);
    if (!snap.exists()) {
      await setDoc(GLOBAL_DOC, {
        types: DEFAULT_TYPES,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setTypes(DEFAULT_TYPES);
      if (!DEFAULT_TYPES.includes(type)) setType(DEFAULT_TYPES[0]);
      return;
    }
    const data: any = snap.data();
    const t = Array.isArray(data.types) && data.types.length ? data.types : DEFAULT_TYPES;
    setTypes(t);
    if (!t.includes(type)) setType(t[0] || "control");
  }

  async function refresh() {
    const gSnap = await getDoc(GLOBAL_DOC);
    if (gSnap.exists()) {
      const data: any = gSnap.data();
      const t = Array.isArray(data.types) && data.types.length ? data.types : DEFAULT_TYPES;
      setTypes(t);
      if (!t.includes(type)) setType(t[0] || "control");
    }

    const eQ = query(ENTRIES_COL, orderBy("dateTime", "desc"));
    const pQ = query(PROS_COL, orderBy("name", "asc"));
    const [eSnap, pSnap] = await Promise.all([getDocs(eQ), getDocs(pQ)]);

    setEntries(eSnap.docs.map((d) => d.data() as Entry));
    setProfessionals(pSnap.docs.map((d) => d.data() as Professional));
  }

  const summary = useMemo(() => {
    const done = entries.filter((e) => e.status === "done");
    const planned = entries.filter((e) => e.status === "planned");
    const count = (arr: Entry[], t: string) => arr.filter((e) => e.type === t).length;

    return types.map((t) => ({
      key: t,
      label: labelForType(t),
      done: count(done, t),
      planned: count(planned, t),
      usedTotal: count(entries, t)
    }));
  }, [entries, types]);

  const filtered = useMemo(() => {
    if (filter === "all") return entries;
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  function resetForm() {
    setEditingId(null);
    setType(types[0] || "control");
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
    const u = auth.currentUser;
    if (!u) return alert("Debes estar logueada.");

    const raw = prompt("Nuevo tipo (ej: PSA, TAC, Resonancia, Traumatólogo, Radioterapia)");
    if (!raw) return;

    const key = normalizeTypeKey(raw);
    const next = Array.from(new Set([...types, key]));

    await updateDoc(GLOBAL_DOC, { types: next, updatedAt: serverTimestamp() });

    setTypes(next);
    resetForm();
    setType(key);
    setShowForm(true);
  }

  // ✅ BORRAR TIPO (incluye los base) PERO:
  // - bloquea si hay registros usando ese tipo
  // - evita quedar con 0 tipos
  async function deleteType(typeKey: string) {
    const usedCount = entries.filter((e) => e.type === typeKey).length;

    if (usedCount > 0) {
      return alert(
        `No se puede borrar "${labelForType(typeKey)}" porque tiene ${usedCount} registro(s) asociado(s).\n\nPrimero edita esos registros y cámbiales el "Tipo", y luego podrás borrarlo.`
      );
    }

    if (types.length <= 1) {
      return alert("No puedes borrar el último tipo. Debe existir al menos 1 tipo.");
    }

    const ok = confirm(`¿Eliminar el tipo "${labelForType(typeKey)}"?\nSe eliminará del Resumen y de las listas desplegables.`);
    if (!ok) return;

    const nextTypes = types.filter((t) => t !== typeKey);
    await updateDoc(GLOBAL_DOC, { types: nextTypes, updatedAt: serverTimestamp() });

    setTypes(nextTypes);

    if (filter === typeKey) setFilter("all");
    if (type === typeKey) setType(nextTypes[0] || "control");
  }

  async function uploadAttachment(entryId: string, file: File): Promise<Attachment> {
    const attId = crypto.randomUUID();
    const safeName = file.name.replace(/[^\w.\- ()]/g, "_");
    const path = `app/global/entries/${entryId}/${attId}-${safeName}`;

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
      const u = auth.currentUser;
      if (!u) return alert("Debes estar logueada.");

      setUploadingEntryId(entry.id);

      const att = await uploadAttachment(entry.id, file);
      const current = entry.attachments || [];

      const updated: Entry = stripUndefined({
        ...entry,
        attachments: [...current, att],
        updatedAt: nowISO(),
        updatedByUid: u.uid,
        updatedByEmail: u.email || undefined
      });

      await setDoc(doc(db, "app", "global", "entries", entry.id), stripUndefined(updated));
      await refresh();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo subir el archivo");
    } finally {
      setUploadingEntryId(null);
    }
  }

  async function saveEntry() {
    const u = auth.currentUser;
    if (!u) return alert("Debes estar logueada.");
    if (!title.trim()) return alert("Falta título (ej: PSA / Control / Quimio ciclo 2)");

    if (!types.includes(type)) {
      const next = Array.from(new Set([...types, type]));
      await updateDoc(GLOBAL_DOC, { types: next, updatedAt: serverTimestamp() });
      setTypes(next);
    }

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

    await setDoc(doc(db, "app", "global", "entries", entry.id), stripUndefined(entry));

    if (newFile) {
      try {
        setUploadingEntryId(entry.id);
        const att = await uploadAttachment(entry.id, newFile);
        const updated: Entry = stripUndefined({
          ...entry,
          attachments: [...(entry.attachments || []), att],
          updatedAt: nowISO(),
          updatedByUid: u.uid,
          updatedByEmail: u.email || undefined
        });
        await setDoc(doc(db, "app", "global", "entries", entry.id), stripUndefined(updated));
      } finally {
        setUploadingEntryId(null);
        setNewFile(null);
      }
    }

    await refresh();
    setShowForm(false);
    resetForm();
  }

  async function toggleDone(e: Entry) {
    const u = auth.currentUser;
    if (!u) return alert("Debes estar logueada.");

    const updated: Entry = stripUndefined({
      ...e,
      status: e.status === "done" ? "planned" : "done",
      updatedAt: nowISO(),
      updatedByUid: u.uid,
      updatedByEmail: u.email || undefined
    });

    await setDoc(doc(db, "app", "global", "entries", updated.id), stripUndefined(updated));
    await refresh();
  }

  async function deleteEntry(id: string) {
    if (!confirm("¿Eliminar este registro?")) return;
    await deleteDoc(doc(db, "app", "global", "entries", id));
    await refresh();
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

  async function logout() {
    await signOut(auth);
    r.replace("/login");
  }

  if (!ready) return null;

  return (
    <div className="container">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 700 }}>Control Onco Papá</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {userEmail ? (
            <>
              <small>{userEmail}</small>
              <button className="btn2" onClick={logout}>Cerrar sesión</button>
            </>
          ) : (
            <button className="btn2" onClick={() => r.push("/login")}>Entrar</button>
          )}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <b>Resumen (Hechos / Pendientes)</b>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn2" onClick={() => setShowManageTypes((v) => !v)}>
              {showManageTypes ? "Cerrar" : "Administrar tipos"}
            </button>
            <button className="btn2" onClick={addType}>Agregar tipo</button>
          </div>
        </div>

        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {summary.map((s) => {
            const disabled = s.usedTotal > 0 || types.length <= 1;
            const reason =
              s.usedTotal > 0
                ? "No se puede borrar porque tiene registros."
                : types.length <= 1
                ? "No puedes borrar el último tipo."
                : "";

            return (
              <div key={s.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  {s.label}: Hechos <b>{s.done}</b> /{" "}
                  <span style={{ color: "red" }}>
                    Pendientes <b>{s.planned}</b>
                  </span>
                </div>

                {showManageTypes && (
                  <button
                    className="btn2"
                    onClick={() => deleteType(s.key)}
                    disabled={disabled}
                    title={reason}
                    style={disabled ? { opacity: 0.5, cursor: "not-allowed" } : undefined}
                  >
                    Borrar tipo
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={openCreate}>+ Añadir registro</button>
        </div>

        {showManageTypes && (
          <div style={{ marginTop: 10 }}>
            <small>
              Para borrar un tipo (incluidos los base), debe tener 0 registros asociados.
              Si está deshabilitado, pasa el mouse para ver el motivo.
            </small>
          </div>
        )}
      </div>

      {/* Form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>{editingId ? "Editar registro" : "Nuevo registro"}</b>

          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            <div>
              <small>Tipo</small>
              <select value={type} onChange={(e) => setType(e.target.value)}>
                {types.map((t) => (
                  <option key={t} value={t}>{labelForType(t)}</option>
                ))}
              </select>
            </div>

            <div>
              <small>Título</small>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: PSA / Control Urología" />
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
                <input value={doseUnit} onChange={(e) => setDoseUnit(e.target.value)} placeholder="Ej: mg / ml / comp" />
              </div>
            </div>

            <div>
              <small>Lugar (opcional)</small>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Ej: Hospital / Clínica" />
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
              <input type="file" accept="application/pdf,image/*" onChange={(e) => setNewFile(e.target.files?.[0] || null)} />
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

      {/* Filtro */}
      <div className="card" style={{ marginBottom: 12 }}>
        <b>Filtrar</b>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ marginTop: 8 }}>
          <option value="all">Todo</option>
          {types.map((t) => (
            <option key={t} value={t}>{labelForType(t)}</option>
          ))}
        </select>
      </div>

      {/* Lista */}
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
