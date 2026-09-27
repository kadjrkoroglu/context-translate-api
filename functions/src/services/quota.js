const { Prisma } = require('@prisma/client');
const prisma = require('./prisma');

class QuotaExceeded extends Error {
    constructor(info) {
        super('Quota exceeded');
        this.info = info;
    }
}

// Windows are aligned to UTC
function windowBounds(window, now = new Date()) {
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    const d = now.getUTCDate();
    if (window === 'hour') {
        const start = new Date(Date.UTC(y, m, d, now.getUTCHours()));
        return { start, end: new Date(start.getTime() + 3600e3) };
    }
    if (window === 'day') {
        const start = new Date(Date.UTC(y, m, d));
        return { start, end: new Date(start.getTime() + 86400e3) };
    }
    if (window === 'week') {
        const daysSinceMonday = (now.getUTCDay() + 6) % 7;
        const start = new Date(Date.UTC(y, m, d - daysSinceMonday));
        return { start, end: new Date(start.getTime() + 7 * 86400e3) };
    }
    return { start: new Date(Date.UTC(y, m, 1)), end: new Date(Date.UTC(y, m + 1, 1)) };
}

const secondsUntil = (date) => Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));

async function consumeWindows(user, feature, limits) {
    const consumed = [];
    try {
        await prisma.$transaction(async (tx) => {
            for (const { window, limit } of limits) {
                const { start, end } = windowBounds(window);
                // Increments only while below the limit; no row back means the limit is reached
                const rows = await tx.$queryRaw(Prisma.sql`
                    INSERT INTO usage_counters (user_id, feature, "window", window_start, count)
                    VALUES (${user.id}, ${feature}::"Feature", ${window}::"Window", ${start}, 1)
                    ON CONFLICT (user_id, feature, "window", window_start)
                    DO UPDATE SET count = usage_counters.count + 1
                    WHERE usage_counters.count < ${limit}
                    RETURNING count`);
                if (rows.length === 0 || limit < 1) {
                    throw new QuotaExceeded({ window, limit, resetsAt: end, retryAfterSeconds: secondsUntil(end) });
                }
                consumed.push({ window, start });
            }
        });
    } catch (e) {
        if (e instanceof QuotaExceeded) return { allowed: false, ...e.info };
        throw e;
    }

    const refund = () =>
        Promise.all(
            consumed.map(({ window, start }) =>
                prisma.$executeRaw`
                    UPDATE usage_counters SET count = GREATEST(count - 1, 0)
                    WHERE user_id = ${user.id} AND feature = ${feature}::"Feature"
                      AND "window" = ${window}::"Window" AND window_start = ${start}`,
            ),
        );
    return { allowed: true, refund };
}

async function consumeBucket(user, feature, { capacity, refillPerSec }) {
    // Refills by elapsed time, then takes one token if at least one is available
    const rows = await prisma.$queryRaw(Prisma.sql`
        INSERT INTO rate_buckets (user_id, feature, tokens, updated_at)
        VALUES (${user.id}, ${feature}::"Feature", ${capacity}::float8 - 1, now())
        ON CONFLICT (user_id, feature) DO UPDATE SET
            tokens = LEAST(${capacity}::float8, rate_buckets.tokens
                     + EXTRACT(EPOCH FROM (now() - rate_buckets.updated_at)) * ${refillPerSec}::float8) - 1,
            updated_at = now()
        WHERE LEAST(${capacity}::float8, rate_buckets.tokens
                     + EXTRACT(EPOCH FROM (now() - rate_buckets.updated_at)) * ${refillPerSec}::float8) >= 1
        RETURNING tokens`);

    if (rows.length === 0) {
        const retryAfterSeconds = Math.max(1, Math.ceil(1 / refillPerSec));
        return { allowed: false, window: 'burst', limit: capacity, retryAfterSeconds };
    }

    const refund = () => prisma.$executeRaw`
        UPDATE rate_buckets SET tokens = LEAST(${capacity}::float8, tokens + 1)
        WHERE user_id = ${user.id} AND feature = ${feature}::"Feature"`;
    return { allowed: true, refund };
}

// Takes one unit of the feature for this user according to their tier
async function consume(user, feature) {
    const bucket = await prisma.bucketConfig.findUnique({
        where: { tier_feature: { tier: user.tier, feature } },
    });
    if (bucket) return consumeBucket(user, feature, bucket);

    const limits = await prisma.planLimit.findMany({ where: { tier: user.tier, feature } });
    // No configuration for this tier and feature means the feature is not available
    if (limits.length === 0) return { allowed: false, notAvailable: true };
    return consumeWindows(user, feature, limits);
}

// Current status for the client; does not consume anything
async function getStatus(user, feature) {
    const bucket = await prisma.bucketConfig.findUnique({
        where: { tier_feature: { tier: user.tier, feature } },
    });
    if (bucket) {
        const row = await prisma.rateBucket.findUnique({
            where: { userId_feature: { userId: user.id, feature } },
        });
        const elapsed = row ? (Date.now() - row.updatedAt.getTime()) / 1000 : 0;
        const tokens = row
            ? Math.min(bucket.capacity, row.tokens + elapsed * bucket.refillPerSec)
            : bucket.capacity;
        return { type: 'bucket', capacity: bucket.capacity, tokens: Math.floor(tokens) };
    }

    const limits = await prisma.planLimit.findMany({ where: { tier: user.tier, feature } });
    if (limits.length === 0) return { type: 'unavailable' };

    const windows = await Promise.all(
        limits.map(async ({ window, limit }) => {
            const { start, end } = windowBounds(window);
            const row = await prisma.usageCounter.findUnique({
                where: { userId_feature_window_windowStart: { userId: user.id, feature, window, windowStart: start } },
            });
            const used = row?.count ?? 0;
            return { window, limit, used, remaining: Math.max(0, limit - used), resetsAt: end };
        }),
    );
    return { type: 'window', windows };
}

module.exports = { consume, getStatus, windowBounds };
