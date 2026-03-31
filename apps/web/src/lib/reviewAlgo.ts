export type ReviewGrade = 0 | 1 | 2 | 3;

export type ReviewStateNumbers = {
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
};

export function applySimpleReviewUpdate(
  current: ReviewStateNumbers,
  grade: ReviewGrade,
  nowMs: number
): { next: ReviewStateNumbers; nextReviewAtMs: number } {
  // MVP: simple interval scaling; tuned for spaced repetition feel rather than strict FSRS.
  const { stability, difficulty, reps, lapses } = current;

  let nextStability = stability;
  let nextDifficulty = difficulty;
  let nextReps = reps;
  let nextLapses = lapses;

  // Grade meaning:
  // 0 Again, 1 Hard, 2 Good, 3 Easy
  if (grade <= 0) {
    nextLapses = lapses + 1;
    nextReps = 0;
    nextStability = Math.max(0.2, stability * 0.75);
    nextDifficulty = Math.min(1.0, difficulty + 0.08);
  } else {
    nextReps = reps + 1;
    const strength = grade === 1 ? 1.0 : grade === 2 ? 1.4 : 1.8;
    nextStability = Math.max(0.2, stability + 0.35 * strength);
    nextDifficulty = Math.max(0.0, difficulty - 0.06 * strength);
  }

  const baseDays = grade === 0 ? 1 : grade === 1 ? 2 : grade === 2 ? 4 : 7;
  const intervalDays = baseDays * Math.pow(1.25 + nextStability * 0.15, Math.max(0, nextReps));
  const nextReviewAtMs = nowMs + Math.round(intervalDays * 24 * 60 * 60 * 1000);

  return {
    next: {
      stability: nextStability,
      difficulty: nextDifficulty,
      reps: nextReps,
      lapses: nextLapses
    },
    nextReviewAtMs
  };
}

