const express       = require('express');
const bodyParser    = require('body-parser');

const { createOnboardingAgent, FlowNotFoundError } = require('./src/services/onboarding-agent');

const PORT = process.env.PORT || 3000;
const app = express();
const agent = createOnboardingAgent();

const mapLegacyPayload = (payload = {}) => {
    const credentials = payload.credentials || {
        username: payload.username,
        password: payload.password,
    };

    const parameters = payload.parameters || {
        authorizationUrl: payload.authorizationURL || payload.authorizationUrl,
        tokenUrl: payload.tokenURL || payload.tokenUrl,
    };

    const options = payload.options || {};

    return {
        credentials,
        parameters,
        options,
    };
};

const runAgentFlow = async (flowId, payload, res) => {
    try {
        const result = await agent.runFlow(flowId, payload);
        res.json({ success: true, data: result });
    } catch (error) {
        const status = error.statusCode || 400;

        res.status(status).json({
            success: false,
            message: error.message,
            flowId,
            ...(error.flowId ? { flowId: error.flowId } : {}),
        });
    }
};

app.use(bodyParser.json({ limit: '2mb' }));

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', flows: agent.listFlows().length });
});

app.get('/flows', (_req, res) => {
    res.json({ success: true, data: agent.listFlows() });
});

app.get('/flows/:flowId', (req, res) => {
    const { flowId } = req.params;
    try {
        const metadata = agent.getFlowMetadata(flowId);
        res.json({ success: true, data: metadata });
    } catch (error) {
        const status = error instanceof FlowNotFoundError ? 404 : 400;
        res.status(status).json({ success: false, message: error.message });
    }
});

app.post('/flows/:flowId/run', (req, res) => {
    const { flowId } = req.params;
    runAgentFlow(flowId, req.body || {}, res);
});

app.post('/oauth', (req, res) => {
    const flowId = req.body.flowId || 'facebook-oauth-demo';
    const payload = mapLegacyPayload(req.body);
    runAgentFlow(flowId, payload, res);
});

app.get('/fbdemo', (req, res) => {
    const flowId = 'facebook-oauth-demo';
    const username = process.env.FB_OAUTH_USERNAME;
    const password = process.env.FB_OAUTH_PASSWORD;
    const authorizationUrl = process.env.FB_OAUTH_AUTHORIZATION_URL;
    const tokenUrl = process.env.FB_OAUTH_TOKEN_URL;

    if (!username || !password || !authorizationUrl || !tokenUrl) {
        return res.status(400).json({
            success: false,
            message: 'Missing demo environment variables (FB_OAUTH_USERNAME, FB_OAUTH_PASSWORD, FB_OAUTH_AUTHORIZATION_URL, FB_OAUTH_TOKEN_URL).',
        });
    }

    const payload = {
        credentials: { username, password },
        parameters: { authorizationUrl, tokenUrl },
    };

    return runAgentFlow(flowId, payload, res);
});

app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log('===> Server listening on', PORT);
});
