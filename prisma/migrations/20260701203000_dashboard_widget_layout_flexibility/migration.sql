DROP INDEX IF EXISTS "dashboard_widgets_dashboardConfigId_gridColumn_gridRow_key";

ALTER TABLE "dashboard_configurations"
  DROP CONSTRAINT IF EXISTS "dashboard_configurations_teamId_companyId_fkey";

ALTER TABLE "dashboard_configurations"
  ADD CONSTRAINT "dashboard_configurations_teamId_companyId_fkey"
  FOREIGN KEY ("teamId", "companyId")
  REFERENCES "teams"("id", "companyId")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;
