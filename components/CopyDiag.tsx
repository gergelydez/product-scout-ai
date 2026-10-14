"use client";

import { useState } from "react";

/** Buton care copiază detaliile tehnice, ca utilizatorul să le poată lipi în chat. */
export default function CopyDiag({ lines }: { lines: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = lines.join("\n").slice(0, 12000);
  return <div style={{ margin: "8px 0" }}>
    <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); } }}>{copied ? "Copiat ✓ – lipește-l în chat" : "Copiază diagnosticul"}</button>
    <details className="footnote" style={{ marginTop: 6 }}><summary>Detalii tehnice</summary><textarea readOnly value={text} style={{ width: "100%", height: 140, fontSize: 10 }} /></details>
  </div>;
}
