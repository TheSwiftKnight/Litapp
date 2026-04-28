"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { firebaseAuth } from "./firebaseClient";

export function useAuthState() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log("useAuthState mounted");
    console.log("initial currentUser:", firebaseAuth.currentUser);

    const unsub = onAuthStateChanged(firebaseAuth, (u) => {
      console.log("onAuthStateChanged fired:", u);
      console.log("uid:", u?.uid);
      console.log("email:", u?.email);

      setUser(u);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  return { user, loading };
}