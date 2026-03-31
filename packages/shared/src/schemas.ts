import { z } from "zod";

export const ImportBookRequestSchema = z.object({
  bookId: z.string().min(1),
  ownerUid: z.string().min(1),
  storagePath: z.string().min(1) // e.g. users/{uid}/books/{bookId}/original/source.pdf
});

export const ImportBookResponseSchema = z.object({
  status: z.enum(["queued", "processing", "ready", "failed"])
});

export const LookupContextRequestSchema = z.object({
  bookId: z.string().min(1),
  chapterId: z.string().nullable(),
  query: z.string().min(1).max(4000),
  nearbySegmentIds: z.array(z.string().min(1)).max(50)
});

export const LookupContextResponseSchema = z.object({
  query: z.string(),
  meaningInContext: z.string(),
  commonMeaning: z.string(),
  differences: z.string(),
  grammarNotes: z.string(),
  collocations: z.array(z.string()),
  shouldCreateFlashcard: z.boolean(),
  flashcardFront: z.string(),
  flashcardBack: z.string()
});

export const ReviewGenerateRequestSchema = z.object({
  cardId: z.string().min(1)
});

export const ReviewGenerateResponseSchema = z.object({
  prompt: z.string(),
  answer: z.string()
});

