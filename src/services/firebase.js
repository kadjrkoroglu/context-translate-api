const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Service account JSON (single line) comes from FIREBASE_SERVICE_ACCOUNT
let app = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    app = initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
} else {
    console.warn('FIREBASE_SERVICE_ACCOUNT not set: authenticated routes will reject all requests');
}

const verifyIdToken = (token) => getAuth(app).verifyIdToken(token);
const isConfigured = () => app !== null;

module.exports = { verifyIdToken, isConfigured };
