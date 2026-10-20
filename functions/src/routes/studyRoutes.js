const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { ensureUser } = require('../middleware/ensureUser');
const { translateLimiter } = require('../middleware/rateLimit');
const { getState, startSession, answer, endSession } = require('../controllers/studyController');

const router = express.Router();
router.get('/', requireAuth, ensureUser, getState);
router.post('/start', requireAuth, ensureUser, translateLimiter, startSession);
// Answers are checked without the AI, so only the global limit applies.
router.post('/answer', requireAuth, ensureUser, answer);
router.post('/end', requireAuth, ensureUser, endSession);

module.exports = router;
