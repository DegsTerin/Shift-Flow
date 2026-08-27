// en-GB: Defines the pagination implementation so this project responsibility remains explicit and maintainable.
import { z } from "zod";
import { badRequest } from "../errors/app-error.js";

export const maxPage = 10_000;

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().max(maxPage).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
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
