require('dotenv').config();
const express = require('express');
const app = express();

app.use(express.json()); // JSON body okumak için

const { logger } = require('./middleware/logger');
app.use(logger);

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const { translate } = require('./controllers/translateController');
app.post('/translate', translate);

app.listen(3000, () => {
    console.log('Server running on: http://localhost:3000');
});