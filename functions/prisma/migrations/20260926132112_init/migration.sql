-- CreateEnum
CREATE TYPE "Tier" AS ENUM ('free', 'standard', 'premium');

-- CreateEnum
CREATE TYPE "Feature" AS ENUM ('translate', 'photo', 'chat', 'live');

-- CreateEnum
CREATE TYPE "Window" AS ENUM ('hour', 'day', 'week', 'month');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "firebase_uid" TEXT NOT NULL,
    "tier" "Tier" NOT NULL DEFAULT 'free',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_limits" (
    "tier" "Tier" NOT NULL,
    "feature" "Feature" NOT NULL,
    "window" "Window" NOT NULL,
    "limit" INTEGER NOT NULL,

    CONSTRAINT "plan_limits_pkey" PRIMARY KEY ("tier","feature","window")
);

-- CreateTable
CREATE TABLE "usage_counters" (
    "user_id" INTEGER NOT NULL,
    "feature" "Feature" NOT NULL,
    "window" "Window" NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("user_id","feature","window","window_start")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE INDEX "usage_counters_window_start_idx" ON "usage_counters"("window_start");

-- AddForeignKey
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
