require('dotenv').config();
const express = require('express');
const { logger } = require('./middleware/logger');
const { globalLimiter } = require('./middleware/rateLimit');
const translateRoutes = require('./routes/translateRoutes');
const entitlementRoutes = require('./routes/entitlementRoutes');
const liveRoutes = require('./routes/liveRoutes');
const studyRoutes = require('./routes/studyRoutes');
const { initModel } = require('./controllers/translateController');

const app = express();
app.set('trust proxy', 1); // real client IP behind Cloud Run's single front-end proxy hop
// Photo lines and study cards can exceed 10kb (CJK is 3 bytes/char); parsed
// first, so the 10kb parser below skips them.
app.use('/translate/photo', express.json({ limit: '32kb' }));
app.use('/study/start', express.json({ limit: '32kb' }));
app.use(express.json({ limit: '10kb' }));
app.use(logger);
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/translate', translateRoutes);
app.use('/live', liveRoutes);
app.use('/study', studyRoutes);
app.use('/entitlements', entitlementRoutes);

app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

module.exports = { app, initModel };
