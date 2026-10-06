const { GoogleGenerativeAIAbortError, GoogleGenerativeAIResponseError } = require('@google/generative-ai');

// Never 403/429 here: the app reads those as plan and quota errors.
function aiFailure(e) {
    if (e instanceof GoogleGenerativeAIResponseError) return { status: 422, error: 'ai_blocked' };
    if (e instanceof GoogleGenerativeAIAbortError) return { status: 504, error: 'ai_timeout' };
    switch (e?.status) {
        case 401:
        case 402:
        case 403:
            return { status: 503, error: 'ai_unavailable' };
        case 429:
        case 503:
            return { status: 503, error: 'ai_busy' };
        case 504:
            return { status: 504, error: 'ai_timeout' };
        default:
            return { status: 502, error: 'ai_failed' };
    }
}

const sendAiFailure = (res, e) => {
    const { status, error } = aiFailure(e);
    // Billing or key trouble hits every user; a log-based alert watches this marker.
    if (error === 'ai_unavailable') console.error(`GEMINI_UNAVAILABLE status=${e?.status} ${String(e?.message).slice(0, 200)}`);
    res.status(status).json({ error });
};

module.exports = { aiFailure, sendAiFailure };
