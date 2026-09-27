/*
  Warnings:

  - The primary key for the `usage_counters` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "usage_counters" DROP CONSTRAINT "usage_counters_pkey",
ALTER COLUMN "window_start" SET DATA TYPE TIMESTAMPTZ(3),
ADD CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("user_id", "feature", "window", "window_start");

-- CreateTable
CREATE TABLE "bucket_configs" (
    "tier" "Tier" NOT NULL,
    "feature" "Feature" NOT NULL,
    "capacity" INTEGER NOT NULL,
    "refill_per_sec" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "bucket_configs_pkey" PRIMARY KEY ("tier","feature")
);

-- CreateTable
CREATE TABLE "rate_buckets" (
    "user_id" INTEGER NOT NULL,
    "feature" "Feature" NOT NULL,
    "tokens" DOUBLE PRECISION NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "rate_buckets_pkey" PRIMARY KEY ("user_id","feature")
);

-- CreateTable
CREATE TABLE "tier_entitlements" (
    "tier" "Tier" NOT NULL,
    "max_decks" INTEGER,
    "max_cards_per_deck" INTEGER,
    "photo" BOOLEAN NOT NULL DEFAULT false,
    "live" BOOLEAN NOT NULL DEFAULT false,
    "chat" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tier_entitlements_pkey" PRIMARY KEY ("tier")
);

-- AddForeignKey
ALTER TABLE "rate_buckets" ADD CONSTRAINT "rate_buckets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initial plan configuration (editable later without a deploy)
INSERT INTO "plan_limits" ("tier", "feature", "window", "limit")
VALUES ('free', 'translate', 'day', 10)
ON CONFLICT DO NOTHING;

INSERT INTO "bucket_configs" ("tier", "feature", "capacity", "refill_per_sec")
VALUES ('standard', 'translate', 20, 0.2), ('premium', 'translate', 20, 0.2)
ON CONFLICT DO NOTHING;

INSERT INTO "tier_entitlements" ("tier", "max_decks", "max_cards_per_deck", "photo", "live", "chat")
VALUES ('free', 1, 20, false, false, false),
       ('standard', NULL, NULL, true, false, false),
       ('premium', NULL, NULL, true, true, true)
ON CONFLICT DO NOTHING;
