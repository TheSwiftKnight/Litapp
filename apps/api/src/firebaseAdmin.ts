import * as admin from "firebase-admin";

const app = admin.apps.length ? admin.app() : admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });

export const auth = app.auth();
export const db = app.firestore();
export const storage = app.storage();

export { admin };

