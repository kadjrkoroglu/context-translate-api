const { initializeApp, applicationDefault, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

// Deployed: default credentials. Local dev: service account JSON in
// FIREBASE_SERVICE_ACCOUNT.
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

// Synced decks, favorites and history live under users/{uid}; then the login goes.
async function deleteFirebaseUser(uid) {
    const firestore = getFirestore(app);
    await firestore.recursiveDelete(firestore.doc(`users/${uid}`));
    await getAuth(app)
        .deleteUser(uid)
        .catch((e) => {
            if (e.code !== 'auth/user-not-found') throw e;
        });
}

module.exports = { verifyIdToken, isConfigured, deleteFirebaseUser };
