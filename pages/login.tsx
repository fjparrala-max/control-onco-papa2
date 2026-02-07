// pages/login.tsx
import { useEffect, useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useRouter } from "next/router";

export default function Login() {
  const r = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      if (u) r.replace("/casos");
    });
    return () => unsub();
  }, [r]);

  async function submit() {
    setLoading(true);
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email.trim(), pass);
      } else {
        await createUserWithEmailAndPassword(auth, email.trim(), pass);
      }
      r.replace("/casos");
    } catch (e: any) {
      // Mensajes típicos
      const msg = e?.code === "auth/email-already-in-use"
        ? "Ese correo ya está registrado."
        : e?.code === "auth/weak-password"
        ? "Contraseña muy débil (mínimo 6 caracteres)."
        : e?.code === "auth/invalid-email"
        ? "Email inválido."
        : e?.code === "auth/invalid-credential"
        ? "Credenciales inválidas."
        : (e?.message || "Error al autenticar");
      alert(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <h1>Control Onco Papá</h1>

      <div className="card">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <b>{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</b>
          <button className="btn2" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
            {mode === "login" ? "Crear cuenta" : "Ya tengo cuenta"}
          </button>
        </div>

        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <div>
            <small>Email</small>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@..." />
          </div>
          <div>
            <small>Contraseña</small>
            <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} />
            <small>Mínimo 6 caracteres.</small>
          </div>

          <button className="btn" onClick={submit} disabled={loading}>
            {loading ? "Procesando..." : (mode === "login" ? "Entrar" : "Crear cuenta")}
          </button>
        </div>
      </div>
    </div>
  );
}
