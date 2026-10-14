import type { AmazonProduct } from "./parse";

/**
 * Mărci mari / proprii Amazon: nu are sens să intri cu marcă proprie din China pe produsul lor
 * (cumpărătorul caută marca, nu tipul de produs).
 */
const BIG_BRANDS = [
  "amazon basics", "amazonbasics", "amazon fire", "amazon echo", "echo", "fire tv", "kindle", "blink", "alexa",
  "apple", "airpods", "airtag", "ipad", "macbook", "samsung", "google", "xiaomi", "huawei", "oneplus",
  "duracell", "varta", "energizer", "panasonic", "philips", "bosch", "braun", "oral-b", "gillette", "nivea", "l'oréal", "loreal",
  "garnier", "dyson", "lego", "playmobil", "hasbro", "mattel", "nintendo", "sony", "playstation", "xbox", "microsoft",
  "logitech", "anker", "soundcore", "ugreen", "tp-link", "jbl", "bose", "tefal", "wmf", "fiskars", "kärcher", "karcher",
  "makita", "dewalt", "einhell", "black+decker", "stanley", "milwaukee", "cosori", "russell hobbs",
  "de'longhi", "delonghi", "nespresso", "lavazza", "haribo", "kinder", "ferrero", "lindt", "colgate", "sensodyne",
  "pampers", "huggies", "nike", "adidas", "puma", "crocs", "levi's", "hp", "canon", "epson", "brother", "sandisk",
  "kingston", "seagate", "toshiba", "lenovo", "garmin", "fitbit", "gopro", "ariel", "persil", "lenor",
  "dettol", "vileda", "leifheit", "zwilling", "emsa", "tesa", "pritt", "stabilo", "faber-castell", "staedtler", "uhu",
  "wd-40", "osram", "eufy", "roborock", "whiskas", "felix", "pedigree", "royal canin", "purina", "frontline",
  "seresto", "torras", "tocol", "jetech", "spigen", "esr", "otterbox", "belkin", "baseus", "tado", "netgear", "avm", "fritz",
  "rossmann", "balea", "cerave", "la roche-posay", "the ordinary", "maybelline", "rimmel", "olaplex", "babyliss", "remington",
];

const RESTRICTED: [RegExp, string][] = [
  [/batter(y|ies)|batterie|akku|lithium|knopfzelle|button cell|powerbank|power bank/i, "Baterii – restricții la transport aerian"],
  [/aerosol|spray|parfum|perfume|eau de|nagellack|nail polish|e-?liquid|vape|lighter|feuerzeug/i, "Lichid/aerosol – restricții transport"],
  [/coffee|kaffee|\btea\b|\btee\b|nahrungs|supplement|vitamin|protein|kapseln|capsules|whey|snack|chocolate|schokolade|food|lebensmittel|tablets? für|dishwasher tabs/i, "Aliment/consumabil – avize și concurență pe preț"],
  [/\bbook\b|\bbuch\b|gutschein|gift card|geschenkkarte|kindle edition|\bdvd\b|blu-?ray|vinyl|software|download|abonnement|subscription/i, "Produs digital/media"],
  [/medizin|medical device|blutdruck|blood pressure|thermometer|pregnancy test|schwangerschaftstest|kontaktlinsen|contact lens/i, "Dispozitiv medical – reglementat"],
];

const MODEL_SPECIFIC = /\b(for|für|pour|compatible with|kompatibel mit)\s+(the\s+)?(apple\s+)?(iphone|samsung|galaxy|ipad|airpods|apple watch|pixel|macbook|switch|ps5|playstation|xbox|airtag|fire tv|echo)\b|\biphone\s?\d{1,2}\b|\bgalaxy\s?[saz]\d{1,2}\b/i;

export type Fit = { ok: boolean; flags: string[] };

export function brandOf(title: string): string | undefined {
  const t = title.toLowerCase();
  const head = t.split(/\s+/).slice(0, 3).join(" ");
  return BIG_BRANDS.find(b => head.startsWith(b + " ") || head === b || new RegExp(`(^|[\\s(,])${b.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([\\s®™,)]|$)`).test(t.slice(0, 80)));
}

/** Este produsul potrivit pentru import cu marcă proprie (generic, fără restricții)? */
export function assessFit(p: AmazonProduct): Fit {
  const flags: string[] = [];
  const brand = brandOf(p.title);
  if (brand) flags.push(`Marcă mare (${brand})`);
  for (const [re, label] of RESTRICTED) if (re.test(p.title)) flags.push(label);
  if (MODEL_SPECIFIC.test(p.title)) flags.push("Accesoriu pentru un model anume");
  if (p.price !== undefined && p.price < 8) flags.push("Preț prea mic pentru import");
  return { ok: flags.length === 0, flags };
}
