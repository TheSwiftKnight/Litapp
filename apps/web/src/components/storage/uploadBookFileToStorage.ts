"use client";

import { ref, uploadBytesResumable } from "firebase/storage";
import { firebaseStorage } from "@/lib/firebaseClient";

export async function uploadBookFileToStorage({
  file,
  storagePath
}: {
  file: File;
  storagePath: string;
}) {
  const storageRef = ref(firebaseStorage, storagePath);

  // Clear any previous partials is handled by overwriting (same object path).
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type || undefined
  });

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      () => {
        // noop (MVP doesn't show progress)
      },
      (err) => reject(err),
      () => resolve()
    );
  });
}

