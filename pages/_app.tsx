import type { AppProps } from "next/app";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { auth } from "../lib/firebase";
import "../styles/globals.css";

const PUBLIC_ROUTES = ["/login"];

export default function App({ Component, pageProps }: AppProps) {
  const r = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      const isPublic = PUBLIC_ROUTES.includes(r.pathname);

      if (!u && !isPublic) r.replace("/login");
      if (u && r.pathname === "/login") r.replace("/");

      setReady(true);
    });
    return () => unsub();
  }, [r]);

  if (!ready) return null;
  return <Component {...pageProps} />;
}
