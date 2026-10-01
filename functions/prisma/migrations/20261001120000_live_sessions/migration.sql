-- Live translation: Premium gets 60 minutes a month, counted in seconds.
-- No row for other tiers on purpose: without a limit the feature is not available.
INSERT INTO "plan_limits" ("tier", "feature", "window", "limit")
VALUES ('premium', 'live', 'month', 3600)
ON CONFLICT DO NOTHING;

-- CreateTable
CREATE TABLE "live_sessions" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "granted_seconds" INTEGER NOT NULL,
    "window" "Window" NOT NULL,
    "window_start" TIMESTAMPTZ(3) NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),

    CONSTRAINT "live_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "live_sessions_user_id_idx" ON "live_sessions"("user_id");

-- AddForeignKey
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
