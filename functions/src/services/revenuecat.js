const crypto = require('crypto');
const prisma = require('./prisma');

const API_URL = 'https://api.revenuecat.com/v1/subscribers';
// Checked from the top: Premium also unlocks the standard entitlement.
const PLANS = ['premium', 'standard'];

// Grace period (billing issue) still counts as active; no end date means lifetime.
function isActive(entitlement, now) {
    const ends = [entitlement.expires_date, entitlement.grace_period_expires_date].filter(Boolean).map(Date.parse);
    return ends.length === 0 || Math.max(...ends) > now;
}

// RevenueCat's view of a customer, mapped to our tiers.
function tierFromSubscriber(subscriber, now = Date.now()) {
    for (const plan of PLANS) {
        const entitlement = subscriber?.entitlements?.[plan];
        if (!entitlement || !isActive(entitlement, now)) continue;
        const subscription = subscriber.subscriptions?.[entitlement.product_identifier];
        return subscription?.period_type === 'trial' ? `trial_${plan}` : plan;
    }
    return 'free';
}

async function fetchSubscriber(appUserId) {
    const response = await fetch(`${API_URL}/${encodeURIComponent(appUserId)}`, {
        headers: { Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}` },
    });
    if (!response.ok) throw new Error(`RevenueCat subscriber lookup failed: HTTP ${response.status}`);
    return (await response.json()).subscriber;
}

// Product ids name their plan: decklingo_standard_monthly.
const planOf = (productId) => PLANS.find((plan) => productId?.includes(plan)) ?? null;
const CLEARED = { pendingPlan: null, pendingPlanAt: null };

// Apple moves Premium down to Standard when the paid period ends; RevenueCat
// reports it as a PRODUCT_CHANGE when it's asked for. The switch is kept until
// it happens, the subscription ends or the user changes back.
function pendingSwitch(user, tier, subscriber, event, now = Date.now()) {
    const current = tier === 'free' ? null : tier.replace(/^trial_/, '');
    if (event?.type === 'PRODUCT_CHANGE') {
        const next = planOf(event.new_product_id);
        if (!current || !next || next === current) return CLEARED;
        const ends = subscriber?.entitlements?.[current]?.expires_date;
        return { pendingPlan: next, pendingPlanAt: ends ? new Date(ends) : null };
    }
    if (!user.pendingPlan) return {};
    const dropped = ['CANCELLATION', 'EXPIRATION'].includes(event?.type);
    const due = user.pendingPlanAt && user.pendingPlanAt.getTime() <= now;
    return !current || current === user.pendingPlan || dropped || due ? CLEARED : {};
}

// The app logs in to RevenueCat with the Firebase uid, so the two ids match.
// Only users who have used the app are updated; unknown ids are skipped.
async function syncTier(firebaseUid, event) {
    const user = await prisma.user.findUnique({ where: { firebaseUid } });
    if (!user) return null;
    const subscriber = await fetchSubscriber(firebaseUid);
    const tier = tierFromSubscriber(subscriber);
    return prisma.user.update({
        where: { firebaseUid },
        data: { tier, ...pendingSwitch(user, tier, subscriber, event) },
    });
}

// RevenueCat sends the secret we set in its dashboard as the Authorization header.
function isWebhookAuthorized(header) {
    const expected = process.env.REVENUECAT_WEBHOOK_AUTH;
    if (!expected || typeof header !== 'string') return false;
    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Guests have anonymous RevenueCat ids; they can't buy, so there's nothing to sync.
const isAppUserId = (id) => typeof id === 'string' && id !== '' && !id.startsWith('$RCAnonymousID');

// Every account the event touches; a transfer moves a purchase between two of them.
function usersOf(event) {
    // The dashboard's test event carries a made-up customer.
    if (event?.type === 'TEST') return [];
    const ids =
        event?.type === 'TRANSFER'
            ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
            : [event?.app_user_id, event?.original_app_user_id, ...(event?.aliases ?? [])];
    return [...new Set(ids.filter(isAppUserId))];
}

module.exports = { tierFromSubscriber, pendingSwitch, syncTier, isWebhookAuthorized, usersOf };
