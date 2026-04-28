import type { Request, Response, NextFunction } from "express";
import { ApiError, HttpStatus, type ApiErrorBody } from "../types/api";

export function notFoundHandler(_req: Request, res: Response): void {
  const body: ApiErrorBody = {
    error: "Recurso no encontrado",
    code: "not_found",
  };
  res.status(HttpStatus.NotFound).json(body);
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ApiError) {
    const body: ApiErrorBody = {
      error: err.message,
      code: err.code,
      details: err.details,
    };
    res.status(err.status).json(body);
    return;
  }

  console.error("[error-handler] Error no controlado:", err);
  const body: ApiErrorBody = {
    error: "Error interno del servidor",
    code: "internal_error",
  };
  res.status(HttpStatus.InternalServerError).json(body);
}
