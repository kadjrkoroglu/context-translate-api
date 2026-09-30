const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureUser } = require('../middleware/ensureUser');
const { translateLimiter } = require('../middleware/rateLimit');
const { requireQuota } = require('../middleware/quota');
const { translate, translatePhoto } = require('../controllers/translateController');

const router = express.Router();
router.post('/', requireAuth, ensureUser, translateLimiter, requireQuota('translate'), translate);
// Free tier has no 'photo' quota config, so requireQuota answers 403 feature_not_available
router.post('/photo', requireAuth, ensureUser, translateLimiter, requireQuota('photo'), translatePhoto);

module.exports = router;
