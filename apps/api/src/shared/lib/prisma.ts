// en-GB: Defines the prisma implementation so this project responsibility remains explicit and maintainable.
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { AppError } from "../errors/app-error.js";

export type PrismaTransactionClient = {
  [delegate: string]: unknown;
};

type PrismaLike = PrismaTransactionClient & {
  $disconnect?: () => Promise<void>;
  $transaction?: <T>(operation: (transaction: PrismaTransactionClient) => Promise<T>) => Promise<T>;
};

type PrismaClientOptions = {
  adapter: PrismaPg;
};

let client: PrismaLike | undefined;

async function importPrismaClient() {
  const importer = new Function("specifier", "return import(specifier)") as (
    specifier: string
  ) => Promise<{
    PrismaClient: new (options: PrismaClientOptions) => PrismaLike;
  }>;
  const generatedClientUrl = pathToFileURL(
    join(process.cwd(), "generated", "prisma", "client.js")
  ).href;

  return importer(generatedClientUrl);
}

export async function getPrisma() {
  if (client) {
    return client;
  }

  try {
    const { PrismaClient } = await importPrismaClient();
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error("DATABASE_URL is required to create the Prisma PostgreSQL adapter.");
    }

    client = new PrismaClient({
      adapter: new PrismaPg({ connectionString })
    });
    return client;
  } catch (error) {
    throw new AppError(
      "Prisma Client is not generated. Run the existing prisma:generate script before using database-backed endpoints.",
      503,
      "PRISMA_CLIENT_UNAVAILABLE",
      error instanceof Error ? error.message : error
    );
  }
}

export async function getDelegate<T = Record<string, unknown>>(name: string) {
  const prisma = await getPrisma();
  return getDelegateFrom<T>(prisma, name);
}

export function getDelegateFrom<T = Record<string, unknown>>(
  prisma: PrismaTransactionClient,
  name: string
) {
  const delegate = prisma[name];

  if (!delegate) {
    throw new AppError(`Prisma delegate '${name}' is unavailable`, 500);
  }

  return delegate as T;
}

export async function withPrismaTransaction<T>(
  operation: (transaction: PrismaTransactionClient) => Promise<T>
) {
  const prisma = await getPrisma();
  if (typeof prisma.$transaction !== "function") {
    throw new AppError(
      "Prisma transactions are unavailable",
      500,
      "PRISMA_TRANSACTION_UNAVAILABLE"
    );
  }

  return prisma.$transaction(operation);
}
