import { badRequest } from "../errors/app-error.js";

export function param(value: string | string[] | undefined, name: string) {
  if (!value || Array.isArray(value)) {
    throw badRequest(`${name} parameter is required`);
  }

  return value;
}
