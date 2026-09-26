const prisma = require('../services/prisma');

// Creates the user row on first request and exposes it as req.dbUser
const ensureUser = async (req, res, next) => {
    try {
        req.dbUser = await prisma.user.upsert({
            where: { firebaseUid: req.user.uid },
            update: {},
            create: { firebaseUid: req.user.uid },
        });
        next();
    } catch (e) {
        next(e);
    }
};

module.exports = { ensureUser };
