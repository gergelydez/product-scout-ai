"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Înregistrează service worker-ul și arată butonul „Instalează” când browserul permite. */
export default function InstallApp() {
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    const onPrompt = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setEvt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed) return <span className="pill">● Aplicație instalată</span>;
  if (!evt) return <span className="pill hide-mobile">● Live · eMAG · Amazon</span>;
  return <button className="installbtn" onClick={async () => { await evt.prompt(); await evt.userChoice; setEvt(null); }}><Download size={14} /> Instalează aplicația</button>;
}
