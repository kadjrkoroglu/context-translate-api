-- Study with AI: 3 hours between sessions (editable per tier without a deploy).
ALTER TABLE "tier_entitlements" ADD COLUMN "chat_cooldown_seconds" INTEGER NOT NULL DEFAULT 10800;

-- CreateTable
CREATE TABLE "study_sessions" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "deck_id" TEXT NOT NULL,
    "deck_name" TEXT NOT NULL,
    "native_language" TEXT NOT NULL,
    "studied_language" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "queue" JSONB NOT NULL,
    "task" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "task_count" INTEGER NOT NULL DEFAULT 0,
    "message_count" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(3),

    CONSTRAINT "study_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "study_sessions_user_id_completed_at_idx" ON "study_sessions"("user_id", "completed_at");

-- AddForeignKey
ALTER TABLE "study_sessions" ADD CONSTRAINT "study_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
