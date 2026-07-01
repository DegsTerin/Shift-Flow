-- CreateEnum
CREATE TYPE "DashboardType" AS ENUM ('MAIN', 'TEAM', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "WidgetType" AS ENUM ('SUMMARY_CARD', 'BAR_CHART', 'LINE_CHART', 'PIE_CHART', 'TABLE', 'LIST', 'INDICATOR', 'CALENDAR', 'RECENT_ACTIVITIES', 'CUSTOM');

-- CreateEnum
CREATE TYPE "WidgetSize" AS ENUM ('SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE');

-- CreateTable
CREATE TABLE "dashboard_configurations" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "dashboardType" "DashboardType" NOT NULL DEFAULT 'MAIN',
    "teamId" UUID,
    "gridColumns" INTEGER NOT NULL DEFAULT 12,
    "gridGap" INTEGER NOT NULL DEFAULT 16,
    "isEditing" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "dashboard_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dashboard_widgets" (
    "id" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "dashboardConfigId" UUID NOT NULL,
    "widgetType" "WidgetType" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(255),
    "gridColumn" INTEGER NOT NULL DEFAULT 1,
    "gridRow" INTEGER NOT NULL DEFAULT 1,
    "gridWidth" INTEGER NOT NULL DEFAULT 3,
    "gridHeight" INTEGER NOT NULL DEFAULT 2,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL DEFAULT 0,
    "refreshIntervalMs" INTEGER DEFAULT 60000,
    "settings" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "dashboard_widgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dashboard_configurations_companyId_userId_dashboardType_idx" ON "dashboard_configurations"("companyId", "userId", "dashboardType");

-- CreateIndex
CREATE INDEX "dashboard_configurations_companyId_dashboardType_deletedAt_idx" ON "dashboard_configurations"("companyId", "dashboardType", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_configurations_companyId_userId_dashboardType_tea_key" ON "dashboard_configurations"("companyId", "userId", "dashboardType", "teamId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_configurations_id_companyId_key" ON "dashboard_configurations"("id", "companyId");

-- CreateIndex
CREATE INDEX "dashboard_widgets_companyId_dashboardConfigId_widgetType_idx" ON "dashboard_widgets"("companyId", "dashboardConfigId", "widgetType");

-- CreateIndex
CREATE INDEX "dashboard_widgets_companyId_dashboardConfigId_isVisible_ord_idx" ON "dashboard_widgets"("companyId", "dashboardConfigId", "isVisible", "order");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_widgets_id_companyId_key" ON "dashboard_widgets"("id", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_widgets_dashboardConfigId_gridColumn_gridRow_key" ON "dashboard_widgets"("dashboardConfigId", "gridColumn", "gridRow");

-- AddForeignKey
ALTER TABLE "dashboard_configurations" ADD CONSTRAINT "dashboard_configurations_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_configurations" ADD CONSTRAINT "dashboard_configurations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_configurations" ADD CONSTRAINT "dashboard_configurations_teamId_companyId_fkey" FOREIGN KEY ("teamId", "companyId") REFERENCES "teams"("id", "companyId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboardConfigId_companyId_fkey" FOREIGN KEY ("dashboardConfigId", "companyId") REFERENCES "dashboard_configurations"("id", "companyId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
