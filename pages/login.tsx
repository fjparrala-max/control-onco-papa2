import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "../lib/firebase";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUserEmail(u?.email ?? null);
      setLoading(false);
      if (u) router.replace("/casos");
    });
    return () => unsub();
  }, [router]);

  async function login() {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e: any) {
      alert(e?.message || "Error al iniciar sesión");
    }
  }

  async function register() {
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), pass);
    } catch (e: any) {
      alert(e?.message || "Error al crear cuenta");
    }
  }

  async function logout() {
    await signOut(auth);
  }

  if (loading) return <div className="container"><div className="card">Cargando…</div></div>;

  return (
    <div className="container">
      <h1>Acceso</h1>

      <div className="card" style={{ marginBottom: 12 }}>
        <b>Iniciar sesión / Crear cuenta</b>

        <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
          <div>
            <small>Correo</small>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
          </div>
          <div>
            <small>Clave</small>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="mín. 6 caracteres" />
          </div>

          <div className="row">
            <button className="btn" onClick={login}>Entrar</button>
            <button className="btn2" onClick={register}>Crear cuenta</button>
          </div>

          {userEmail && (
            <button className="btn2" onClick={logout}>Cerrar sesión</button>
          )}

          <small>Tip: crea una cuenta para ti y otra para cada familiar que quieras invitar.</small>
        </div>
      </div>
    </div>
  );
}
