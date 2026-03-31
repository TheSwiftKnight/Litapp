import type { Request, Response, NextFunction } from "express";
import { auth, admin } from "../firebaseAdmin";

declare global {
  // eslint-disable-next-line no-var
  var __user: { uid: string } | undefined;
}

export type AuthedRequest = Request & { user: { uid: string } };

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const appCheckEnforced = (process.env.APP_CHECK_ENFORCED ?? "false").toLowerCase() === "true";
    if (appCheckEnforced) {
      const token =
        req.header("X-Firebase-AppCheck") ??
        req.header("x-firebase-appcheck") ??
        undefined;
      if (!token) {
        return res.status(401).json({ error: "Missing App Check token" });
      }
      // Note: firebase-admin Verify token signature may vary; keep MVP permissive on failures.
      try {
        await (admin as any).appCheck().verifyToken(token);
      } catch (e) {
        return res.status(401).json({ error: "Invalid App Check token" });
      }
    }

    const header = req.header("Authorization");
    if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing bearer token" });
    const idToken = header.slice("Bearer ".length);
    const decoded = await auth.verifyIdToken(idToken);
    const uid = decoded.uid;
    (req as AuthedRequest).user = { uid };
    next();
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : "Unauthorized" });
  }
}

