import * as admin from "firebase-admin";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";

const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

export const auth = app.auth();
export const db = app.firestore();
export const storage = app.storage();

export { admin };

export function ensureAdminApp() {
    if (!getApps().length) {
        initializeApp({
        credential: applicationDefault(),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
        });
    }
}