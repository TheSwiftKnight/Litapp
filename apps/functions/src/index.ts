import * as admin from "firebase-admin";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as pdfParse from "pdf-parse";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import unzipper from "unzipper";
import type { FileType } from "novel-english-tutor-shared";

admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

const bucket = admin.storage().bucket();
const db = admin.firestore();

const MAX_SEGMENT_CHARS = Number(process.env.MAX_SEGMENT_CHARS ?? "1400");
const OVERLAP_CHARS = Number(process.env.SEGMENT_OVERLAP_CHARS ?? "120");

function normalizeEnglish(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\\s']/g, " ")
    .replace(/\\s+/g, " ")
    .trim();
}

function tokenizeEnglish(s: string) {
  const norm = normalizeEnglish(s);
  if (!norm) return [];
  return norm.split(" ").filter((t) => t.length >= 2);
}

function splitIntoChapters(text: string, bookTitle: string | null | undefined) {
  const cleaned = text.replace(/\\r/g, "\\n");

  // Heuristic: split by "Chapter" markers. MVP: if none exist, fallback to 1 chapter.
  const markerRegex = /(\\n|^)\\s*(chapter|CHAPTER)\\s+([0-9IVXLCDM]+)\\s*[^\\n]*\\n/g;
  const parts = cleaned.split(markerRegex);

  // If split produced too small, fallback to 1 chapter.
  if (parts.length < 3) {
    return [{ title: bookTitle ? `Chapter 1: (from title)` : "Chapter 1", text: cleaned.trim() }];
  }

  // `split` with capture groups results in: [before, m1, m2, m3, after...]
  const chapters: Array<{ title: string; text: string }> = [];
  for (let i = 3; i < parts.length; i += 3) {
    const chapterNum = parts[i - 1] ? String(parts[i - 1]).trim() : `${chapters.length + 1}`;
    const chapterText = parts[i + 1] ?? "";
    if (!chapterText.trim()) continue;
    chapters.push({ title: `Chapter ${chapterNum}`, text: chapterText.trim() });
  }

  // Edge: if nothing extracted.
  if (chapters.length === 0) return [{ title: "Chapter 1", text: cleaned.trim() }];
  return chapters;
}

function splitIntoSegments(chapterText: string) {
  const text = chapterText.replace(/\\s+/g, " ").trim();
  if (!text) return [];
  const segments: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(text.length, start + MAX_SEGMENT_CHARS);
    const chunk = text.slice(start, end).trim();
    if (chunk) segments.push(chunk);
    start = Math.max(0, end - OVERLAP_CHARS);
    if (end >= text.length) break;
  }
  return segments;
}

type ParsedSegment = {
  id: string;
  order: number;
  text: string;
  normalizedText: string;
  tokens: string[];
};

type ParsedChapter = {
  chapterId: string;
  title: string;
  segments: ParsedSegment[];
};

function buildSearchIndex(chapters: ParsedChapter[]) {
  const terms: Record<string, Array<[string, string]>> = {};
  const phrases: Record<string, Array<[string, string]>> = {};

  const addPair = (obj: Record<string, Array<[string, string]>>, key: string, pair: [string, string]) => {
    if (!obj[key]) obj[key] = [];
    const arr = obj[key];
    const exists = arr.some((x) => x[0] === pair[0] && x[1] === pair[1]);
    if (!exists) arr.push(pair);
  };

  for (const ch of chapters) {
    for (const seg of ch.segments) {
      const uniqueTokens = Array.from(new Set(seg.tokens));
      for (const t of uniqueTokens) addPair(terms, t, [ch.chapterId, seg.id]);

      const toks = seg.tokens;
      for (let i = 0; i < toks.length - 1; i++) {
        const p2 = toks.slice(i, i + 2).join(" ");
        if (p2) addPair(phrases, p2, [ch.chapterId, seg.id]);
      }
      for (let i = 0; i < toks.length - 2; i++) {
        const p3 = toks.slice(i, i + 3).join(" ");
        if (p3) addPair(phrases, p3, [ch.chapterId, seg.id]);
      }
    }
  }

  return { version: 1, terms, phrases };
}

function writeJsonToStorage(storagePath: string, obj: unknown) {
  return bucket.file(storagePath).save(JSON.stringify(obj), {
    contentType: "application/json",
    metadata: { cacheControl: "no-cache" }
  });
}

async function readStorageFileAsBuffer(storagePath: string) {
  const [buf] = await bucket.file(storagePath).download();
  return buf;
}

async function parsePdf(buffer: Buffer): Promise<string> {
  const parsed = await pdfParse(buffer);
  return parsed.text ?? "";
}

async function parseEpub(buffer: Buffer): Promise<string> {
  // MVP EPUB extraction:
  // - epub is a zip container
  // - concatenate text from all .html/.xhtml files
  // - strip tags/scripts/styles (heuristic)
  const directory = await unzipper.Open.buffer(buffer);
  const chunks: string[] = [];

  for (const file of directory.files) {
    const fileName = file.path.toLowerCase();
    if (!fileName.endsWith(".html") && !fileName.endsWith(".xhtml")) continue;

    const contentBuffer = await file.buffer();
    const html = contentBuffer.toString("utf8");

    const withoutScript = html
      .replace(/<script[^>]*>[\\s\\S]*?<\\/script>/gi, " ")
      .replace(/<style[^>]*>[\\s\\S]*?<\\/style>/gi, " ");

    const text = withoutScript
      .replace(/<[^>]+>/g, " ")
      .replace(/\\s+/g, " ")
      .trim();

    if (text) chunks.push(text);
  }

  return chunks.join("\n\n");
}

async function updateImportStatus({
  importJobId,
  status,
  progress,
  errorMessage
}: {
  importJobId: string;
  status: "queued" | "processing" | "ready" | "failed";
  progress: number;
  errorMessage?: string | null;
}) {
  await db.collection("importJobs").doc(importJobId).set(
    {
      status,
      progress,
      errorMessage: errorMessage ?? null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    },
    { merge: true }
  );
}

export const onImportJobCreated = onDocumentCreated("importJobs/{importJobId}", async (event) => {
  const importJobId = event.params.importJobId;
  const data = event.data.data() as any;
  if (!data) return;

  const ownerUid = String(data.ownerUid);
  const bookId = String(data.bookId);

  await updateImportStatus({ importJobId, status: "processing", progress: 0.05 });

  try {
    const bookSnap = await db.collection("books").doc(bookId).get();
    const book = bookSnap.data() as any | undefined;
    if (!book || String(book.ownerUid) !== ownerUid) throw new Error("Book not found or ownership mismatch");

    const fileType = book.fileType as FileType;
    const storageRoot = String(book.storageRoot);
    const originalPath = `${storageRoot}/original/source.${fileType}`;

    const title = (book.title as string) ?? "Untitled";
    const rawBuffer = await readStorageFileAsBuffer(originalPath);

    let extractedText = "";
    if (fileType === "pdf") extractedText = await parsePdf(rawBuffer);
    else extractedText = await parseEpub(rawBuffer);

    extractedText = extractedText.replace(/\\u0000/g, " ").trim();
    if (extractedText.length < 200) throw new Error("Extracted text too short for MVP parsing");

    // Chapter + segment parse.
    const chapterParts = splitIntoChapters(extractedText, title);
    const parsedChapters: ParsedChapter[] = chapterParts.map((cp, idx) => {
      const chapterId = `${bookId}_ch${idx + 1}`;
      const segTexts = splitIntoSegments(cp.text);
      const segments: ParsedSegment[] = segTexts.map((t, segIdx) => {
        const normalizedText = normalizeEnglish(t);
        return {
          id: `${chapterId}_seg${segIdx + 1}`,
          order: segIdx,
          text: t,
          normalizedText,
          tokens: tokenizeEnglish(t)
        };
      });
      return { chapterId, title: cp.title, segments };
    });

    if (parsedChapters.length === 0) throw new Error("No chapters generated");

    const manifest = {
      bookId,
      title,
      chapterCount: parsedChapters.length,
      chapters: parsedChapters.map((ch) => ({
        id: ch.chapterId,
        title: ch.title,
        segmentCount: ch.segments.length
      }))
    };

    const searchIndex = buildSearchIndex(parsedChapters);

    // Write parsed outputs.
    await writeJsonToStorage(`${storageRoot}/parsed/manifest.json`, manifest);

    for (const ch of parsedChapters) {
      await writeJsonToStorage(`${storageRoot}/parsed/chapters/${ch.chapterId}.json`, ch);

      // MVP context windows file (optional for client; we generate anyway for completeness).
      const ctxEntries = ch.segments.map((seg, i) => {
        const nearby = [
          ...ch.segments.slice(Math.max(0, i - 2), i),
          seg,
          ...ch.segments.slice(i + 1, Math.min(ch.segments.length, i + 3))
        ].map((x) => x.id);
        const contextText = ch.segments
          .slice(Math.max(0, i - 2), Math.min(ch.segments.length, i + 3)))
          .map((x) => x.text)
          .join("\n\n");
        return { segmentId: seg.id, nearbySegmentIds: nearby, contextText };
      });

      await writeJsonToStorage(`${storageRoot}/parsed/context-windows/${ch.chapterId}.json`, {
        version: 1,
        chapterId: ch.chapterId,
        entries: ctxEntries
      });
    }

    await writeJsonToStorage(`${storageRoot}/parsed/search-index.json`, searchIndex);

    // Update Firestore.
    await updateImportStatus({ importJobId, status: "ready", progress: 1 });
    await db.collection("books").doc(bookId).set(
      {
        importStatus: "ready",
        chapterCount: manifest.chapterCount,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    const projectId = String(book.projectId);
    if (projectId) {
      const projectRef = db.collection("projects").doc(projectId);
      const projectSnap = await projectRef.get();
      const project = projectSnap.data() as any | undefined;
      if (project && project.ownerUid === ownerUid && (!project.activeBookId || project.activeBookId === "")) {
        await projectRef.set({ activeBookId: bookId }, { merge: true });
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Import failed";
    await updateImportStatus({ importJobId, status: "failed", progress: 1, errorMessage: msg });
    await db.collection("books").doc(bookId).set(
      { importStatus: "failed", updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );
  }
});

