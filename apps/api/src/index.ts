import express from "express";
import cors from "cors";
import { z } from "zod";
import { callGeminiJson } from "./gemini";
import { requireAuth } from "./middleware/requireAuth";
import { db, storage, admin } from "./firebaseAdmin";
import {
  ImportBookRequestSchema,
  ImportBookResponseSchema,
  LookupContextRequestSchema,
  LookupContextResponseSchema,
  ReviewGenerateRequestSchema,
  ReviewGenerateResponseSchema
} from "novel-english-tutor-shared";

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "2mb" }));

app.post("/v1/import-book", requireAuth, async (req, res) => {
  const parsed = ImportBookRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { bookId, ownerUid } = parsed.data;
  const authUid = (req as any).user?.uid as string | undefined;
  if (!authUid || authUid !== ownerUid) return res.status(403).json({ error: "Owner mismatch" });

  const importJobId = `${bookId}_${cryptoRandomId()}`;
  const importJobRef = db.collection("importJobs").doc(importJobId);

  // MVP: enqueue by creating an import job document. Cloud Function worker will parse & write parsed files.
  const now = admin.firestore.FieldValue.serverTimestamp();
  await importJobRef.set({
    ownerUid,
    bookId,
    status: "queued",
    progress: 0,
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  });

  // Update book importStatus to processing-like state (worker will refine).
  await db.collection("books").doc(bookId).set(
    {
      ownerUid,
      importStatus: "queued"
    },
    { merge: true }
  );

  const resp = { status: "queued" as const };
  res.json(ImportBookResponseSchema.parse(resp));
});

app.post("/v1/lookup-context", requireAuth, async (req, res) => {
  const parsed = LookupContextRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const authUid = (req as any).user?.uid as string | undefined;

  if (!authUid) return res.status(401).json({ error: "Unauthorized" });

  const { bookId, chapterId, query, nearbySegmentIds } = parsed.data;
  if (!chapterId) return res.status(400).json({ error: "chapterId required in MVP" });

  // Verify book ownership.
  const bookSnap = await db.collection("books").doc(bookId).get();
  const book = bookSnap.data() as any | undefined;
  if (!book || book.ownerUid !== authUid) return res.status(404).json({ error: "Book not found" });

  const storageRoot = book.storageRoot as string;
  const chapterPath = `${storageRoot}/parsed/chapters/${chapterId}.json`;

  const chapterJson = await readJsonFromStorage(chapterPath);
  const segments: Array<any> = chapterJson.segments ?? [];
  const selectedNearby = segments.filter((s) => nearbySegmentIds.includes(s.id));

  const contextText = selectedNearby.map((s) => s.text).join("\n\n");

  const prompt = buildLookupPrompt({
    query,
    chapterTitle: chapterJson.title ?? "",
    contextText
  });

  const respSchema = LookupContextResponseSchema;
  try {
    const geminiResp = await callGeminiJson({
      prompt,
      responseSchema: respSchema
    });
    const safeResp = respSchema.parse(geminiResp);
    res.json(safeResp);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "LLM lookup failed";
    // MVP fallback: keep UI functional without a Gemini key.
    res.json(
      respSchema.parse({
        query,
        meaningInContext: `LLM not configured: ${msg}`,
        commonMeaning: "",
        differences: "",
        grammarNotes: "",
        collocations: [],
        shouldCreateFlashcard: false,
        flashcardFront: query,
        flashcardBack: `LLM not configured: ${msg}`
      })
    );
  }
});

app.post("/v1/review/generate", requireAuth, async (req, res) => {
  const parsed = ReviewGenerateRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const authUid = (req as any).user?.uid as string | undefined;

  const { cardId } = parsed.data;
  if (!authUid) return res.status(401).json({ error: "Unauthorized" });

  const cardSnap = await db.collection("flashcards").doc(cardId).get();
  const card = cardSnap.data() as any | undefined;
  if (!card || card.ownerUid !== authUid) return res.status(404).json({ error: "Flashcard not found" });

  // MVP: deterministic quiz prompt/answer (still provides an LLM gateway later).
  const prompt = `Read the highlighted phrase and recall its meaning in context:\n\n${card.sourceQuery}\n\nNow explain in your own words what it means in the provided novel context.`;
  const answer = `${card.meaningInContext}\n\nCommon meaning: ${card.commonMeaning}\n\nDifferences: ${card.differences}`;

  const resp = { prompt, answer };
  res.json(ReviewGenerateResponseSchema.parse(resp));
});

const port = process.env.PORT ? Number(process.env.PORT) : 8080;
app.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`api listening on :${port}`);
});

function cryptoRandomId() {
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

async function readJsonFromStorage(path: string) {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) throw new Error("Missing FIREBASE_STORAGE_BUCKET");

  const bucket = storage.bucket(bucketName);
  const [buf] = await bucket.file(path).download();
  return JSON.parse(buf.toString("utf8"));
}

function buildLookupPrompt({
  query,
  chapterTitle,
  contextText
}: {
  query: string;
  chapterTitle: string;
  contextText: string;
}) {
  return [
    "You are a careful English tutor.",
    "",
    "Return STRICT JSON matching the required schema.",
    "",
    "Task:",
    "Given an English phrase from a novel and surrounding context, explain its meaning in context (not the dictionary meaning). Provide grammar notes and differences from the common meaning.",
    "",
    "Decide if this phrase should become a flashcard: shouldCreateFlashcard=true when the phrase/structure is likely learnable and not trivial.",
    "",
    "If shouldCreateFlashcard=true:",
    "- flashcardFront should be short and test recall of the phrase meaning in context.",
    "- flashcardBack should include the meaningInContext plus key hints.",
    "",
    "Context:",
    `Chapter title: ${chapterTitle || "(unknown)"}`,
    "",
    contextText,
    "",
    "Phrase to explain:",
    query,
    "",
    "JSON schema fields:",
    "- query (string): echo the phrase exactly or lightly normalized",
    "- meaningInContext (string)",
    "- commonMeaning (string)",
    "- differences (string)",
    "- grammarNotes (string)",
    "- collocations (array of strings)",
    "- shouldCreateFlashcard (boolean)",
    "- flashcardFront (string)",
    "- flashcardBack (string)"
  ].join("\n");
}

// For response schema typing in MVP. (Gemini output may not exactly match.)
function _unused() {
  // keep file stable
}

app.get("/healthz", (_req, res) => res.json({ ok: true }));

