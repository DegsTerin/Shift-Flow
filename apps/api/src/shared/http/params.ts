// en-GB: Defines the params implementation so this project responsibility remains explicit and maintainable.
import { badRequest } from "../errors/app-error.js";

export function param(value: string | string[] | undefined, name: string) {
  if (!value || Array.isArray(value)) {
    throw badRequest(`${name} parameter is required`);
  }

  return value;
}
