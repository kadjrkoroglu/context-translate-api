-- Standard trial: exactly Standard's features and limits.
INSERT INTO "tier_entitlements" ("tier", "max_decks", "max_cards_per_deck", "photo", "live", "chat")
VALUES ('trial_standard', NULL, NULL, true, false, false)
ON CONFLICT DO NOTHING;

INSERT INTO "bucket_configs" ("tier", "feature", "capacity", "refill_per_sec")
VALUES ('trial_standard', 'translate', 20, 0.2), ('trial_standard', 'photo', 10, 0.1)
ON CONFLICT DO NOTHING;
