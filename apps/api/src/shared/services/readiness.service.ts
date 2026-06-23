import { getPrisma } from "../lib/prisma.js";
import { AppError } from "../errors/app-error.js";

type PrismaHealthClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray): Promise<T>;
};

export async function checkReadiness() {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  const prisma = (await getPrisma()) as PrismaHealthClient;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    throw new AppError(
      "Database readiness check failed",
      503,
      "READINESS_CHECK_FAILED",
      error instanceof Error ? error.message : error
    );
  }
}
