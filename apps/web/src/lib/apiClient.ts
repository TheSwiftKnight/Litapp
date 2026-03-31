"use client";

export async function callApi<T>(path: string, body: unknown, opts?: { signal?: AbortSignal }) {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!baseUrl) throw new Error("Missing NEXT_PUBLIC_API_BASE_URL");

  const { firebaseAuth, getAppCheckTokenOrNull } = await import("./firebaseClient");
  const user = firebaseAuth.currentUser;
  if (!user) throw new Error("Not signed in");

  const token = await user.getIdToken();
  const appCheckToken = await getAppCheckTokenOrNull();

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(appCheckToken ? { "X-Firebase-AppCheck": appCheckToken } : {})
    },
    body: JSON.stringify(body),
    signal: opts?.signal
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API ${path} failed: ${res.status} ${text}`);
  }

  return (await res.json()) as T;
}

