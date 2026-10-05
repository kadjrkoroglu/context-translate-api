const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { deleteAccount } = require('../controllers/accountController');

const router = express.Router();
router.delete('/', requireAuth, deleteAccount);

module.exports = router;
