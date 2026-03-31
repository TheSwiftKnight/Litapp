"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  getDocs,
  Timestamp,
  getDoc
} from "firebase/firestore";
import { firebaseDb } from "@/lib/firebaseClient";
import { callApi } from "@/lib/apiClient";

import { uploadBookFileToStorage } from "@/components/storage/uploadBookFileToStorage";

type ProjectDoc = {
  ownerUid: string;
  title: string;
  createdAt: any;
  activeBookId: string | null;
};

type BookDoc = {
  ownerUid: string;
  projectId: string;
  title: string;
  author: string | null;
  fileType: "pdf" | "epub";
  storageRoot: string;
  importStatus: "pending" | "processing" | "ready" | "failed";
  chapterCount: number;
  createdAt: any;
};

function pickFileType(fileName: string): "pdf" | "epub" | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".epub")) return "epub";
  return null;
}

export function ProjectsPanel({ userUid }: { userUid: string }) {
  const [projects, setProjects] = useState<Array<{ projectId: string } & ProjectDoc>>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeBookId, setActiveBookId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(collection(firebaseDb, "projects"), where("ownerUid", "==", userUid));
    const unsub = onSnapshot(q, (snap) => {
      const next = snap.docs.map((d) => ({ projectId: d.id, ...(d.data() as ProjectDoc) }));
      setProjects(next);
      if (!activeProjectId && next[0]?.projectId) {
        setActiveProjectId(next[0].projectId);
        setActiveBookId(next[0].activeBookId ?? null);
      }
    });
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userUid]);

  useEffect(() => {
    const proj = projects.find((p) => p.projectId === activeProjectId);
    setActiveBookId(proj?.activeBookId ?? null);
  }, [activeProjectId, projects]);

  const activeProject = useMemo(
    () => projects.find((p) => p.projectId === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>
      <div>
        <h2 style={{ margin: "0 0 10px" }}>Projects</h2>
        {projects.length === 0 ? (
          <div style={{ opacity: 0.85 }}>
            No projects yet. Create one on the right, then upload a PDF/EPUB.
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {projects.map((p) => (
              <button
                key={p.projectId}
                onClick={() => {
                  setActiveProjectId(p.projectId);
                  setActiveBookId(p.activeBookId ?? null);
                  window.location.hash = `#/reader?projectId=${p.projectId}&bookId=${p.activeBookId ?? ""}`;
                }}
                style={{
                  textAlign: "left",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.14)",
                  background:
                    p.projectId === activeProjectId ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
                  cursor: "pointer",
                  color: "inherit"
                }}
              >
                <div style={{ fontWeight: 750 }}>{p.title}</div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                  Active book: {p.activeBookId ?? "none"}
                </div>
              </button>
            ))}
          </div>
        )}

        <hr style={{ border: "none", borderTop: "1px solid rgba(255,255,255,0.12)", margin: "18px 0" }} />
        <h3 style={{ margin: "0 0 10px" }}>Active book</h3>
        {!activeProject ? (
          <div style={{ opacity: 0.85 }}>Select a project.</div>
        ) : (
          <ActiveBookStatus userUid={userUid} projectId={activeProject.projectId} bookId={activeBookId} />
        )}
      </div>

      <div style={{ position: "sticky", top: 14 }}>
        <CreateProjectCard
          userUid={userUid}
          onCreated={(projectId) => {
            setActiveProjectId(projectId);
            setActiveBookId(null);
          }}
        />

        <div style={{ height: 14 }} />

        <UploadBookCard
          userUid={userUid}
          projectId={activeProjectId}
          onBookImported={(bookId) => {
            setActiveBookId(bookId);
            window.location.hash = `#/reader?projectId=${activeProjectId ?? ""}&bookId=${bookId}`;
          }}
          uploading={uploading}
          setUploading={setUploading}
          error={error}
          setError={setError}
        />
      </div>
    </div>
  );
}

function CreateProjectCard({ userUid, onCreated }: { userUid: string; onCreated: (projectId: string) => void }) {
  const [title, setTitle] = useState("My Novel Study");
  const [creating, setCreating] = useState(false);

  return (
    <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Create project</div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "transparent",
          color: "inherit"
        }}
      />
      <button
        disabled={creating || !title.trim()}
        onClick={async () => {
          setCreating(true);
          try {
            const projectId = crypto.randomUUID();
            await setDoc(doc(firebaseDb, "projects", projectId), {
              ownerUid: userUid,
              title: title.trim(),
              createdAt: serverTimestamp(),
              activeBookId: null
            });
            onCreated(projectId);
          } finally {
            setCreating(false);
          }
        }}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "inherit",
          cursor: "pointer"
        }}
      >
        {creating ? "Creating..." : "Create"}
      </button>
    </div>
  );
}

function UploadBookCard({
  userUid,
  projectId,
  onBookImported,
  uploading,
  setUploading,
  error,
  setError
}: {
  userUid: string;
  projectId: string | null;
  onBookImported: (bookId: string) => void;
  uploading: boolean;
  setUploading: (v: boolean) => void;
  error: string | null;
  setError: (v: string | null) => void;
}) {
  const [title, setTitle] = useState("Sample Book");
  const [author, setAuthor] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const fileType = useMemo(() => (file ? pickFileType(file.name) : null), [file]);

  return (
    <div style={{ padding: 14, borderRadius: 16, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Upload book</div>

      {!projectId ? (
        <div style={{ opacity: 0.85, marginBottom: 10 }}>Create/select a project first.</div>
      ) : null}

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        disabled={!projectId}
        placeholder="Book title"
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "transparent",
          color: "inherit",
          marginBottom: 10,
          opacity: projectId ? 1 : 0.6
        }}
      />

      <input
        type="text"
        value={author ?? ""}
        onChange={(e) => setAuthor(e.target.value ? e.target.value : null)}
        disabled={!projectId}
        placeholder="Author (optional)"
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "transparent",
          color: "inherit",
          marginBottom: 10,
          opacity: projectId ? 1 : 0.6
        }}
      />

      <input
        type="file"
        accept=".pdf,.epub"
        disabled={!projectId || uploading}
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        style={{ width: "100%", opacity: projectId ? 1 : 0.6 }}
      />

      {file ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
          File type: {fileType ?? "unsupported"}
        </div>
      ) : null}

      {error ? (
        <div style={{ marginTop: 10, fontSize: 12, color: "#ffb3b3" }}>{error}</div>
      ) : null}

      <button
        disabled={!projectId || uploading || !file || !fileType}
        onClick={async () => {
          if (!projectId || !file || !fileType) return;
          setError(null);
          setUploading(true);
          try {
            const bookId = crypto.randomUUID();
            const storageRoot = `users/${userUid}/books/${bookId}`;
            const storagePath = `${storageRoot}/original/source.${fileType}`;

            await uploadBookFileToStorage({
              file,
              storagePath
            });

            // Create book doc first so the import worker can read metadata (fileType, storageRoot).
            await setDoc(doc(firebaseDb, "books", bookId), {
              ownerUid: userUid,
              projectId,
              title: title.trim(),
              author: author ? author : null,
              fileType,
              storageRoot,
              importStatus: "processing",
              chapterCount: 0,
              createdAt: serverTimestamp()
            });

            // Enqueue import via API.
            await callApi("/v1/import-book", {
              bookId,
              ownerUid: userUid,
              storagePath
            });

            // Mark as active.
            await updateDoc(doc(firebaseDb, "projects", projectId), {
              activeBookId: bookId
            });

            onBookImported(bookId);
          } catch (e) {
            setError(e instanceof Error ? e.message : "Import failed");
          } finally {
            setUploading(false);
          }
        }}
        style={{
          width: "100%",
          marginTop: 12,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "inherit",
          cursor: "pointer",
          opacity: uploading ? 0.7 : 1
        }}
      >
        {uploading ? "Importing..." : "Upload + Import"}
      </button>
    </div>
  );
}

function ActiveBookStatus({ userUid, projectId, bookId }: { userUid: string; projectId: string; bookId: string | null }) {
  const [status, setStatus] = useState<BookDoc["importStatus"] | null>(null);

  useEffect(() => {
    if (!bookId) {
      setStatus(null);
      return;
    }
    const ref = doc(firebaseDb, "books", bookId);
    const unsub = onSnapshot(ref, (snap) => {
      const data = snap.data() as BookDoc | undefined;
      if (data?.ownerUid !== userUid) return;
      setStatus(data?.importStatus ?? null);
    });
    return () => unsub();
  }, [bookId, projectId, userUid]);

  return (
    <div style={{ padding: 12, borderRadius: 12, border: "1px solid rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.04)" }}>
      {bookId ? (
        <>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Book: {bookId}</div>
          <div style={{ opacity: 0.85 }}>Import status: {status ?? "loading..."}</div>
          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
            When status becomes `ready`, the Reader tab can load `parsed/search-index.json`.
          </div>
        </>
      ) : (
        <div style={{ opacity: 0.85 }}>No active book yet.</div>
      )}
    </div>
  );
}

