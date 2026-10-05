const prisma = require('../services/prisma');
const { deleteFirebaseUser } = require('../services/firebase');

// App Store 5.1.1(v): our rows (cascading to usage and sessions), the synced data and the login.
const deleteAccount = async (req, res) => {
    const { uid } = req.user;
    await prisma.user.deleteMany({ where: { firebaseUid: uid } });
    await deleteFirebaseUser(uid);
    res.json({ deleted: true });
};

module.exports = { deleteAccount };
