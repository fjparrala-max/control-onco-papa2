// pages/casos.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "../lib/firebase";
import { addDoc, collection, getDocs, serverTimestamp } from "firebase/firestore";

type CaseDoc = {
  id: string;
  name: string;
  ownerUid: string;
  createdAt?: any;
  types?: string[];
};

const DEFAULT_TYPES = ["control", "chemo", "exam", "med"];

export default function Casos() {
  const r = useRouter();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  async function loadCases() {
    const u = auth.currentUser;
    if (!u) return;

    setLoading(true);
    try {
      const snap = await getDocs(collection(db, "cases"));
      const list = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .filter((c) => c.ownerUid === u.uid) as CaseDoc[];

      // Orden simple (si createdAt existe)
      list.sort((a, b) => {
        const ta = a.createdAt?.seconds ?? 0;
        const tb = b.createdAt?.seconds ?? 0;
        return tb - ta;
      });

      setCases(list);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (!u) return;
      loadCases();
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createCase() {
    const u = auth.currentUser;
    if (!u) return alert("No estás logueada");
    if (!name.trim()) return alert("Pon un nombre de caso");

    setCreating(true);
    try {
      const docRef = await addDoc(collection(db, "cases"), {
        name: name.trim(),
        ownerUid: u.uid,
        createdAt: serverTimestamp(),
        types: DEFAULT_TYPES
      });

      localStorage.setItem("activeCaseId", docRef.id);
      r.push("/");
    } catch (e: any) {
      alert(e?.message || "No se pudo crear caso");
    } finally {
      setCreating(false);
    }
  }

  function openCase(id: string) {
    localStorage.setItem("activeCaseId", id);
    r.push("/");
  }

  return (
    <div className="container">
      <h1>Casos</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Crear caso</b>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Papá Sergio" />
          <button className="btn" onClick={createCase} disabled={creating}>
            {creating ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>

      <div className="card">
        <b>Mis casos</b>

        {loading ? (
          <div style={{ marginTop: 10 }}><small>Cargando casos…</small></div>
        ) : (
          <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
            {cases.map((c) => (
              <div key={c.id} className="card" style={{ margin: 0 }}>
                <b>{c.name}</b>
                <div style={{ marginTop: 8 }}>
                  <button className="btn2" onClick={() => openCase(c.id)}>Abrir</button>
                </div>
              </div>
            ))}
            {!cases.length && <small>No hay casos aún. Crea uno arriba.</small>}
          </div>
        )}
      </div>
    </div>
  );
}
