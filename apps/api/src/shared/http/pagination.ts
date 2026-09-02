// en-GB: Defines the pagination implementation so this project responsibility remains explicit and maintainable.
import { z } from "zod";
import { badRequest } from "../errors/app-error.js";

export const maxPage = 10_000;

function boundedDecimalInteger(defaultValue: number, maximum: number) {
  return z.preprocess(
    (value) => {
      if (value === undefined || typeof value === "number") return value;
      if (typeof value === "string" && /^[1-9]\d*$/.test(value)) return Number(value);
      return value;
    },
    z.number().int().min(1).max(maximum).default(defaultValue)
  );
}

export const paginationSchema = z.object({
  page: boundedDecimalInteger(1, maxPage),
  pageSize: boundedDecimalInteger(25, 100)
});

export const searchableListQuerySchema = z.object({
  search: z.string().trim().max(200).optional()
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toPagination(query: unknown): Pagination {
  const result = paginationSchema.safeParse(query);
  if (!result.success) {
    throw badRequest("Invalid pagination", result.error.flatten());
  }
  return result.data;
}

export function toSkipTake({ page, pageSize }: Pagination) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export function toBoundedSearch(query: unknown) {
  if (
    !query ||
    typeof query !== "object" ||
    !Object.prototype.hasOwnProperty.call(query, "search")
  ) {
    return "";
  }

  const result = searchableListQuerySchema.safeParse({
    search: (query as { search?: unknown }).search
  });
  if (!result.success) {
    throw badRequest("Invalid search", result.error.flatten());
  }
  return result.data.search ?? "";
}
