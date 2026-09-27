// Local dev server only. The deployed function uses ../index.js (onRequest wrapper).
const { app, initModel } = require('./app');

const port = process.env.PORT || 3000;
initModel().finally(() => {
    app.listen(port, () => console.log(`Server running on port ${port}`));
});
