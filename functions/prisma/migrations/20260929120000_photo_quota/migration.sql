-- Photo translation: token bucket for Standard/Premium (burst 10, then 1 every 10 s).
-- No row for free on purpose: without a config the feature is not available.
INSERT INTO "bucket_configs" ("tier", "feature", "capacity", "refill_per_sec")
VALUES ('standard', 'photo', 10, 0.1), ('premium', 'photo', 10, 0.1)
ON CONFLICT DO NOTHING;
