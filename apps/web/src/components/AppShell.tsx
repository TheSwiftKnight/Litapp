"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { signOut } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebaseClient";
import { ProjectsPanel } from "./ProjectsPanel";
import { ReaderPanel } from "./ReaderPanel";
import { FlashcardsPanel } from "./FlashcardsPanel";
import { ReviewPanel } from "./ReviewPanel";

type View = "projects" | "reader" | "flashcards" | "review";

function parseHashRoute(hash: string): { view: View; params: Record<string, string> } {
  // Expected: "#/reader?bookId=...&projectId=..."
  const cleaned = hash.startsWith("#") ? hash.slice(1) : hash;
  const [pathPart, queryPart] = cleaned.split("?");
  const path = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;

  const view = (path || "projects") as View;
  const params: Record<string, string> = {};
  if (queryPart) {
    const sp = new URLSearchParams(queryPart);
    for (const [k, v] of sp.entries()) params[k] = v;
  }
  return { view, params };
}

export function AppShell({ userUid }: { userUid: string }) {
  const [view, setView] = useState<View>("projects");
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    const handle = () => {
      const { view: v, params: p } = parseHashRoute(window.location.hash || "#/projects");
      setView(v);
      setParams(p);
    };
    handle();
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);

  const selectedProjectId = params.projectId ?? null;
  const selectedBookId = params.bookId ?? null;

  const selectedProjectIdClean = selectedProjectId && selectedProjectId.trim() ? selectedProjectId : null;
  const selectedBookIdClean = selectedBookId && selectedBookId.trim() ? selectedBookId : null;

  const header = useMemo(() => {
    const tabStyle: CSSProperties = {
      padding: "10px 12px",
      borderRadius: 10,
      border: "1px solid rgba(255,255,255,0.14)",
      background: "rgba(255,255,255,0.05)",
      cursor: "pointer"
    };
    const activeStyle: CSSProperties = {
      background: "rgba(255,255,255,0.12)",
      borderColor: "rgba(255,255,255,0.26)"
    };

    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "16px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.12)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 800, letterSpacing: 0.2 }}>Tutor</div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <button
            style={{ ...tabStyle, ...(view === "projects" ? activeStyle : null) }}
            onClick={() => (window.location.hash = "#/projects")}
          >
            Projects
          </button>
          <button
            style={{ ...tabStyle, ...(view === "reader" ? activeStyle : null) }}
            onClick={() => (window.location.hash = `#/reader?projectId=${selectedProjectIdClean ?? ""}&bookId=${selectedBookIdClean ?? ""}`)}
          >
            Reader
          </button>
          <button
            style={{ ...tabStyle, ...(view === "flashcards" ? activeStyle : null) }}
            onClick={() => (window.location.hash = `#/flashcards?projectId=${selectedProjectIdClean ?? ""}&bookId=${selectedBookIdClean ?? ""}`)}
          >
            Flashcards
          </button>
          <button
            style={{ ...tabStyle, ...(view === "review" ? activeStyle : null) }}
            onClick={() => (window.location.hash = `#/review?projectId=${selectedProjectIdClean ?? ""}&bookId=${selectedBookIdClean ?? ""}`)}
          >
            Review
          </button>
        </div>

        <button
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "transparent",
            color: "inherit",
            cursor: "pointer"
          }}
          onClick={() => signOut(firebaseAuth)}
        >
          Sign out
        </button>
      </div>
    );
  }, [selectedBookId, selectedProjectId, view]);

  return (
    <div>
      {header}
      <div style={{ padding: 18 }}>
        {view === "projects" ? (
          <ProjectsPanel userUid={userUid} />
        ) : view === "reader" ? (
          <ReaderPanel userUid={userUid} projectId={selectedProjectIdClean} bookId={selectedBookIdClean} />
        ) : view === "flashcards" ? (
          <FlashcardsPanel userUid={userUid} projectId={selectedProjectIdClean} bookId={selectedBookIdClean} />
        ) : (
          <ReviewPanel userUid={userUid} projectId={selectedProjectIdClean} bookId={selectedBookIdClean} />
        )}
      </div>
    </div>
  );
}

