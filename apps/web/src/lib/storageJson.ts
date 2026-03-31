"use client";

import { getDownloadURL, ref } from "firebase/storage";
import { firebaseStorage } from "./firebaseClient";

export async function downloadJsonFromStorage<T = unknown>(path: string): Promise<T> {
  const url = await getDownloadURL(ref(firebaseStorage, path));
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${path}: ${res.status}`);
  return (await res.json()) as T;
}

