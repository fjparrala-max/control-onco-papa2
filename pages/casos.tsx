// pages/casos.tsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "../lib/firebase";
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from "firebase/firestore";

type CaseDoc = {
  id: string;
  name: string;
  createdAt?: any;
  ownerUid: string;
  types?: string[]; // para tipos personalizados
};

export default function Casos() {
  const r = useRouter();
  const [cases, setCases] = useState<CaseDoc[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadCases() {
    const u = auth.currentUser;
    if (!u) return;

    const q = query(collection(db, "cases"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    // Versión simple: filtra por ownerUid
    const list = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((c) => c.ownerUid === u.uid) as CaseDoc[];

    setCases(list);
  }

  useEffect(() => {
    loadCases();
  }, []);

  async function createCase() {
    const u = auth.currentUser;
    if (!u) return alert("No estás logueada");
    if (!name.trim()) return alert("Pon un nombre de caso");

    setLoading(true);
    try {
      const docRef = await addDoc(collection(db, "cases"), {
        name: name.trim(),
        ownerUid: u.uid,
        createdAt: serverTimestamp(),
        // tipos base + tu idea de expandir:
        types: ["control", "chemo", "exam", "med"]
      });

      localStorage.setItem("activeCaseId", docRef.id);
      r.push("/");
    } catch (e: any) {
      alert(e?.message || "No se pudo crear caso");
    } finally {
      setLoading(false);
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
          <button className="btn" onClick={createCase} disabled={loading}>
            {loading ? "Creando..." : "Crear"}
          </button>
        </div>
      </div>

      <div className="card">
        <b>Mis casos</b>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          {cases.map((c) => (
            <div key={c.id} className="card" style={{ margin: 0 }}>
              <b>{c.name}</b>
              <div style={{ marginTop: 8 }}>
                <button className="btn2" onClick={() => openCase(c.id)}>
                  Abrir
                </button>
              </div>
            </div>
          ))}
          {!cases.length && <small>No hay casos aún. Crea uno arriba.</small>}
        </div>
      </div>
    </div>
  );
}
