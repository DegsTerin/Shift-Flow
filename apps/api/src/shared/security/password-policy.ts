import { badRequest } from "../errors/app-error.js";

const commonPasswords = new Set([
  "password",
  "password1",
  "12345678",
  "123456789",
  "qwerty123",
  "shiftflow",
  "admin1234",
  "letmein123"
]);

export function validatePasswordPolicy(password: string) {
  const failures: string[] = [];
  const normalized = password.trim().toLowerCase();

  if (password.length < 12) failures.push("at least 12 characters");
  if (!/[a-z]/.test(password)) failures.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) failures.push("an uppercase letter");
  if (!/[0-9]/.test(password)) failures.push("a number");
  if (!/[^A-Za-z0-9]/.test(password)) failures.push("a symbol");
  if (commonPasswords.has(normalized)) failures.push("not a common password");

  if (failures.length > 0) {
    throw badRequest(`Password must include ${failures.join(", ")}`);
  }
}
