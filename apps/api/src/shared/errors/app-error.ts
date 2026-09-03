// en-GB: Defines the app error implementation so this project responsibility remains explicit and maintainable.
export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "INTERNAL_ERROR",
    public readonly details?: unknown,
    public readonly retryAfterSeconds?: number
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(message, 400, "BAD_REQUEST", details);

export const unauthorized = (message = "Authentication required") =>
  new AppError(message, 401, "UNAUTHORIZED");

export const forbidden = (message = "Permission denied") => new AppError(message, 403, "FORBIDDEN");

export const notFound = (message = "Resource not found") => new AppError(message, 404, "NOT_FOUND");

export const conflict = (message = "Resource already exists", details?: unknown) =>
  new AppError(message, 409, "CONFLICT", details);
