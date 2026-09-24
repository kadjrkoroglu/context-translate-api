const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// Broad per-IP limit against abuse
const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests' },
});

// Per-user (fallback: IP) translation limit
const translateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.uid || ipKeyGenerator(req.ip),
    message: { error: 'Too many translation requests, slow down' },
});

module.exports = { globalLimiter, translateLimiter };
