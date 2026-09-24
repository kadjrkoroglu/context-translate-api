const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { translateLimiter } = require('../middleware/rateLimit');
const { translate } = require('../controllers/translateController');

const router = express.Router();
router.post('/', requireAuth, translateLimiter, translate);

module.exports = router;
