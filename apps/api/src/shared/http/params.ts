// en-GB: Defines the params implementation so this project responsibility remains explicit and maintainable.
import { badRequest } from "../errors/app-error.js";
import { z } from "zod";

const uuidSchema = z.string().uuid();

export function uuidParam(value: string | string[] | undefined, name: string) {
  if (!value || Array.isArray(value)) {
    throw badRequest(`${name} parameter is required`);
  }

  if (!uuidSchema.safeParse(value).success) {
    throw badRequest(`${name} parameter must be a valid UUID`);
  }

  return value;
}
