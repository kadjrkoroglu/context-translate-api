require('dotenv').config();
const express = require('express');
const { logger } = require('./middleware/logger');
const { globalLimiter } = require('./middleware/rateLimit');
const translateRoutes = require('./routes/translateRoutes');
const entitlementRoutes = require('./routes/entitlementRoutes');
const { initModel } = require('./controllers/translateController');

const app = express();
app.set('trust proxy', 1); // real client IP behind Railway's proxy
app.use(express.json({ limit: '10kb' }));
app.use(logger);
app.use(globalLimiter);

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/translate', translateRoutes);
app.use('/entitlements', entitlementRoutes);

app.use((err, req, res, next) => {
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
});

const port = process.env.PORT || 3000;
initModel().finally(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
});
