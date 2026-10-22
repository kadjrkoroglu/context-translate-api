const { syncTier, isWebhookAuthorized, usersOf } = require('../services/revenuecat');

// Any RevenueCat event only says "something changed"; the tier is read back from
// RevenueCat itself, so the order of events and their details don't matter.
const revenueCatWebhook = async (req, res) => {
    if (!isWebhookAuthorized(req.headers.authorization)) return res.status(401).json({ error: 'Unauthorized' });
    const event = req.body?.event;
    try {
        for (const uid of usersOf(event)) await syncTier(uid);
    } catch (e) {
        console.error('RevenueCat webhook error:', event?.type, e.message);
        // RevenueCat retries on errors.
        return res.status(500).json({ error: 'sync_failed' });
    }
    res.json({ ok: true });
};

module.exports = { revenueCatWebhook };
