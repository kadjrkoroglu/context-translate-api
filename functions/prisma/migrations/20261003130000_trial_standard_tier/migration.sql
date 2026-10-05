-- Both plans get a 14-day trial; the Premium one keeps its 5-minute Live quota.
ALTER TYPE "Tier" RENAME VALUE 'trial' TO 'trial_premium';
ALTER TYPE "Tier" ADD VALUE IF NOT EXISTS 'trial_standard';
