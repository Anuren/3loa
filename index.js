const { createApp } = require('./src/app');

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log('===> Server listening on', PORT);
});

module.exports = app;
