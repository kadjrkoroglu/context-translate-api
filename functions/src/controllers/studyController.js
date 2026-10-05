const prisma = require('../services/prisma');
const { sendAiFailure } = require('../services/aiErrors');
const { askTutor, detectLanguages, usesWord, sameWord, showsWord, hideWord, TASK_TYPES } = require('../services/studyTutor');

const SESSION_CARDS = 10;
const MAX_ID_LENGTH = 100;
const MAX_DECK_NAME_LENGTH = 100;
const MAX_CARD_TEXT_LENGTH = 200;
const MAX_ANSWER_LENGTH = 300;
// Plenty for 10 cards in good faith; keeps a session from running forever.
const MAX_SESSION_MESSAGES = 60;
const DEFAULT_COOLDOWN_SECONDS = 10800;
const ANSWER_VERDICTS = ['correct', 'wrong', 'question', 'off_topic'];

const isText = (value, max) => typeof value === 'string' && value.trim() !== '' && value.length <= max;
const cardOf = ({ word, translation }) => ({ word, translation });

function sessionView(session) {
    const finished = session.completedAt != null;
    return {
        id: session.id,
        deckId: session.deckId,
        deckName: session.deckName,
        items: session.items.map(({ id, word, translation, done, misses }) => ({ id, word, translation, done, misses })),
        current: finished ? null : session.queue[0],
        task: finished ? null : session.task,
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

// Small models sometimes skip a field or get cut off; one more try usually fixes it.
async function askConsistent(input, isValid) {
    for (let i = 0; i < 2; i++) {
        let reply;
        try {
            reply = await askTutor(input);
        } catch (e) {
            if (!(e instanceof SyntaxError)) throw e;
            continue;
        }
        if (isValid(reply)) return reply;
        console.warn('Study reply rejected:', JSON.stringify(reply).slice(0, 300));
    }
    return null;
}

function isConsistentAnswer(reply, input, cardsLeft) {
    if (!ANSWER_VERDICTS.includes(reply.verdict)) return false;
    const needsTask = (reply.verdict === 'correct' && cardsLeft > 1) || (reply.verdict === 'wrong' && input.attempt === 2);
    if (needsTask && (!reply.nextTask || !sameWord(reply.nextTaskFor, input.next.word))) return false;
    return !((reply.verdict === 'wrong' || reply.verdict === 'question') && !reply.feedback);
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
        cards.length === SESSION_CARDS &&
        cards.every((c) => isText(c?.id, MAX_ID_LENGTH) && isText(c?.word, MAX_CARD_TEXT_LENGTH) && isText(c?.translation, MAX_CARD_TEXT_LENGTH)) &&
        new Set(cards.map((c) => c.id)).size === SESSION_CARDS;
    if (!validCards) {
        return res.status(400).json({ error: `cards must be ${SESSION_CARDS} different cards with id, word and translation` });
    }

    const { id: userId, tier } = req.dbUser;
    const entitlements = await prisma.tierEntitlement.findUnique({ where: { tier } });
    if (!entitlements?.chat) return res.status(403).json({ error: 'feature_not_available', tier });

    const state = await loadState(userId, entitlements);
    // An unfinished session comes first, whichever deck it is from.
    if (state.session) return res.json(state);
    if (state.nextAvailableAt) return sendCooldown(res, state);

    const items = cards.map((c) => ({ id: c.id, word: c.word.trim(), translation: c.translation.trim(), done: false, misses: 0 }));
    let languages;
    let opening;
    try {
        languages = await detectLanguages(items);
        const input = {
            mode: 'start',
            ...languages,
            deck: deckName.trim(),
            cards: items.length,
            next: cardOf(items[0]),
            nextType: TASK_TYPES[0],
        };
        opening = await askConsistent(input, (r) => r.nextTask !== '' && sameWord(r.nextTaskFor, items[0].word));
    } catch (e) {
        console.error('Study start error:', e.message);
        return sendAiFailure(res, e);
    }
    if (!opening) return sendAiFailure(res, null);

    // The row lock keeps a double tap from opening two sessions.
    const created = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        if (await tx.studySession.findFirst({ where: { userId, completedAt: null } })) return null;
        return tx.studySession.create({
            data: {
                userId,
                deckId: deckId.trim(),
                deckName: deckName.trim(),
                ...languages,
                items,
                queue: items.map((_, i) => i),
                task: opening.nextTask,
                taskCount: 1,
            },
        });
    });
    res.json({ ...(await loadState(userId, entitlements)), greeting: created ? opening.feedback : null });
};

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
    const current = items[queue[0]];
    const attempt = session.attempt + 1;
    const input = {
        mode: 'answer',
        nativeLanguage: session.nativeLanguage,
        studiedLanguage: session.studiedLanguage,
        current: cardOf(current),
        task: session.task,
        attempt,
        answer: text.trim(),
        // A card missed twice goes to the back, so the last card can come again.
        next: cardOf(items[queue[1] ?? queue[0]]),
        nextType: TASK_TYPES[session.taskCount % TASK_TYPES.length],
    };

    let reply;
    try {
        reply = await askConsistent(input, (r) => isConsistentAnswer(r, input, queue.length));
    } catch (e) {
        console.error('Study answer error:', e.message);
        return sendAiFailure(res, e);
    }
    if (!reply) return sendAiFailure(res, null);

    // The tutor can be talked into "correct"; the word has to be in the answer.
    const verdict = reply.verdict === 'correct' && !usesWord(input.answer, reply.usedForm, current.word) ? 'rejected' : reply.verdict;
    const revealed = verdict === 'wrong' && attempt === 2;
    const nextItems = items.map((item) => ({ ...item }));
    const nextQueue = [...queue];
    let nextAttempt = session.attempt;
    let { task, taskCount } = session;
    if (verdict === 'correct') {
        nextItems[queue[0]].done = true;
        nextQueue.shift();
        nextAttempt = 0;
        if (nextQueue.length > 0) {
            task = reply.nextTask;
            taskCount += 1;
        }
    } else if (verdict === 'wrong') {
        nextItems[queue[0]].misses += 1;
        nextAttempt = revealed ? 0 : 1;
        if (revealed) {
            nextQueue.push(nextQueue.shift());
            task = reply.nextTask;
            taskCount += 1;
        }
    }

    let feedback = verdict === 'off_topic' || verdict === 'rejected' ? null : reply.feedback;
    // A hint must not give away a word the exercise hides.
    if (feedback && (verdict === 'question' || (verdict === 'wrong' && !revealed)) && !showsWord(session.task, current.word)) {
        feedback = hideWord(feedback, current.word);
    }

    const messageCount = session.messageCount + 1;
    const finished = nextQueue.length === 0;
    const limitReached = !finished && messageCount >= MAX_SESSION_MESSAGES;
    const completedAt = finished || limitReached ? new Date() : null;
    // Same messageCount required: an answer sent twice at once is applied once.
    const saved = await prisma.studySession.updateMany({
        where: { id: session.id, messageCount: session.messageCount, completedAt: null },
        data: { items: nextItems, queue: nextQueue, attempt: nextAttempt, task, taskCount, messageCount, completedAt },
    });
    if (saved.count === 0) return res.status(409).json({ error: 'conflict' });

    res.json({
        ...(await loadState(userId, entitlements)),
        verdict,
        feedback,
        revealed,
        limitReached,
        session: sessionView({ ...session, items: nextItems, queue: nextQueue, task, completedAt }),
    });
};

module.exports = { getState, startSession, answer };
