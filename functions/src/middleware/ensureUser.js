const prisma = require('../services/prisma');

// Sign-in sends several first requests at once; they race to create the row
// and the losers read the winner's.
async function findOrCreate(firebaseUid) {
    try {
        return await prisma.user.upsert({
            where: { firebaseUid },
            update: {},
            create: { firebaseUid },
        });
    } catch (e) {
        if (e.code !== 'P2002') throw e;
        return prisma.user.findUniqueOrThrow({ where: { firebaseUid } });
    }
}

// Creates the user row on first request and exposes it as req.dbUser
const ensureUser = async (req, res, next) => {
    try {
        req.dbUser = await findOrCreate(req.user.uid);
        next();
    } catch (e) {
        next(e);
    }
};

module.exports = { ensureUser };
