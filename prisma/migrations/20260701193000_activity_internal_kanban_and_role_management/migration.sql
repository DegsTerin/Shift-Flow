-- CreateEnum
CREATE TYPE "ActivityTaskHistoryType" AS ENUM ('CREATED', 'UPDATED', 'MOVED', 'ARCHIVED', 'RESTORED', 'DELETED');

-- AlterTable
ALTER TABLE "roles" ADD COLUMN "color" VARCHAR(16);
ALTER TABLE "roles" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "activity_task_columns" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "color" VARCHAR(16),
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "activity_task_columns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_tasks" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "columnId" UUID NOT NULL,
    "assigneeId" UUID,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "priority" "ActivityPriority" NOT NULL DEFAULT 'MEDIUM',
    "labels" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "attachmentIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMPTZ(6),
    "archivedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "activity_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_task_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "taskId" UUID,
    "actorUserId" UUID,
    "type" "ActivityTaskHistoryType" NOT NULL,
    "fromColumnId" UUID,
    "toColumnId" UUID,
    "fromPosition" INTEGER,
    "toPosition" INTEGER,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_task_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activity_task_columns_id_companyId_key" ON "activity_task_columns"("id", "companyId");
CREATE INDEX "activity_task_columns_companyId_activityId_position_deletedAt_idx" ON "activity_task_columns"("companyId", "activityId", "position", "deletedAt");
CREATE UNIQUE INDEX "activity_tasks_id_companyId_key" ON "activity_tasks"("id", "companyId");
CREATE INDEX "activity_tasks_companyId_activityId_columnId_position_deletedAt_idx" ON "activity_tasks"("companyId", "activityId", "columnId", "position", "deletedAt");
CREATE INDEX "activity_tasks_companyId_assigneeId_archivedAt_idx" ON "activity_tasks"("companyId", "assigneeId", "archivedAt");
CREATE INDEX "activity_task_history_companyId_activityId_createdAt_idx" ON "activity_task_history"("companyId", "activityId", "createdAt");
CREATE INDEX "activity_task_history_companyId_taskId_createdAt_idx" ON "activity_task_history"("companyId", "taskId", "createdAt");

-- AddForeignKey
ALTER TABLE "activity_task_columns" ADD CONSTRAINT "activity_task_columns_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_task_columns" ADD CONSTRAINT "activity_task_columns_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_tasks" ADD CONSTRAINT "activity_tasks_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_tasks" ADD CONSTRAINT "activity_tasks_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_tasks" ADD CONSTRAINT "activity_tasks_columnId_companyId_fkey" FOREIGN KEY ("columnId", "companyId") REFERENCES "activity_task_columns"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_tasks" ADD CONSTRAINT "activity_tasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_task_history" ADD CONSTRAINT "activity_task_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "activity_task_history" ADD CONSTRAINT "activity_task_history_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_task_history" ADD CONSTRAINT "activity_task_history_taskId_companyId_fkey" FOREIGN KEY ("taskId", "companyId") REFERENCES "activity_tasks"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "activity_task_history" ADD CONSTRAINT "activity_task_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
