const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureUser } = require('../middleware/ensureUser');
const { translateLimiter } = require('../middleware/rateLimit');
const { createSession, endSession } = require('../controllers/liveController');

const router = express.Router();
router.post('/session', requireAuth, ensureUser, translateLimiter, createSession);
router.post('/session/end', requireAuth, ensureUser, endSession);

module.exports = router;
