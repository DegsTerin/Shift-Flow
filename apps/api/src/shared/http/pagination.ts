import { z } from "zod";

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25)
});

export type Pagination = z.infer<typeof paginationSchema>;

export function toPagination(query: unknown): Pagination {
  return paginationSchema.parse(query);
}

export function toSkipTake({ page, pageSize }: Pagination) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}
