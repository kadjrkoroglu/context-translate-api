const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// req.ip can come back undefined behind some proxy setups (seen on the
// Cloud Functions emulator); fall back to the raw header/socket instead of
// letting every such request collapse into one shared "unknown" bucket.
const resolveKey = (req) => {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket?.remoteAddress;
    return ip ? ipKeyGenerator(ip) : 'unknown';
};

// Broad per-IP limit against abuse
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => resolveKey(req),
    message: { error: 'Too many requests' },
});

// Per-user (fallback: IP) translation limit
const translateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.uid || resolveKey(req),
    message: { error: 'Too many translation requests, slow down' },
});

module.exports = { globalLimiter, translateLimiter };
