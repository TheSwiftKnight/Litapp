export function normalizeEnglish(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\\s']/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

export function tokenizeEnglish(s: string) {
  const norm = normalizeEnglish(s);
  if (!norm) return [];
  return norm.split(" ").filter((t) => t.length >= 2);
}

export function ngrams(tokens: string[], n: number) {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) {
    out.push(tokens.slice(i, i + n).join(" "));
  }
  return out;
}

