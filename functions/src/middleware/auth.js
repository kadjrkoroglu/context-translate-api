const { verifyIdToken, isConfigured } = require('../services/firebase');

const requireAuth = async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Missing auth token' });
    if (!isConfigured()) return res.status(503).json({ error: 'Auth not configured' });

    try {
        const decoded = await verifyIdToken(token);
        req.user = { uid: decoded.uid, email: decoded.email };
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid auth token' });
    }
};

module.exports = { requireAuth };
