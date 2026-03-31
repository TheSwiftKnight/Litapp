import { getApps, initializeApp } from "firebase/app";
import { getAppCheck, initializeAppCheck, ReCaptchaV3Provider, getToken } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);
export const firebaseStorage = getStorage(app);

let appCheckInstance: ReturnType<typeof getAppCheck> | null = null;
const appCheckSiteKey = process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY;

if (appCheckSiteKey && typeof window !== "undefined") {
  // Initialize only when configured.
  appCheckInstance = initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(appCheckSiteKey),
    isTokenAutoRefreshEnabled: true
  });
}

export async function getAppCheckTokenOrNull(): Promise<string | null> {
  if (!appCheckInstance) return null;
  try {
    const token = await getToken(appCheckInstance, true);
    return token ?? null;
  } catch {
    return null;
  }
}

