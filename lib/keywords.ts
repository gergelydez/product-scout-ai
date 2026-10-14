import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export type KeywordResult = { keywords: string[]; engine: "claude" | "google" | "simplu" };

/** Scurtează un titlu Amazon la partea descriptivă: înainte de virgulă / cratimă / paranteză. */
export function shortTitle(title: string): string {
  const head = title.split(/\s[-–|:]\s|,|\(|\[/)[0] ?? title;
  return head.replace(/[®™©]/g, "").split(/\s+/).slice(0, 7).join(" ").trim();
}

const Schema = z.object({ keywords: z.array(z.object({ i: z.number().int(), keyword: z.string() })) });

async function viaClaude(titles: string[]): Promise<string[]> {
  const client = new Anthropic();
  const list = titles.map((t, i) => `${i}. ${t}`).join("\n");
  const res = await client.messages.parse({
    model: "claude-opus-5-5",
    max_tokens: 4000,
    output_config: { effort: "low", format: zodOutputFormat(Schema) },
    messages: [{
      role: "user",
      content: `Pentru fiecare titlu de produs Amazon de mai jos, scrie cuvântul-cheie generic în limba română pe care un cumpărător din România l-ar căuta pe eMAG.ro pentru acel tip de produs.
Reguli: 2–4 cuvinte, litere mici, fără brand, model, cantitate, dimensiuni sau culoare; folosește termenul uzual din comerțul online românesc (ex. „organizator portbagaj”, „lampa de veghe copii”, „suport telefon masina”).
Răspunde cu câte un element pentru fiecare index.

${list}`,
    }],
  });
  if (res.stop_reason === "refusal" || !res.parsed_output) throw new Error("Claude nu a returnat cuvinte-cheie");
  const out = titles.map(() => "");
  for (const k of res.parsed_output.keywords) if (k.i >= 0 && k.i < out.length) out[k.i] = k.keyword.trim();
  return out;
}

/** Traducere gratuită (endpoint public Google Translate); poate fi limitată ca rată. */
async function viaGoogle(titles: string[]): Promise<string[]> {
  return Promise.all(titles.map(async t => {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=ro&dt=t&q=${encodeURIComponent(shortTitle(t))}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Google Translate HTTP ${res.status}`);
    const data = (await res.json()) as [[string, string][]];
    return data[0].map(x => x[0]).join("").toLowerCase().split(/\s+/).slice(0, 5).join(" ");
  }));
}

export async function toRomanianKeywords(titles: string[]): Promise<KeywordResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const keywords = await viaClaude(titles);
      if (keywords.every(Boolean)) return { keywords, engine: "claude" };
    } catch {
      // cheie invalidă, limită de rată sau refuz: continuăm cu traducerea gratuită
    }
  }
  try {
    return { keywords: await viaGoogle(titles), engine: "google" };
  } catch {
    return { keywords: titles.map(t => shortTitle(t).toLowerCase()), engine: "simplu" };
  }
}
