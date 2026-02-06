import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { addDoc, collection, getDocs, serverTimestamp, setDoc, doc } from "firebase/firestore";

type CaseIndex = {
  id: string;
  name: string;
  role: "admin" | "member";
};

export default function CasosPage() {
  const router = useRouter();
  const [uid, setUid] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseIndex[]>([]);
  const [name, setName] = useState("");
  const [joinId, setJoinId] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function loadCases(userId: string) {
    setMsg("Cargando casos…");
    const snap = await getDocs(collection(db, "caseMembers", userId, "cases"));
    const list: CaseIndex[] = snap.docs.map((d) => {
      const data = d.data() as any;
      return { id: d.id, name: data.name || "(Sin nombre)", role: data.role || "member" };
    });
    list.sort((a, b) => a.name.localeCompare(b.name));
    setCases(list);
    setMsg("");
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      try {
        if (!u) {
          router.replace("/login");
          return;
        }
        setUid(u.uid);
        setLoading(true);
        await loadCases(u.uid);
      } catch (e: any) {
        console.error(e);
        setMsg(e?.message || "Error cargando casos");
        alert(e?.message || "Error cargando casos");
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  async function createCase() {
    if (!uid) return;
    const nm = name.trim();
    if (!nm) return alert("Pon un nombre, ej: Papá Sergio");

    try {
      setCreating(true);
      setMsg("Creando caso…");

      // 1) Crear caso
      const ref = await addDoc(collection(db, "cases"), {
        name: nm,
        createdBy: uid,
        members: { [uid]: "admin" },
        createdAt: serverTimestamp()
      });

      // 2) Índice para listar casos del usuario (rápido)
      await setDoc(doc(db, "caseMembers", uid, "cases", ref.id), {
        name: nm,
        role: "admin",
        addedAt: serverTimestamp()
      });

      setName("");
      await loadCases(uid);

      // 3) Dejarlo activo y volver a Home
      localStorage.setItem("activeCaseId", ref.id);
      router.push("/");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo crear el caso");
      setMsg(e?.message || "No se pudo crear el caso");
    } finally {
      setCreating(false);
      setMsg("");
    }
  }

  // ✅ Unirse a un caso por ID (para familiares)
  async function joinCase() {
    if (!uid) return;
    const caseId = joinId.trim();
    if (!caseId) return alert("Pega el ID del caso");

    try {
      setJoining(true);
      setMsg("Uniéndome al caso…");

      // MVP: solo creamos el índice en el usuario (aparece en su lista)
      await setDoc(doc(db, "caseMembers", uid, "cases", caseId), {
        name: "(pendiente)",
        role: "member",
        addedAt: serverTimestamp()
      });

      setJoinId("");
      await loadCases(uid);
      setMsg("");
      alert("Listo. El caso debería aparecer en tu lista.");
    } catch (e: any) {
      console.error(e);
      alert(e?.message || "No se pudo unir al caso");
      setMsg(e?.message || "No se pudo unir al caso");
    } finally {
      setJoining(false);
      setMsg("");
    }
  }

  async function openCase(caseId: string) {
    localStorage.setItem("activeCaseId", caseId);
    router.push("/");
  }

  async function logout() {
    await signOut(auth);
    router.replace("/login");
  }

  const active = typeof window !== "undefined" ? localStorage.getItem("activeCaseId") : null;

  if (loading) {
    return (
      <div className="container">
        <h1>Casos</h1>
        <div className="card">{msg || "Cargando…"}</div>
      </div>
    );
  }

  return (
    <div className="container">
      <h1>Casos</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Crear caso compartido</b>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Papá Sergio" />
          <button className="btn" onClick={createCase} disabled={creating}>
            {creating ? "Creando…" : "Crear"}
          </button>
          {msg && <small>{msg}</small>}
        </div>
      </div>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Unirme a un caso por ID</b>
        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <input value={joinId} onChange={(e) => setJoinId(e.target.value)} placeholder="Pega aquí el ID del caso" />
          <button className="btn2" onClick={joinCase} disabled={joining}>
            {joining ? "Uniéndome…" : "Unirme"}
          </button>
          <small>Tu familiar te pasa el “ID” del caso y listo.</small>
        </div>
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {cases.map((c) => (
          <div className="card" key={c.id}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <div>
                <b>{c.name}</b>
                <div>
                  <small>
                    Rol: {c.role} {active === c.id ? "• (Activo)" : ""}
                  </small>
                </div>
                <div><small>ID: {c.id}</small></div>
              </div>
              <button className="btn2" onClick={() => openCase(c.id)}>Abrir</button>
            </div>
          </div>
        ))}
        {!cases.length && <div className="card">No tienes casos aún.</div>}
      </div>

      <div style={{ marginTop: 12 }} className="row">
        <button className="btn2" onClick={logout}>Cerrar sesión</button>
      </div>
    </div>
  );
}
