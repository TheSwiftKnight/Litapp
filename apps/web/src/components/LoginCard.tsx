"use client";

import { useState } from "react";
import { GoogleAuthProvider, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebaseClient";

export function LoginCard() {
  const [loading, setLoading] = useState(false);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <h1 style={{ margin: "40px 0 8px" }}>Novel English Tutor</h1>
      <p style={{ margin: "0 0 24px", opacity: 0.85 }}>
        Import a novel (PDF/EPUB), search with context, and build chapter flashcards
        with spaced repetition review.
      </p>

      <button
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          try {
            await setPersistence(firebaseAuth, browserLocalPersistence);

            const provider = new GoogleAuthProvider();
            const result = await signInWithPopup(firebaseAuth, provider);

            console.log("signInWithPopup success:", result.user);
            console.log("uid:", result.user.uid);
            console.log("email:", result.user.email);
          } catch (error) {
            console.error("Google sign in failed:", error);
          } finally {
            setLoading(false);
          }
        }}
        style={{
          padding: "12px 16px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.06)",
          color: "inherit",
          cursor: loading ? "not-allowed" : "pointer"
        }}
      >
        {loading ? "Signing in..." : "Sign in with Google"}
      </button>

      <div style={{ marginTop: 20, opacity: 0.8, fontSize: 14 }}>
        After auth, you can create projects and import books.
      </div>
    </div>
  );
}

