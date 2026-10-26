-- Study with AI is part of Standard (and its trial) too; Live stays Premium's own.
UPDATE "tier_entitlements" SET "chat" = true WHERE "tier" IN ('standard', 'trial_standard');
