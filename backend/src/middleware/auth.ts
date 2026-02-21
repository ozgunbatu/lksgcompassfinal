import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export type AuthClaims = { userId: string; companyId: string; role: string };

declare global {
  namespace Express {
    interface Request {
      auth?: AuthClaims;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as AuthClaims;
    req.auth = decoded;
    return next();
  } catch {
    return res.status(401).json({ error: "Invalid/expired token" });
  }
}
