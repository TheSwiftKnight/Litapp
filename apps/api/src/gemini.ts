import { z } from "zod";

const GeminiLookupResponseSchema = z.any();

type GeminiMessage = { role: "user" | "model" | "system"; content: string };

export async function callGeminiJson({
  prompt,
  responseSchema
}: {
  prompt: string;
  responseSchema: z.ZodTypeAny;
}): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }

  // Gemini REST endpoint (MVP).
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json"
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    // Query param key is required by Gemini API.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    body: JSON.stringify(body) as any
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gemini request failed: ${res.status} ${text}`);
  }

  const json = await res.json();
  const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error("Gemini response missing content text");

  // Gemini may return a JSON string. Try to parse.
  let parsed: unknown;
  try {
    parsed = typeof rawText === "string" ? JSON.parse(rawText) : rawText;
  } catch {
    parsed = rawText;
  }

  return responseSchema.parse(parsed);
}

