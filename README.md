# litapp (MVP)

Monorepo with:
- `apps/web`: Next.js + TypeScript + PWA (Firebase Auth, client-side search, flashcards, review UI)
- `apps/api`: Node.js (Cloud Run) (LLM gateway + context lookup + import-job enqueue)
- `apps/functions`: Firebase Functions (Cloud Functions 2nd gen) (book parsing/import processing)

## MVP flow
1. User signs in with Firebase Auth.
2. User creates a `project` document (Firestore).
3. User uploads a PDF/EPUB to Firebase Storage (`users/{uid}/books/{bookId}/original/...`).
4. Web calls `POST /v1/import-book` to enqueue an `importJobs` document.
5. Cloud Function parses the book and writes `parsed/*` back to Storage:
   - `parsed/manifest.json`
   - `parsed/chapters/{chapterId}.json`
   - `parsed/search-index.json`
   - `parsed/context-windows/{chapterId}.json`
6. Web performs client-side search using `parsed/search-index.json` and chapter JSON.
7. Web calls `POST /v1/lookup-context` to get contextual translation/explanation (LLM via backend).
8. Web optionally saves a `flashcards` document and initializes `reviewStates`.
9. Web runs spaced repetition review using `reviewStates` and logs results to `reviewLogs`.

## Firebase / env
Copy `.env.example` files from each app and fill in Firebase + Gemini keys.

