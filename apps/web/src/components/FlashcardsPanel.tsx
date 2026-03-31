"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, serverTimestamp, setDoc, where, Timestamp, doc, onSnapshot } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";

type FlashcardDoc = {
  ownerUid: string;
  projectId: string;
  bookId: string;
  chapterId: string;
  sourceQuery: string;
  sourceContext: string;
  meaningInContext: string;
  commonMeaning: string;
  differences: string;
  notes: string;
  createdAt: any;
};

export function FlashcardsPanel({
  userUid,
  projectId,
  bookId
}: {
  userUid: string;
  projectId: string | null;
  bookId: string | null;
}) {
  const [cards, setCards] = useState<Array<{ cardId: string } & FlashcardDoc>>([]);
  const [loading, setLoading] = useState(false);
  const [chapterFilter, setChapterFilter] = useState<string>("all");

  const availableChapters = useMemo(() => {
    const set = new Set(cards.map((c) => c.chapterId));
    return ["all", ...Array.from(set)];
  }, [cards]);

  useEffect(() => {
    if (!projectId || !bookId) {
      setCards([]);
      return;
    }
    setLoading(true);
    const q = query(
      collection(firebaseDb, "flashcards"),
      where("ownerUid", "==", userUid),
      where("projectId", "==", projectId),
      where("bookId", "==", bookId)
    );

    getDocs(q)
      .then((snap) => {
        const next = snap.docs.map((d) => ({ cardId: d.id, ...(d.data() as FlashcardDoc) }));
        setCards(next);
      })
      .finally(() => setLoading(false));
  }, [userUid, projectId, bookId]);

  const shown = useMemo(() => {
    if (chapterFilter === "all") return cards;
    return cards.filter((c) => c.chapterId === chapterFilter);
  }, [cards, chapterFilter]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
      <div>
        <h2 style={{ margin: "0 0 10px" }}>Flashcards</h2>
        {!projectId || !bookId ? (
          <div style={{ opacity: 0.85 }}>Open a book in the Reader first.</div>
        ) : loading ? (
          <div style={{ opacity: 0.85 }}>Loading...</div>
        ) : shown.length === 0 ? (
          <div style={{ opacity: 0.85 }}>No flashcards yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {shown.map((c) => (
              <div
                key={c.cardId}
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background: "rgba(255,255,255,0.04)"
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.85 }}>
                  Chapter: <b>{c.chapterId}</b>
                </div>
                <div style={{ marginTop: 8, fontWeight: 850 }}>{c.sourceQuery}</div>
                <details style={{ marginTop: 8, opacity: 0.95 }}>
                  <summary style={{ cursor: "pointer" }}>Show meaning</summary>
                  <div style={{ marginTop: 8, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                    <div style={{ opacity: 0.9 }}>
                      <b>In context:</b> {c.meaningInContext}
                    </div>
                    <div style={{ opacity: 0.9, marginTop: 6 }}>
                      <b>Common meaning:</b> {c.commonMeaning}
                    </div>
                    <div style={{ opacity: 0.9, marginTop: 6 }}>
                      <b>Differences:</b> {c.differences}
                    </div>
                    <div style={{ opacity: 0.9, marginTop: 6 }}>
                      <b>Notes:</b> {c.notes}
                    </div>
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: "sticky", top: 14 }}>
        <div
          style={{
            padding: 14,
            borderRadius: 16,
            border: "1px solid rgba(255,255,255,0.14)",
            background: "rgba(255,255,255,0.04)"
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 10 }}>Filter</div>
          <select
            value={chapterFilter}
            onChange={(e) => setChapterFilter(e.target.value)}
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 12,
              border: "1px solid rgba(255,255,255,0.18)",
              background: "transparent",
              color: "inherit"
            }}
          >
            {availableChapters.map((c) => (
              <option key={c} value={c}>
                {c === "all" ? "All chapters" : c}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

