-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "UserTheme" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('PT_BR', 'EN_GB');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'COMPANY', 'CLIENT', 'TEAM');

-- CreateEnum
CREATE TYPE "TeamMemberRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('PLANNED', 'OPEN', 'CLOSED', 'REOPENED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ShiftCoverageType" AS ENUM ('REGULAR', 'ON_CALL', 'VACATION', 'SUBSTITUTE', 'ABSENCE');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'WAITING_THIRD_PARTY', 'MONITORING', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ActivityPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ActivityHistoryType" AS ENUM ('CREATED', 'UPDATED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'ASSIGNED', 'UNASSIGNED', 'MOVED_TEAM', 'MOVED_SHIFT', 'SLA_UPDATED', 'COMMENTED', 'ATTACHMENT_ADDED', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('ACTIVITY_ASSIGNED', 'ACTIVITY_STATUS_CHANGED', 'SLA_AT_RISK', 'SLA_BREACHED', 'COMMENT_ADDED', 'SHIFT_REPORT_READY', 'SYSTEM');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ShiftReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "legalName" VARCHAR(200),
    "document" VARCHAR(64),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "code" VARCHAR(64),
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "updatedById" UUID,
    "deletedById" UUID,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "displayName" VARCHAR(160) NOT NULL,
    "jobTitle" VARCHAR(120),
    "status" "UserStatus" NOT NULL DEFAULT 'INVITED',
    "preferredLocale" "Locale" NOT NULL DEFAULT 'PT_BR',
    "preferredTheme" "UserTheme" NOT NULL DEFAULT 'SYSTEM',
    "lastLoginAt" TIMESTAMPTZ(6),
    "passwordChangedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_companies" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_clients" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "user_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "color" VARCHAR(16),
    "defaultSlaMinutes" INTEGER,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "updatedById" UUID,
    "deletedById" UUID,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_clients" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "team_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "TeamMemberRole" NOT NULL DEFAULT 'MEMBER',
    "startsAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'America/Sao_Paulo',
    "status" "ShiftStatus" NOT NULL DEFAULT 'PLANNED',
    "closedAt" TIMESTAMPTZ(6),
    "reopenedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "updatedById" UUID,
    "deletedById" UUID,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_coverages" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "replacementForUserId" UUID,
    "type" "ShiftCoverageType" NOT NULL DEFAULT 'REGULAR',
    "startsAt" TIMESTAMPTZ(6) NOT NULL,
    "endsAt" TIMESTAMPTZ(6) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "shift_coverages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL DEFAULT 'COMPANY',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "resource" VARCHAR(80) NOT NULL,
    "action" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "roleId" UUID NOT NULL,
    "permissionId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_role_assignments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "clientId" UUID,
    "teamId" UUID,
    "startsAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "user_role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "shiftId" UUID,
    "assigneeId" UUID,
    "reporterId" UUID,
    "title" VARCHAR(220) NOT NULL,
    "description" TEXT,
    "systemName" VARCHAR(120),
    "status" "ActivityStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "ActivityPriority" NOT NULL DEFAULT 'MEDIUM',
    "slaDueAt" TIMESTAMPTZ(6),
    "startedAt" TIMESTAMPTZ(6),
    "completedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "createdById" UUID,
    "updatedById" UUID,
    "deletedById" UUID,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_history" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "actorUserId" UUID,
    "type" "ActivityHistoryType" NOT NULL,
    "fromStatus" "ActivityStatus",
    "toStatus" "ActivityStatus",
    "fromPriority" "ActivityPriority",
    "toPriority" "ActivityPriority",
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "editedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "commentId" UUID,
    "uploadedById" UUID NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(160) NOT NULL,
    "byteSize" BIGINT NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "checksumSha256" VARCHAR(64),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),
    "deletedById" UUID,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "clientId" UUID,
    "teamId" UUID,
    "shiftId" UUID,
    "activityId" UUID,
    "type" "NotificationType" NOT NULL,
    "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" VARCHAR(180) NOT NULL,
    "body" TEXT,
    "readAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_reports" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "shiftId" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "approvedById" UUID,
    "status" "ShiftReportStatus" NOT NULL DEFAULT 'DRAFT',
    "summary" TEXT NOT NULL,
    "pendingNotes" TEXT,
    "metrics" JSONB,
    "submittedAt" TIMESTAMPTZ(6),
    "approvedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "shift_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_report_activities" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "shiftReportId" UUID NOT NULL,
    "activityId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_report_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "companyId" UUID,
    "clientId" UUID,
    "teamId" UUID,
    "shiftId" UUID,
    "activityId" UUID,
    "shiftReportId" UUID,
    "actorUserId" UUID,
    "entityType" VARCHAR(120) NOT NULL,
    "entityId" VARCHAR(80) NOT NULL,
    "action" VARCHAR(120) NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" VARCHAR(120),
    "ipAddress" VARCHAR(80),
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "userAgent" TEXT,
    "ipAddress" VARCHAR(80),
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_status_deletedAt_idx" ON "companies"("status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key" ON "companies"("name");

-- CreateIndex
CREATE UNIQUE INDEX "companies_id_status_key" ON "companies"("id", "status");

-- CreateIndex
CREATE INDEX "clients_companyId_status_deletedAt_idx" ON "clients"("companyId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "clients_companyId_name_key" ON "clients"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "clients_companyId_code_key" ON "clients"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "clients_id_companyId_key" ON "clients"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_status_deletedAt_idx" ON "users"("status", "deletedAt");

-- CreateIndex
CREATE INDEX "user_companies_userId_deletedAt_idx" ON "user_companies"("userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_companies_companyId_userId_key" ON "user_companies"("companyId", "userId");

-- CreateIndex
CREATE INDEX "user_clients_companyId_userId_deletedAt_idx" ON "user_clients"("companyId", "userId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_clients_companyId_clientId_userId_key" ON "user_clients"("companyId", "clientId", "userId");

-- CreateIndex
CREATE INDEX "teams_companyId_deletedAt_idx" ON "teams"("companyId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "teams_companyId_name_key" ON "teams"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "teams_id_companyId_key" ON "teams"("id", "companyId");

-- CreateIndex
CREATE INDEX "team_clients_companyId_clientId_deletedAt_idx" ON "team_clients"("companyId", "clientId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "team_clients_companyId_teamId_clientId_key" ON "team_clients"("companyId", "teamId", "clientId");

-- CreateIndex
CREATE INDEX "team_members_companyId_teamId_role_deletedAt_idx" ON "team_members"("companyId", "teamId", "role", "deletedAt");

-- CreateIndex
CREATE INDEX "team_members_companyId_userId_deletedAt_idx" ON "team_members"("companyId", "userId", "deletedAt");

-- CreateIndex
CREATE INDEX "shifts_companyId_teamId_status_startsAt_idx" ON "shifts"("companyId", "teamId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "shifts_companyId_status_deletedAt_idx" ON "shifts"("companyId", "status", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "shifts_id_companyId_key" ON "shifts"("id", "companyId");

-- CreateIndex
CREATE INDEX "shift_coverages_companyId_shiftId_type_deletedAt_idx" ON "shift_coverages"("companyId", "shiftId", "type", "deletedAt");

-- CreateIndex
CREATE INDEX "shift_coverages_companyId_userId_startsAt_endsAt_idx" ON "shift_coverages"("companyId", "userId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "roles_companyId_scope_deletedAt_idx" ON "roles"("companyId", "scope", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_companyId_name_key" ON "roles"("companyId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "roles_id_companyId_key" ON "roles"("id", "companyId");

-- CreateIndex
CREATE INDEX "permissions_resource_action_deletedAt_idx" ON "permissions"("resource", "action", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_companyId_resource_action_key" ON "permissions"("companyId", "resource", "action");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_id_companyId_key" ON "permissions"("id", "companyId");

-- CreateIndex
CREATE INDEX "role_permissions_companyId_roleId_idx" ON "role_permissions"("companyId", "roleId");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_roleId_permissionId_key" ON "role_permissions"("roleId", "permissionId");

-- CreateIndex
CREATE INDEX "user_role_assignments_companyId_userId_deletedAt_idx" ON "user_role_assignments"("companyId", "userId", "deletedAt");

-- CreateIndex
CREATE INDEX "user_role_assignments_companyId_clientId_userId_idx" ON "user_role_assignments"("companyId", "clientId", "userId");

-- CreateIndex
CREATE INDEX "user_role_assignments_companyId_teamId_userId_idx" ON "user_role_assignments"("companyId", "teamId", "userId");

-- CreateIndex
CREATE INDEX "activities_companyId_status_priority_slaDueAt_idx" ON "activities"("companyId", "status", "priority", "slaDueAt");

-- CreateIndex
CREATE INDEX "activities_companyId_clientId_status_updatedAt_idx" ON "activities"("companyId", "clientId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "activities_companyId_teamId_status_updatedAt_idx" ON "activities"("companyId", "teamId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "activities_companyId_shiftId_status_updatedAt_idx" ON "activities"("companyId", "shiftId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "activities_companyId_assigneeId_status_updatedAt_idx" ON "activities"("companyId", "assigneeId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "activities_companyId_deletedAt_idx" ON "activities"("companyId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "activities_id_companyId_key" ON "activities"("id", "companyId");

-- CreateIndex
CREATE INDEX "activity_history_companyId_activityId_createdAt_idx" ON "activity_history"("companyId", "activityId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_history_companyId_type_createdAt_idx" ON "activity_history"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "comments_companyId_activityId_createdAt_idx" ON "comments"("companyId", "activityId", "createdAt");

-- CreateIndex
CREATE INDEX "comments_companyId_authorId_deletedAt_idx" ON "comments"("companyId", "authorId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "comments_id_companyId_key" ON "comments"("id", "companyId");

-- CreateIndex
CREATE INDEX "attachments_companyId_activityId_createdAt_idx" ON "attachments"("companyId", "activityId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_companyId_commentId_createdAt_idx" ON "attachments"("companyId", "commentId", "createdAt");

-- CreateIndex
CREATE INDEX "attachments_companyId_uploadedById_deletedAt_idx" ON "attachments"("companyId", "uploadedById", "deletedAt");

-- CreateIndex
CREATE INDEX "notifications_companyId_recipientId_readAt_createdAt_idx" ON "notifications"("companyId", "recipientId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_companyId_type_createdAt_idx" ON "notifications"("companyId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_companyId_activityId_createdAt_idx" ON "notifications"("companyId", "activityId", "createdAt");

-- CreateIndex
CREATE INDEX "shift_reports_companyId_teamId_status_createdAt_idx" ON "shift_reports"("companyId", "teamId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "shift_reports_companyId_shiftId_key" ON "shift_reports"("companyId", "shiftId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_reports_id_companyId_key" ON "shift_reports"("id", "companyId");

-- CreateIndex
CREATE INDEX "shift_report_activities_companyId_activityId_idx" ON "shift_report_activities"("companyId", "activityId");

-- CreateIndex
CREATE UNIQUE INDEX "shift_report_activities_companyId_shiftReportId_activityId_key" ON "shift_report_activities"("companyId", "shiftReportId", "activityId");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_entityType_entityId_createdAt_idx" ON "audit_logs"("companyId", "entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_actorUserId_createdAt_idx" ON "audit_logs"("companyId", "actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_companyId_action_createdAt_idx" ON "audit_logs"("companyId", "action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_expiresAt_revokedAt_idx" ON "refresh_tokens"("userId", "expiresAt", "revokedAt");

-- AddForeignKey
ALTER TABLE "clients" ADD CONSTRAINT "clients_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clients" ADD CONSTRAINT "user_clients_clientId_companyId_fkey" FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_clients" ADD CONSTRAINT "user_clients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_clients" ADD CONSTRAINT "team_clients_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_clients" ADD CONSTRAINT "team_clients_clientId_companyId_fkey" FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_coverages" ADD CONSTRAINT "shift_coverages_shiftId_companyId_fkey" FOREIGN KEY ("shiftId", "companyId") REFERENCES "shifts"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_coverages" ADD CONSTRAINT "shift_coverages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_coverages" ADD CONSTRAINT "shift_coverages_replacementForUserId_fkey" FOREIGN KEY ("replacementForUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permissions" ADD CONSTRAINT "permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_clientId_companyId_fkey" FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_role_assignments" ADD CONSTRAINT "user_role_assignments_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_clientId_companyId_fkey" FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_shiftId_companyId_fkey" FOREIGN KEY ("shiftId", "companyId") REFERENCES "shifts"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activities" ADD CONSTRAINT "activities_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_history" ADD CONSTRAINT "activity_history_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_history" ADD CONSTRAINT "activity_history_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_history" ADD CONSTRAINT "activity_history_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_commentId_companyId_fkey" FOREIGN KEY ("commentId", "companyId") REFERENCES "comments"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_clientId_companyId_fkey" FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_shiftId_companyId_fkey" FOREIGN KEY ("shiftId", "companyId") REFERENCES "shifts"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_shiftId_companyId_fkey" FOREIGN KEY ("shiftId", "companyId") REFERENCES "shifts"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_reports" ADD CONSTRAINT "shift_reports_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_report_activities" ADD CONSTRAINT "shift_report_activities_shiftReportId_companyId_fkey" FOREIGN KEY ("shiftReportId", "companyId") REFERENCES "shift_reports"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_report_activities" ADD CONSTRAINT "shift_report_activities_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_clientId_companyId_fkey" FOREIGN KEY ("clientId", "companyId") REFERENCES "clients"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shiftId_companyId_fkey" FOREIGN KEY ("shiftId", "companyId") REFERENCES "shifts"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_activityId_companyId_fkey" FOREIGN KEY ("activityId", "companyId") REFERENCES "activities"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_shiftReportId_companyId_fkey" FOREIGN KEY ("shiftReportId", "companyId") REFERENCES "shift_reports"("id", "companyId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
