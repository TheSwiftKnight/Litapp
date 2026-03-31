"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp
} from "firebase/firestore";
import { callApi } from "@/lib/apiClient";
import { firebaseDb } from "@/lib/firebaseClient";
import { downloadJsonFromStorage } from "@/lib/storageJson";
import { ngrams, tokenizeEnglish } from "@/lib/search";

import type { ParsedChapter, ParsedManifest, ParsedSegment } from "novel-english-tutor-shared";

type SearchIndexJson = {
  version: number;
  terms: Record<string, Array<[string, string]>>;
  phrases: Record<string, Array<[string, string]>>;
};

function segmentIdToKey(chapterId: string, segmentId: string) {
  return `${chapterId}::${segmentId}`;
}

function pickNearbySegmentIds(segments: ParsedSegment[], segmentId: string, windowSize = 2) {
  const idx = segments.findIndex((s) => s.id === segmentId);
  if (idx < 0) return [segmentId];
  const start = Math.max(0, idx - windowSize);
  const end = Math.min(segments.length, idx + windowSize + 1);
  return segments.slice(start, end).map((s) => s.id);
}

function buildContextFromSegments(segments: ParsedSegment[]) {
  // Simple context concatenation for the MVP.
  return segments.map((s) => s.text).join("\n\n");
}

export function ReaderPanel({
  userUid,
  projectId,
  bookId
}: {
  userUid: string;
  projectId: string | null;
  bookId: string | null;
}) {
  const [manifest, setManifest] = useState<ParsedManifest | null>(null);
  const [searchIndex, setSearchIndex] = useState<SearchIndexJson | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<Array<{ chapterId: string; segmentId: string; score: number }>>([]);
  const [resultSnippets, setResultSnippets] = useState<Record<string, string>>({});
  const [lookupOpen, setLookupOpen] = useState(false);

  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupResp, setLookupResp] = useState<any>(null);
  const [sourceContext, setSourceContext] = useState<string>("");
  const [lookupChapterId, setLookupChapterId] = useState<string | null>(null);

  const [bookStatus, setBookStatus] = useState<string | null>(null);

  const chapterCache = useRef<Record<string, ParsedChapter>>({});
  const ongoingChapterLoads = useRef<Record<string, Promise<ParsedChapter>>>({});

  const storageRoot = useMemo(() => (bookId ? `users/${userUid}/books/${bookId}` : null), [userUid, bookId]);

  useEffect(() => {
    if (!storageRoot) return;
    const bookDoc = doc(firebaseDb, "books", bookId!);
    const unsub = onSnapshot(bookDoc, (snap) => {
      const data = snap.data() as any;
      if (!data) return;
      if (data.ownerUid !== userUid) return;
      setBookStatus(data.importStatus ?? null);
    });
    return () => unsub();
  }, [bookId, storageRoot, userUid]);

  useEffect(() => {
    if (bookStatus !== "ready") {
      setResults([]);
      setResultSnippets({});
      setSearchQuery("");
    }
  }, [bookStatus]);

  useEffect(() => {
    if (!storageRoot) return;
    if (bookStatus !== "ready") {
      setManifest(null);
      setSearchIndex(null);
      return;
    }
    let cancelled = false;

    async function load() {
      try {
        const [m, idx] = await Promise.all([
          downloadJsonFromStorage<ParsedManifest>(`${storageRoot}/parsed/manifest.json`),
          downloadJsonFromStorage<SearchIndexJson>(`${storageRoot}/parsed/search-index.json`)
        ]);
        if (cancelled) return;
        setManifest(m);
        setSearchIndex(idx);
      } catch (e) {
        if (cancelled) return;
        setManifest(null);
        setSearchIndex(null);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [storageRoot, bookStatus]);

  async function loadChapter(chapterId: string): Promise<ParsedChapter> {
    if (chapterCache.current[chapterId]) return chapterCache.current[chapterId];
    if (ongoingChapterLoads.current[chapterId]) return ongoingChapterLoads.current[chapterId];
    const p = downloadJsonFromStorage<ParsedChapter>(`${storageRoot}/parsed/chapters/${chapterId}.json`).then((ch) => {
      chapterCache.current[chapterId] = ch;
      return ch;
    });
    ongoingChapterLoads.current[chapterId] = p;
    return p;
  }

  const canSearch = !!searchIndex && !!storageRoot && bookStatus === "ready";

  function localSearch() {
    if (!searchIndex) return;
    const tokens = tokenizeEnglish(searchQuery);
    if (tokens.length === 0) {
      setResults([]);
      return;
    }

    const scores = new Map<string, { chapterId: string; segmentId: string; score: number }>();

    for (const t of tokens) {
      const pairs = searchIndex.terms[t];
      if (!pairs) continue;
      for (const [chapterId, segmentId] of pairs) {
        const key = segmentIdToKey(chapterId, segmentId);
        const cur = scores.get(key) ?? { chapterId, segmentId, score: 0 };
        cur.score += 1;
        scores.set(key, cur);
      }
    }

    // Phrase matching (MVP): 2-grams and 3-grams only.
    if (tokens.length >= 2) {
      for (const phrase of [...ngrams(tokens, 2), ...(tokens.length >= 3 ? ngrams(tokens, 3) : [])]) {
        const pairs = searchIndex.phrases[phrase];
        if (!pairs) continue;
        for (const [chapterId, segmentId] of pairs) {
          const key = segmentIdToKey(chapterId, segmentId);
          const cur = scores.get(key) ?? { chapterId, segmentId, score: 0 };
          cur.score += 3;
          scores.set(key, cur);
        }
      }
    }

    const sorted = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, 25);
    setResults(sorted);

    // Load snippets for top results (so UI stays responsive).
    (async () => {
      const nextSnips: Record<string, string> = {};
      const top = sorted.slice(0, 8);
      for (const r of top) {
        const ch = await loadChapter(r.chapterId);
        const seg = ch.segments.find((s) => s.id === r.segmentId);
        nextSnips[segmentIdToKey(r.chapterId, r.segmentId)] = seg?.text?.slice(0, 220) ?? "";
      }
      setResultSnippets((prev) => ({ ...prev, ...nextSnips }));
    })().catch(() => {
      // Non-fatal for MVP.
    });
  }

  async function onLookup(chapterId: string, segmentId: string, computedNearbySegmentIds: string[]) {
    if (!storageRoot || !projectId) return;
    setLookupOpen(true);
    setLookupChapterId(chapterId);
    setLookupLoading(true);
    setLookupError(null);
    setLookupResp(null);
    try {
      const data = await callApi<any>("/v1/lookup-context", {
        bookId,
        chapterId,
        query: searchQuery,
        nearbySegmentIds: computedNearbySegmentIds
      });
      setLookupResp(data);
    } catch (e) {
      setLookupError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLookupLoading(false);
    }
  }

  async function onSaveFlashcard() {
    if (!lookupResp || !storageRoot || !projectId || !bookId) return;
    const cardId = crypto.randomUUID();
    const shouldSave = !!lookupResp.shouldCreateFlashcard;
    if (!shouldSave) return;

    const nextFlashcard = {
      ownerUid: userUid,
      projectId,
      bookId,
      chapterId: lookupChapterId ?? undefined,
      sourceQuery: lookupResp.query,
      sourceContext,
      meaningInContext: lookupResp.meaningInContext,
      commonMeaning: lookupResp.commonMeaning,
      differences: lookupResp.differences,
      notes: [
        lookupResp.grammarNotes ? `Grammar: ${lookupResp.grammarNotes}` : null,
        lookupResp.collocations?.length ? `Collocations: ${lookupResp.collocations.slice(0, 8).join(", ")}` : null
      ]
        .filter(Boolean)
        .join("\n"),
      createdAt: serverTimestamp()
    };

    await setDoc(doc(firebaseDb, "flashcards", cardId), nextFlashcard as any);
    const now = Date.now();
    await setDoc(doc(firebaseDb, "reviewStates", cardId), {
      ownerUid: userUid,
      nextReviewAt: Timestamp.fromMillis(now),
      stability: 1.0,
      difficulty: 0.5,
      reps: 0,
      lapses: 0,
      lastReviewedAt: null
    });
    alert("Flashcard saved.");
    setLookupOpen(false);
  }

  const activeChapterOptions = manifest?.chapters ?? [];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 420px", gap: 16, alignItems: "start" }}>
      <div>
        <h2 style={{ margin: "0 0 10px" }}>Reader</h2>
        <div style={{ opacity: 0.85, marginBottom: 14 }}>
          Book status: <b style={{ color: "#cfe3ff" }}>{bookStatus ?? "loading..."}</b>
          {bookStatus !== "ready" ? (
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Import must be `ready` before search works.
            </div>
          ) : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            localSearch();
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={canSearch ? "Search a word/sentence (local)" : "Import must be ready first"}
              disabled={!canSearch}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "transparent",
                color: "inherit"
              }}
            />
            <button
              type="submit"
              disabled={!canSearch || !searchQuery.trim()}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.18)",
                background: "rgba(255,255,255,0.06)",
                color: "inherit",
                cursor: "pointer",
                whiteSpace: "nowrap"
              }}
            >
              Search
            </button>
          </div>
        </form>

        <div style={{ marginTop: 16 }}>
          {results.length === 0 ? (
            <div style={{ opacity: 0.85 }}>No results yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {results.map((r) => {
                const key = segmentIdToKey(r.chapterId, r.segmentId);
                const snippet = resultSnippets[key] ?? "Loading snippet...";
                return (
                  <div
                    key={key}
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "rgba(255,255,255,0.04)"
                    }}
                  >
                    <div style={{ fontSize: 12, opacity: 0.85 }}>
                      Chapter: <b>{r.chapterId}</b> · Score: {r.score}
                    </div>
                    <div style={{ marginTop: 6, whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{snippet}</div>
                    <button
                      style={{
                        marginTop: 10,
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(255,255,255,0.06)",
                        color: "inherit",
                        cursor: "pointer"
                      }}
                      onClick={async () => {
                        const ch = await loadChapter(r.chapterId);
                        const nearbySegmentIds = pickNearbySegmentIds(ch.segments, r.segmentId, 2);
                        const contextSegs = ch.segments.filter((s) => nearbySegmentIds.includes(s.id));
                        setSourceContext(buildContextFromSegments(contextSegs));
                        await onLookup(r.chapterId, r.segmentId, nearbySegmentIds);
                      }}
                    >
                      Explain in context
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div>
        <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Context Lookup</div>
          <div style={{ opacity: 0.85, fontSize: 13 }}>
            Select a result, then ask for contextual translation/explanation. You can save it as a flashcard.
          </div>
        </div>
      </div>

      {lookupOpen ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18
          }}
          onClick={() => setLookupOpen(false)}
        >
          <div
            style={{
              width: "min(860px, 100%)",
              borderRadius: 18,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "#0b0f19",
              padding: 16
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>LLM explanation</div>
              <button
                onClick={() => setLookupOpen(false)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "transparent",
                  color: "inherit",
                  cursor: "pointer"
                }}
              >
                Close
              </button>
            </div>

            {lookupLoading ? (
              <div style={{ marginTop: 18 }}>Thinking...</div>
            ) : lookupError ? (
              <div style={{ marginTop: 18, color: "#ffb3b3" }}>{lookupError}</div>
            ) : lookupResp ? (
              <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
                <div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>Meaning in context</div>
                  <div style={{ fontWeight: 700, marginTop: 4 }}>{lookupResp.meaningInContext}</div>
                </div>

                <div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>Common meaning</div>
                  <div style={{ marginTop: 4 }}>{lookupResp.commonMeaning}</div>
                </div>

                <div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>Differences</div>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{lookupResp.differences}</div>
                </div>

                <div>
                  <div style={{ opacity: 0.8, fontSize: 12 }}>Grammar notes</div>
                  <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{lookupResp.grammarNotes}</div>
                </div>

                {lookupResp.collocations?.length ? (
                  <div>
                    <div style={{ opacity: 0.8, fontSize: 12 }}>Collocations</div>
                    <div style={{ marginTop: 4 }}>{lookupResp.collocations.slice(0, 12).join(", ")}</div>
                  </div>
                ) : null}

                <div style={{ opacity: 0.85 }}>
                  <div style={{ fontSize: 12, marginBottom: 6 }}>Flashcard preview</div>
                  <div style={{ borderRadius: 14, border: "1px solid rgba(255,255,255,0.14)", padding: 12, background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ fontSize: 12, opacity: 0.85 }}>Front</div>
                    <div style={{ marginTop: 4, fontWeight: 800 }}>{lookupResp.flashcardFront}</div>
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 10 }}>Back</div>
                    <div style={{ marginTop: 4, whiteSpace: "pre-wrap" }}>{lookupResp.flashcardBack}</div>
                  </div>
                </div>

                {lookupResp.shouldCreateFlashcard ? (
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
                    <button
                      onClick={onSaveFlashcard}
                      style={{
                        padding: "10px 14px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(60,170,255,0.18)",
                        color: "inherit",
                        cursor: "pointer"
                      }}
                    >
                      Save flashcard
                    </button>
                  </div>
                ) : (
                  <div style={{ opacity: 0.85 }}>This result doesn’t look like a good flashcard candidate.</div>
                )}
              </div>
            ) : (
              <div style={{ marginTop: 18, opacity: 0.85 }}>No response yet.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

