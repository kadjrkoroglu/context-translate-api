const prisma = require('../services/prisma');
const { reserveSeconds, refundSeconds, getStatus } = require('../services/quota');
const { sendAiFailure } = require('../services/aiErrors');

const LIVE_MODEL = process.env.GEMINI_LIVE_MODEL || 'models/gemini-3.5-live-translate-preview';
// Gemini closes connections after ~10 minutes.
const MAX_SLICE_SECONDS = 600;
const TOKEN_GRACE_SECONDS = 10;
const BCP47 = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// Locked into the token; the app sends the same setup.
const buildSetup = (targetLanguageCode) => ({
    model: LIVE_MODEL,
    generationConfig: {
        responseModalities: ['AUDIO'],
        translationConfig: { targetLanguageCode, echoTargetLanguage: false },
    },
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    sessionResumption: {},
});

async function mintToken(setup, grantedSeconds) {
    const now = Date.now();
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
        method: 'POST',
        headers: { 'x-goog-api-key': process.env.GEMINI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
            // Extra uses allow reconnecting within the slice.
            uses: 3,
            expireTime: new Date(now + (grantedSeconds + TOKEN_GRACE_SECONDS) * 1000).toISOString(),
            newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
            bidiGenerateContentSetup: setup,
        }),
    });
    if (!response.ok) {
        const error = new Error(`auth_tokens ${response.status}: ${(await response.text()).slice(0, 300)}`);
        error.status = response.status;
        throw error;
    }
    return (await response.json()).name;
}

// Reserves time and returns a short-lived token; the Gemini key stays here.
const createSession = async (req, res) => {
    const { targetLanguageCode } = req.body ?? {};
    if (typeof targetLanguageCode !== 'string' || !BCP47.test(targetLanguageCode)) {
        return res.status(400).json({ error: 'targetLanguageCode is required (BCP-47, e.g. "tr")' });
    }

    const { tier } = req.dbUser;
    const entitlements = await prisma.tierEntitlement.findUnique({ where: { tier } });
    if (!entitlements?.live) return res.status(403).json({ error: 'feature_not_available', tier });

    const reserved = await reserveSeconds(req.dbUser, 'live', MAX_SLICE_SECONDS);
    if (reserved.notAvailable) return res.status(403).json({ error: 'feature_not_available', tier });
    if (!reserved.allowed) {
        res.set('Retry-After', String(reserved.retryAfterSeconds));
        return res.status(429).json({
            error: 'quota_exceeded',
            // Lets the app tell a used-up trial apart from the monthly limit.
            tier,
            window: reserved.window,
            limit: reserved.limit,
            resetsAt: reserved.resetsAt,
            retryAfterSeconds: reserved.retryAfterSeconds,
        });
    }

    // Live has one (monthly) window.
    const { window, start } = reserved.windows[0];
    try {
        const setup = buildSetup(targetLanguageCode);
        const token = await mintToken(setup, reserved.granted);
        const session = await prisma.liveSession.create({
            data: { userId: req.dbUser.id, grantedSeconds: reserved.granted, window, windowStart: start },
        });
        const status = await getStatus(req.dbUser, 'live');
        res.json({
            sessionId: session.id,
            token,
            setup,
            grantedSeconds: reserved.granted,
            remainingSeconds: status.windows?.[0]?.remaining ?? 0,
        });
    } catch (e) {
        console.error('Live session error:', e.message);
        await refundSeconds(req.dbUser.id, 'live', window, start, reserved.granted).catch(() => {});
        sendAiFailure(res, e);
    }
};

// Refunds unused time by the server's clock; unreported sessions are charged in full.
const endSession = async (req, res) => {
    const { sessionId } = req.body ?? {};
    if (typeof sessionId !== 'string') return res.status(400).json({ error: 'sessionId is required' });

    const session = await prisma.liveSession
        .findFirst({ where: { id: sessionId, userId: req.dbUser.id, endedAt: null } })
        .catch(() => null); // not a valid uuid
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Close first to prevent a double refund.
    const closed = await prisma.liveSession.updateMany({
        where: { id: session.id, endedAt: null },
        data: { endedAt: new Date() },
    });
    if (closed.count === 0) return res.status(404).json({ error: 'Session not found' });

    const elapsed = Math.ceil((Date.now() - session.startedAt.getTime()) / 1000);
    const used = Math.min(session.grantedSeconds, Math.max(0, elapsed));
    await refundSeconds(req.dbUser.id, 'live', session.window, session.windowStart, session.grantedSeconds - used);

    const status = await getStatus(req.dbUser, 'live');
    res.json({ usedSeconds: used, remainingSeconds: status.windows?.[0]?.remaining ?? 0 });
};

module.exports = { createSession, endSession };
