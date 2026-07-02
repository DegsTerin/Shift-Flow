ALTER TABLE "activity_tasks"
ADD COLUMN "dueAt" TIMESTAMPTZ(6);

CREATE INDEX "activity_tasks_companyId_dueAt_archivedAt_deletedAt_idx"
ON "activity_tasks"("companyId", "dueAt", "archivedAt", "deletedAt");
