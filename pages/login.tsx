import { useEffect, useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter } from "next/router";

export default function Login() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) r.replace("/casos");
    });
    return () => unsub();
  }, [r]);

  async function login() {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      r.replace("/casos");
    } catch (e: any) {
      alert(e?.message || "No se pudo iniciar sesión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Control Onco Papá</h1>
      <div className="card">
        <b>Iniciar sesión</b>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div>
            <small>Email</small>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@..." />
          </div>
          <div>
            <small>Contraseña</small>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
          </div>
          <button className="btn" onClick={login} disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
