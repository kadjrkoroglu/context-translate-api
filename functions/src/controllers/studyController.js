const prisma = require('../services/prisma');
const { sendAiFailure } = require('../services/aiErrors');
const { writeSentences, isAnswer } = require('../services/studyTutor');

const MIN_SESSION_CARDS = 10;
const MAX_SESSION_CARDS = 30;
const MAX_ID_LENGTH = 100;
const MAX_DECK_NAME_LENGTH = 100;
const MAX_CARD_TEXT_LENGTH = 200;
const MAX_ANSWER_LENGTH = 300;
// A word shows its answer and moves on after this many misses.
const MAX_ATTEMPTS = 2;
const DEFAULT_COOLDOWN_SECONDS = 10800;

const isText = (value, max) => typeof value === 'string' && value.trim() !== '' && value.length <= max;

function sessionView(session) {
    const finished = session.completedAt != null;
    return {
        id: session.id,
        deckId: session.deckId,
        deckName: session.deckName,
        items: session.items.map(({ id, word, translation, sentence, done, misses }) => ({
            id,
            word,
            translation,
            sentence: sentence ?? null,
            done,
            misses,
        })),
        current: finished ? null : session.queue[0],
        completed: finished,
    };
}

async function loadState(userId, entitlements) {
    const [active, last] = await Promise.all([
        prisma.studySession.findFirst({ where: { userId, completedAt: null } }),
        prisma.studySession.findFirst({ where: { userId, completedAt: { not: null } }, orderBy: { completedAt: 'desc' } }),
    ]);
    const cooldownSeconds = entitlements?.chatCooldownSeconds ?? DEFAULT_COOLDOWN_SECONDS;
    const availableAt = last ? new Date(last.completedAt.getTime() + cooldownSeconds * 1000) : null;
    return {
        cooldownSeconds,
        nextAvailableAt: availableAt && availableAt > new Date() ? availableAt.toISOString() : null,
        lastDeckId: last?.deckId ?? null,
        session: active ? sessionView(active) : null,
    };
}

function sendCooldown(res, state) {
    const retryAfterSeconds = Math.max(1, Math.ceil((new Date(state.nextAvailableAt).getTime() - Date.now()) / 1000));
    res.set('Retry-After', String(retryAfterSeconds));
    res.status(429).json({ error: 'cooldown', ...state, retryAfterSeconds });
}

const getState = async (req, res) => {
    const entitlements = await prisma.tierEntitlement.findUnique({ where: { tier: req.dbUser.tier } });
    res.json(await loadState(req.dbUser.id, entitlements));
};

// The app picks the cards; the session keeps its own copy of them.
const startSession = async (req, res) => {
    const { deckId, deckName, cards } = req.body ?? {};
    if (!isText(deckId, MAX_ID_LENGTH) || !isText(deckName, MAX_DECK_NAME_LENGTH)) {
        return res.status(400).json({ error: 'deckId and deckName are required' });
    }
    const validCards =
        Array.isArray(cards) &&
        cards.length >= MIN_SESSION_CARDS &&
        cards.length <= MAX_SESSION_CARDS &&
        cards.every((c) => isText(c?.id, MAX_ID_LENGTH) && isText(c?.word, MAX_CARD_TEXT_LENGTH) && isText(c?.translation, MAX_CARD_TEXT_LENGTH)) &&
        new Set(cards.map((c) => c.id)).size === cards.length;
    if (!validCards) {
        return res.status(400).json({
            error: `cards must be ${MIN_SESSION_CARDS} to ${MAX_SESSION_CARDS} different cards with id, word and translation`,
        });
    }

    const { id: userId, tier } = req.dbUser;
    const entitlements = await prisma.tierEntitlement.findUnique({ where: { tier } });
    if (!entitlements?.chat) return res.status(403).json({ error: 'feature_not_available', tier });

    const state = await loadState(userId, entitlements);
    // An unfinished session comes first, whichever deck it is from.
    if (state.session) return res.json({ ...state, resumed: true });
    if (state.nextAvailableAt) return sendCooldown(res, state);

    const cardsText = cards.map((c) => ({ word: c.word.trim(), translation: c.translation.trim() }));
    let sentences;
    try {
        sentences = await writeSentences(cardsText);
    } catch (e) {
        console.error('Study start error:', e.message);
        return sendAiFailure(res, e);
    }
    // A card without a sentence is asked on its own; none at all means the AI failed.
    if (sentences.every((s) => s === null)) return sendAiFailure(res, null);

    const items = cards.map((c, i) => ({ id: c.id, ...cardsText[i], sentence: sentences[i], done: false, misses: 0 }));
    // The row lock keeps a double tap from opening two sessions.
    const created = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        if (await tx.studySession.findFirst({ where: { userId, completedAt: null } })) return null;
        return tx.studySession.create({
            data: { userId, deckId: deckId.trim(), deckName: deckName.trim(), items, queue: items.map((_, i) => i) },
        });
    });
    res.json({ ...(await loadState(userId, entitlements)), resumed: !created });
};

// Checked here, without the AI: the answer has to be the card's word.
const answer = async (req, res) => {
    const { sessionId, answer: text } = req.body ?? {};
    if (typeof sessionId !== 'string' || !isText(text, MAX_ANSWER_LENGTH)) {
        return res.status(400).json({ error: `sessionId and an answer of at most ${MAX_ANSWER_LENGTH} characters are required` });
    }

    const { id: userId, tier } = req.dbUser;
    const entitlements = await prisma.tierEntitlement.findUnique({ where: { tier } });
    if (!entitlements?.chat) return res.status(403).json({ error: 'feature_not_available', tier });

    const session = await prisma.studySession
        .findFirst({ where: { id: sessionId, userId, completedAt: null } })
        .catch(() => null); // not a valid uuid
    if (!session) return res.status(404).json({ error: 'session_not_found' });

    const { items, queue } = session;
    const attempt = session.attempt + 1;
    const correct = isAnswer(text, items[queue[0]].word);
    const revealed = !correct && attempt >= MAX_ATTEMPTS;
    const nextItems = items.map((item) => ({ ...item }));
    const nextQueue = [...queue];
    if (correct) nextItems[queue[0]].done = true;
    else nextItems[queue[0]].misses += 1;
    if (correct || revealed) nextQueue.shift();
    const nextAttempt = correct || revealed ? 0 : attempt;
    const completedAt = nextQueue.length === 0 ? new Date() : null;

    // Same messageCount required: an answer sent twice at once is applied once.
    const saved = await prisma.studySession.updateMany({
        where: { id: session.id, messageCount: session.messageCount, completedAt: null },
        data: { items: nextItems, queue: nextQueue, attempt: nextAttempt, messageCount: session.messageCount + 1, completedAt },
    });
    if (saved.count === 0) return res.status(409).json({ error: 'conflict' });

    res.json({
        ...(await loadState(userId, entitlements)),
        verdict: correct ? 'correct' : 'wrong',
        revealed,
        session: sessionView({ ...session, items: nextItems, queue: nextQueue, completedAt }),
    });
};

// Ends an unfinished session; it counts like a finished one, so the break applies.
const endSession = async (req, res) => {
    const { sessionId } = req.body ?? {};
    if (!isText(sessionId, MAX_ID_LENGTH)) return res.status(400).json({ error: 'sessionId is required' });

    const { id: userId, tier } = req.dbUser;
    const ended = await prisma.studySession.updateMany({
        where: { id: sessionId, userId, completedAt: null },
        data: { completedAt: new Date() },
    });
    if (ended.count === 0) return res.status(404).json({ error: 'session_not_found' });

    const entitlements = await prisma.tierEntitlement.findUnique({ where: { tier } });
    res.json(await loadState(userId, entitlements));
};

module.exports = { getState, startSession, answer, endSession };
