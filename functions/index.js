const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { setGlobalOptions } = require('firebase-functions/v2');

setGlobalOptions({ region: 'europe-west1', maxInstances: 10 });

const geminiApiKey = defineSecret('GEMINI_API_KEY');
const databaseUrl = defineSecret('DATABASE_URL');
const directUrl = defineSecret('DIRECT_URL');
const revenueCatSecretKey = defineSecret('REVENUECAT_SECRET_KEY');
const revenueCatWebhookAuth = defineSecret('REVENUECAT_WEBHOOK_AUTH');

// The Express app and Prisma client are required lazily, after secrets are
// injected into process.env by the Cloud Functions runtime, and only once
// (cold start), so `initModel` runs a single time per instance.
let appPromise = null;
function getApp() {
    if (!appPromise) {
        const { app, initModel } = require('./src/app');
        appPromise = initModel()
            .catch((e) => console.error('Model init error:', e.message))
            .then(() => app);
    }
    return appPromise;
}

exports.api = onRequest(
    { secrets: [geminiApiKey, databaseUrl, directUrl, revenueCatSecretKey, revenueCatWebhookAuth] },
    async (req, res) => (await getApp())(req, res),
);
