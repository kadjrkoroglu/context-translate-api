const { consume } = require('../services/quota');

const requireQuota = (feature) => async (req, res, next) => {
    try {
        const result = await consume(req.dbUser, feature);
        if (result.notAvailable) {
            return res.status(403).json({ error: 'feature_not_available', tier: req.dbUser.tier });
        }
        if (!result.allowed) {
            res.set('Retry-After', String(result.retryAfterSeconds));
            return res.status(429).json({
                error: 'quota_exceeded',
                window: result.window,
                limit: result.limit,
                resetsAt: result.resetsAt,
                retryAfterSeconds: result.retryAfterSeconds,
            });
        }
        req.refundQuota = result.refund;
        next();
    } catch (e) {
        next(e);
    }
};

module.exports = { requireQuota };
