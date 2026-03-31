export type ImportJobStatus = "queued" | "processing" | "ready" | "failed";

export type FileType = "pdf" | "epub";

export type ParsedSegment = {
  id: string;
  order: number;
  text: string;
  normalizedText: string;
  tokens: string[];
};

export type ParsedChapter = {
  chapterId: string;
  title: string;
  segments: ParsedSegment[];
};

export type ParsedManifest = {
  bookId: string;
  title: string;
  chapterCount: number;
  chapters: Array<{
    id: string;
    title: string;
    segmentCount: number;
  }>;
};

