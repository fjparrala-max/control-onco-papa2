import { useEffect, useMemo, useState } from "react";
import { localDB } from "../lib/db";
import { db } from "../lib/firebase";
import type { Professional } from "../lib/types";
import { collection, deleteDoc, doc, getDocs, orderBy, query, setDoc } from "firebase/firestore";

// Firestore NO acepta undefined → lo removemos
function stripUndefined<T extends Record<string, any>>(obj: T): T {
  const out: any = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}

function nowISO() {
  return new Date().toISOString();
}

export default function ProfesionalesPage() {
  const [activeCaseId, setActiveCaseId] = useState<string>("");
  const [pros, setPros] = useState<Professional[]>([]);
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [center, setCenter] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const id = typeof window !== "undefined" ? localStorage.getItem("activeCaseId") : null;
    setActiveCaseId(id || "");
  }, []);

  async function refresh() {
    if (activeCaseId) {
      const qy = query(collection(db, "cases", activeCaseId, "professionals"), orderBy("name", "asc"));
      const snap = await getDocs(qy);
      setPros(snap.docs.map((d) => d.data() as Professional));
      return;
    }

    const p = await localDB.professionals.orderBy("name").toArray();
    setPros(p);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCaseId]);

  const bySpecialty = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pros) map.set(p.specialty, (map.get(p.specialty) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [pros]);

  async function addProfessional() {
    if (!name.trim() || !specialty.trim()) {
      alert("Falta Nombre y Especialidad");
      return;
    }
    const ts = nowISO();
    const prof: Professional = {
      id: crypto.randomUUID(),
      name: name.trim(),
      specialty: specialty.trim(),
      center: center.trim() || undefined,
      phone: phone.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: ts,
      updatedAt: ts
    };

    if (activeCaseId) {
      await setDoc(doc(db, "cases", activeCaseId, "professionals", prof.id), stripUndefined(prof));
    } else {
      await localDB.professionals.put(prof);
    }

    setName("");
    setSpecialty("");
    setCenter("");
    setPhone("");
    setNotes("");
    await refresh();
  }

  async function deleteProfessional(id: string) {
    if (!confirm("¿Eliminar este profesional?")) return;

    if (activeCaseId) {
      await deleteDoc(doc(db, "cases", activeCaseId, "professionals", id));
    } else {
      await localDB.professionals.delete(id);
    }

    await refresh();
  }

  return (
    <div className="container">
      <h1>Profesionales</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <small>
          {activeCaseId ? <>✅ Guardando en nube • Caso: {activeCaseId}</> : <>⚠️ Guardando local</>}
        </small>
        <div className="row" style={{ marginTop: 10 }}>
          <a href="/" className="btn2" style={{ textDecoration: "none" }}>← Volver</a>
          <a href="/casos" className="btn2" style={{ textDecoration: "none" }}>Casos</a>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Agregar profesional</b>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div className="row">
            <div style={{ flex: 1 }}>
              <small>Nombre</small>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Dr. Juan Pérez" />
            </div>
            <div style={{ flex: 1 }}>
              <small>Especialidad</small>
              <input value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="Ej: Urología" />
            </div>
          </div>

          <div className="row">
            <div style={{ flex: 1 }}>
              <small>Centro (opcional)</small>
              <input value={center} onChange={(e) => setCenter(e.target.value)} placeholder="Clínica / Hospital" />
            </div>
            <div style={{ flex: 1 }}>
              <small>Teléfono (opcional)</small>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+56 9 ..." />
            </div>
          </div>

          <div>
            <small>Notas (opcional)</small>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Observaciones" />
          </div>

          <button className="btn" onClick={addProfessional}>Guardar profesional</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Resumen por especialidad</b>
        <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
          {bySpecialty.length ? bySpecialty.map(([s, n]) => (
            <div key={s}>{s}: <b>{n}</b></div>
          )) : <small>Aún no hay profesionales.</small>}
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {pros.map((p) => (
          <div className="card" key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <b>{p.name}</b>
                <div><small>{p.specialty}</small></div>
                {p.center && <div><small>Centro: {p.center}</small></div>}
                {p.phone && <div><small>Tel: {p.phone}</small></div>}
              </div>
              <button className="btn2" onClick={() => deleteProfessional(p.id)}>Eliminar</button>
            </div>
            {p.notes && <div style={{ marginTop: 8 }}>{p.notes}</div>}
          </div>
        ))}
        {!pros.length && <div className="card">Sin profesionales aún.</div>}
      </div>
    </div>
  );
}
