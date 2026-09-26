const express = require('express');
const prisma = require('../services/prisma');
const { requireAuth } = require('../middleware/auth');
const { ensureUser } = require('../middleware/ensureUser');
const { getStatus } = require('../services/quota');

const router = express.Router();

router.get('/', requireAuth, ensureUser, async (req, res, next) => {
    try {
        const { tier } = req.dbUser;
        const [entitlements, translate] = await Promise.all([
            prisma.tierEntitlement.findUnique({ where: { tier } }),
            getStatus(req.dbUser, 'translate'),
        ]);
        res.json({ tier, entitlements, translate });
    } catch (e) {
        next(e);
    }
});

module.exports = router;
