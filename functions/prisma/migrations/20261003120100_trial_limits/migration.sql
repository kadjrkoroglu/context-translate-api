-- Trial gets Premium's features and limits, but only 5 minutes of Live.
INSERT INTO "tier_entitlements" ("tier", "max_decks", "max_cards_per_deck", "photo", "live", "chat")
VALUES ('trial', NULL, NULL, true, true, true)
ON CONFLICT DO NOTHING;

INSERT INTO "bucket_configs" ("tier", "feature", "capacity", "refill_per_sec")
VALUES ('trial', 'translate', 20, 0.2), ('trial', 'photo', 10, 0.1)
ON CONFLICT DO NOTHING;

INSERT INTO "plan_limits" ("tier", "feature", "window", "limit")
VALUES ('trial', 'live', 'month', 300)
ON CONFLICT DO NOTHING;
