-- Free plan: 2 decks (was 1), still 20 cards each.
UPDATE "tier_entitlements" SET "max_decks" = 2 WHERE "tier" = 'free';
