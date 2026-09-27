const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

// Deployed on Cloud Functions (same GCP project as Auth): no explicit
// credential needed, verifyIdToken only needs Google's public certs.
// Local dev: a service account JSON (single line) via FIREBASE_SERVICE_ACCOUNT.
let app = null;
try {
    app = process.env.FIREBASE_SERVICE_ACCOUNT
        ? initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) })
        : initializeApp({ credential: applicationDefault() });
} catch (e) {
    console.warn('Firebase Admin init failed: authenticated routes will reject all requests', e.message);
}

const verifyIdToken = (token) => getAuth(app).verifyIdToken(token);
const isConfigured = () => app !== null;

module.exports = { verifyIdToken, isConfigured };
