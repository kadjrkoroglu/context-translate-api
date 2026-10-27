const express = require('express');
const prisma = require('../services/prisma');
const { requireAuth } = require('../middleware/auth');
const { ensureUser } = require('../middleware/ensureUser');
const { getStatus } = require('../services/quota');
const { syncTier } = require('../services/revenuecat');

const router = express.Router();

async function entitlementsOf(user) {
    const [entitlements, translate, live] = await Promise.all([
        prisma.tierEntitlement.findUnique({ where: { tier: user.tier } }),
        getStatus(user, 'translate'),
        getStatus(user, 'live'),
    ]);
    // A Premium → Standard switch waiting for the period's end, if any.
    const pending = user.pendingPlan ? { plan: user.pendingPlan, at: user.pendingPlanAt } : null;
    return { tier: user.tier, entitlements, translate, live, pendingSwitch: pending };
}

router.get('/', requireAuth, ensureUser, async (req, res, next) => {
    try {
        res.json(await entitlementsOf(req.dbUser));
    } catch (e) {
        next(e);
    }
});

// Right after a purchase or restore, without waiting for the webhook. Guests can't buy.
router.post('/refresh', requireAuth, ensureUser, async (req, res, next) => {
    try {
        const user = req.user.anonymous ? null : await syncTier(req.user.uid);
        res.json(await entitlementsOf(user ?? req.dbUser));
    } catch (e) {
        next(e);
    }
});

module.exports = router;
