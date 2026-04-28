import type { Request, Response, NextFunction } from "express";
import { getAuth } from "firebase-admin/auth";
import { getAppCheck } from "firebase-admin/app-check";
import { ensureAdminApp } from "../firebaseAdmin";

export interface AuthedRequest extends Request {
  user?: {
    uid: string;
  };
  appCheckData?: unknown;
}

export async function verifyFirebaseTokens(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    ensureAdminApp();

    const authHeader = req.header("Authorization");
    const idToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    const appCheckToken = req.header("X-Firebase-AppCheck");

    if (!idToken) {
      return res.status(401).json({ error: "Missing Firebase ID token" });
    }

    if (!appCheckToken) {
      return res.status(401).json({ error: "Missing App Check token" });
    }

    const decodedUser = await getAuth().verifyIdToken(idToken);
    const decodedAppCheck = await getAppCheck().verifyToken(appCheckToken);

    req.user = { uid: decodedUser.uid };
    req.appCheckData = decodedAppCheck;

    next();
  } catch (error) {
    console.error("Token verification failed:", error);
    return res.status(401).json({ error: "Unauthorized" });
  }
}