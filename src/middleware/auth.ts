import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

export interface AuthUser {
  id: number;
  cc: string;
  rolId: number;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Token requerido" });
    return;
  }
  const token = header.split(" ")[1];
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({ message: "JWT_SECRET no configurado" });
      return;
    }
    const payload = jwt.verify(token, secret) as any;
    req.user = {
      id: payload.id,
      cc: payload.cc,
      rolId: payload.rolId,
    };
    next();
  } catch {
    res.status(401).json({ message: "Token inválido o expirado" });
  }
}
