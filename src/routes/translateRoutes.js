const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureUser } = require('../middleware/ensureUser');
const { translateLimiter } = require('../middleware/rateLimit');
const { translate } = require('../controllers/translateController');

const router = express.Router();
router.post('/', requireAuth, ensureUser, translateLimiter, translate);

module.exports = router;
