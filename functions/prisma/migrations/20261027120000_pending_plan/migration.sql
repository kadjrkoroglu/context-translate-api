-- A plan switch waiting for the paid period to end (Premium → Standard).
ALTER TABLE "users" ADD COLUMN "pending_plan" "Tier",
ADD COLUMN "pending_plan_at" TIMESTAMP(3);
