"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  where,
  Timestamp,
  serverTimestamp,
  addDoc
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { callApi } from "@/lib/apiClient";
import { applySimpleReviewUpdate, type ReviewGrade, type ReviewStateNumbers } from "@/lib/reviewAlgo";

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

export function ReviewPanel({
  userUid,
  projectId,
  bookId
}: {
  userUid: string;
  projectId: string | null;
  bookId: string | null;
}) {
  const [dueCardIds, setDueCardIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionCard, setSessionCard] = useState<
    | null
    | (FlashcardDoc & {
        cardId: string;
        reviewState: ReviewStateNumbers & { nextReviewAt: Timestamp; reps: number; lapses: number };
      })
  >(null);

  const [prompt, setPrompt] = useState<string>("");
  const [answer, setAnswer] = useState<string>("");
  const [quizLoading, setQuizLoading] = useState(false);
  const [revealAnswer, setRevealAnswer] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const now = useMemo(() => Date.now(), []);

  useEffect(() => {
    if (!projectId || !bookId) {
      setDueCardIds([]);
      setSessionCard(null);
      setRevealAnswer(false);
      return;
    }

    setLoading(true);
    const dueQ = query(
      collection(firebaseDb, "reviewStates"),
      where("ownerUid", "==", userUid),
      where("nextReviewAt", "<=", Timestamp.now()),
      orderBy("nextReviewAt")
    );

    // MVP workaround: fetch first 10 via client-side slice.
    getDocs(dueQ)
      .then((snap) => {
        const ids = snap.docs.map((d) => d.id);
        setDueCardIds(ids);
      })
      .catch(() => {
        setDueCardIds([]);
      })
      .finally(() => setLoading(false));
  }, [userUid, projectId, bookId]);

  async function loadNextDueCard() {
    setError(null);
    setRevealAnswer(false);
    const cardId = dueCardIds[sessionIndex];
    if (!cardId) {
      setSessionCard(null);
      return;
    }

    const [cardSnap, stateSnap] = await Promise.all([getDoc(doc(firebaseDb, "flashcards", cardId)), getDoc(doc(firebaseDb, "reviewStates", cardId))]);
    if (!cardSnap.exists() || !stateSnap.exists()) {
      setError("Missing card or review state.");
      return;
    }

    const card = cardSnap.data() as FlashcardDoc;
    const state = stateSnap.data() as any;
    const reviewStateNumbers: ReviewStateNumbers = {
      stability: state.stability,
      difficulty: state.difficulty,
      reps: state.reps,
      lapses: state.lapses
    };

    setSessionCard({
      ...card,
      cardId,
      reviewState: { ...reviewStateNumbers, nextReviewAt: state.nextReviewAt }
    });

    setQuizLoading(true);
    try {
      const resp = await callApi<{ prompt: string; answer: string }>("/v1/review/generate", { cardId });
      setPrompt(resp.prompt);
      setAnswer(resp.answer);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate review");
    } finally {
      setQuizLoading(false);
    }
  }

  useEffect(() => {
    // Start a session automatically when due cards appear.
    if (dueCardIds.length > 0 && !sessionCard) {
      loadNextDueCard().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueCardIds]);

  async function gradeAndContinue(grade: ReviewGrade) {
    if (!sessionCard) return;
    setError(null);
    setRevealAnswer(false);

    const cardId = sessionCard.cardId;
    const nowMs = Date.now();

    const { next, nextReviewAtMs } = applySimpleReviewUpdate(
      {
        stability: sessionCard.reviewState.stability,
        difficulty: sessionCard.reviewState.difficulty,
        reps: sessionCard.reviewState.reps,
        lapses: sessionCard.reviewState.lapses
      },
      grade,
      nowMs
    );

    await updateDoc(doc(firebaseDb, "reviewStates", cardId), {
      stability: next.stability,
      difficulty: next.difficulty,
      reps: next.reps,
      lapses: next.lapses,
      nextReviewAt: Timestamp.fromMillis(nextReviewAtMs),
      lastReviewedAt: Timestamp.now()
    });

    await addDoc(collection(firebaseDb, "reviewLogs"), {
      ownerUid: userUid,
      cardId,
      grade,
      reviewedAt: serverTimestamp()
    });

    const nextIndex = sessionIndex + 1;
    setSessionIndex(nextIndex);
    if (nextIndex < dueCardIds.length) {
      await loadNextDueCard();
    } else {
      setSessionCard(null);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
      <div>
        <h2 style={{ margin: "0 0 10px" }}>Review</h2>
        {!projectId || !bookId ? (
          <div style={{ opacity: 0.85 }}>Open Reader/Flashcards first.</div>
        ) : loading ? (
          <div style={{ opacity: 0.85 }}>Loading due cards...</div>
        ) : dueCardIds.length === 0 ? (
          <div style={{ opacity: 0.85 }}>No due cards right now.</div>
        ) : !sessionCard ? (
          <div style={{ opacity: 0.85 }}>Session finished.</div>
        ) : (
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.04)"
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.85 }}>
              Card {sessionIndex + 1} of {dueCardIds.length} · Chapter {sessionCard.chapterId}
            </div>

            <div style={{ marginTop: 12, fontWeight: 900 }}>{prompt || "Loading prompt..."}</div>

            <div style={{ marginTop: 10, whiteSpace: "pre-wrap", opacity: 0.9 }}>
              <div style={{ fontSize: 12, opacity: 0.75 }}>Context</div>
              {sessionCard.sourceContext}
            </div>

            <div style={{ marginTop: 14, borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 14 }}>
              {revealAnswer ? (
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{answer}</div>
              ) : (
                <div style={{ opacity: 0.85 }}>Reveal to grade</div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                {!revealAnswer ? (
                  <button
                    onClick={() => setRevealAnswer(true)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: 12,
                      border: "1px solid rgba(255,255,255,0.18)",
                      background: "rgba(255,255,255,0.06)",
                      color: "inherit",
                      cursor: "pointer"
                    }}
                    disabled={quizLoading}
                  >
                    {quizLoading ? "Generating..." : "Reveal answer"}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => gradeAndContinue(0)}
                      style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,110,110,0.16)", color: "inherit", cursor: "pointer" }}
                    >
                      Again
                    </button>
                    <button
                      onClick={() => gradeAndContinue(1)}
                      style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(255,190,80,0.14)", color: "inherit", cursor: "pointer" }}
                    >
                      Hard
                    </button>
                    <button
                      onClick={() => gradeAndContinue(2)}
                      style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(80,200,255,0.14)", color: "inherit", cursor: "pointer" }}
                    >
                      Good
                    </button>
                    <button
                      onClick={() => gradeAndContinue(3)}
                      style={{ padding: "10px 14px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.18)", background: "rgba(120,255,170,0.14)", color: "inherit", cursor: "pointer" }}
                    >
                      Easy
                    </button>
                  </>
                )}
              </div>

              {error ? <div style={{ marginTop: 12, color: "#ffb3b3" }}>{error}</div> : null}
            </div>
          </div>
        )}
      </div>

      <div style={{ position: "sticky", top: 14 }}>
        <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>How grading works (MVP)</div>
          <div style={{ fontSize: 13, opacity: 0.85, lineHeight: 1.5 }}>
            This MVP uses a simplified spaced-repetition update:
            <div style={{ marginTop: 6 }}>
              Again resets reps and schedules sooner.
            </div>
            <div style={{ marginTop: 6 }}>
              Hard/Good/Easy increase the interval based on your stability.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

