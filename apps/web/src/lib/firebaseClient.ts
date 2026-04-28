import { getApps, initializeApp } from "firebase/app";
import { type AppCheck, initializeAppCheck, ReCaptchaEnterpriseProvider, getToken } from "firebase/app-check";
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

let appCheckInstance: AppCheck | null = null;

const appCheckSiteKey = process.env.NEXT_PUBLIC_APP_CHECK_SITE_KEY;
const shouldEnableAppCheck =
  typeof window !== "undefined" && !!appCheckSiteKey;

  if (shouldEnableAppCheck) {
    if (process.env.NODE_ENV === "development") {
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN =
        process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
    }
  
    appCheckInstance = initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
    console.log("Firebase projectId:", firebaseConfig.projectId);
    console.log("Firebase authDomain:", firebaseConfig.authDomain);
    console.log("App Check enabled:", shouldEnableAppCheck);
  }
  
export const firebaseAuth = getAuth(app);
export const firebaseDb = getFirestore(app);
export const firebaseStorage = getStorage(app);



export async function getAppCheckTokenOrNull(): Promise<string | null> {
  if (!appCheckInstance) return null;
  try {
    const result = await getToken(appCheckInstance, true);
    return result.token ?? null;
  } catch {
    return null;
  }
}

