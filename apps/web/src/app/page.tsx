"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { LoginCard } from "@/components/LoginCard";
import { useAuthState } from "@/lib/useAuthState";

const initialHash = "#/projects";

export default function Page() {
  const { user, loading } = useAuthState();
  const signedIn = !!user;

  // Keep a stable initial location.hash for static export.
  useMemo(() => {
    if (typeof window === "undefined") return;
    if (!window.location.hash) window.location.hash = initialHash;
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  if (!signedIn) return <LoginCard />;

  return <AppShell userUid={user.uid} />;
}

