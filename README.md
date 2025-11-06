# Onboarding Automation Agent

A configurable automation helper for orchestrating multi-step onboarding flows such as OAuth consent, application setup, and other browser-based tasks. The agent exposes an HTTP API, runs flows defined as JSON, and ships with a Facebook-style OAuth demo flow that shows how to capture an authorization code and exchange it for tokens.

## Key Capabilities

- Config-driven flows stored under `src/flows`, reusable across environments.
- Puppeteer-powered navigation with support for `goto`, `waitForSelector`, `type`, `click`, and `delay` steps.
- Automatic extraction of authorization codes and optional token exchange.
- REST endpoints to list flows, fetch metadata, execute runs, and backward-compatible legacy routes.
- Environment override support (headless mode, executable path, credentials, URLs).

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set any required environment variables (see below).
3. Start the agent:
   ```bash
   npm start
   ```

The service listens on `PORT` (defaults to `3000`).

## Configuration

Flows are stored as JSON files inside `src/flows`. Each definition includes:

- `id` (string, required): unique identifier.
- `name`, `description`, `version`, `tags` (optional metadata).
- `defaults`: shared values/parameters such as selectors or viewport.
- `steps`: ordered list of actions. Supported `action` values:
  - `goto`: navigate to a URL (supports `waitUntil`).
  - `waitForSelector`: wait for an element to appear/disappear.
  - `type`: focus and type a value (supports `clear` and `delay`).
  - `click`: click an element, optionally wait for navigation.
  - `delay`: wait for a specific amount of time.
- `result`: post-flow processing. The included demo uses `type: "authorization_code"` to parse the redirect `code` parameter and exchange it for tokens using `tokenRequest`.

Placeholders such as `{{username}}` are resolved from the execution payload. Defaults, `parameters`, and `credentials` are merged into the placeholder context.

### Demo Flow

- File: `src/flows/facebook-oauth-demo.json`
- Purpose: Automates a Facebook-style consent dialog and token exchange.
- Required placeholders: `username`, `password`, `authorizationUrl`, `tokenUrl`.

## HTTP API

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Returns service status and flow count. |
| GET | `/flows` | Lists available flow metadata. |
| GET | `/flows/:flowId` | Returns metadata for a specific flow. |
| POST | `/flows/:flowId/run` | Executes a flow. Body accepts `{ credentials, parameters, options }`. |
| POST | `/oauth` | Legacy endpoint; defaults to `facebook-oauth-demo`. Accepts either a `flowId` or flat payload fields (`username`, `password`, `authorizationUrl`, `tokenUrl`). |
| GET | `/fbdemo` | Runs the demo flow using environment credentials (see below). |

### Example Request

```bash
curl -X POST http://localhost:3000/flows/facebook-oauth-demo/run \
  -H "Content-Type: application/json" \
  -d '{
    "credentials": {
      "username": "user@example.com",
      "password": "s3cret"
    },
    "parameters": {
      "authorizationUrl": "https://www.facebook.com/v3.3/dialog/oauth?...",
      "tokenUrl": "https://graph.facebook.com/v3.3/oauth/access_token"
    }
  }'
```

Response payload contains execution metadata, the extracted authorization code, and any token response.

## Environment Variables

- `PORT`: HTTP port (default `3000`).
- `CHROME_EXECUTABLE_PATH`: Override Chromium/Chrome binary for Puppeteer.
- `FB_OAUTH_USERNAME`, `FB_OAUTH_PASSWORD`, `FB_OAUTH_AUTHORIZATION_URL`, `FB_OAUTH_TOKEN_URL`: Required for `/fbdemo` quick run.

## Extending the Agent

1. Create a new JSON file in `src/flows` describing your onboarding steps.
2. Reference any required runtime data via `{{placeholders}}`.
3. Restart (or call the `/health` endpoint after restart) to load the new flow.
4. Invoke the flow using `POST /flows/:flowId/run` with the necessary credentials and parameters.

## AWS Lambda Deployment

- Bundle the repository (including `node_modules`) and deploy it as a Lambda function. Set the handler to `lambda.handler` and choose the Node.js 18.x (or later) runtime.
- `chrome-aws-lambda` provides the Chromium binary used in Lambda; no extra layer is required. You may override the binary path via `CHROME_EXECUTABLE_PATH` if using a custom layer.
- Expose the function through API Gateway/Lambda Function URLs. The Express routes remain unchanged because `@vendia/serverless-express` adapts API Gateway proxy events to the app.
- Configure the same environment variables used in container mode (`FB_OAUTH_*`, credentials, timeouts). Increase memory (≥1024 MB) and ephemeral storage if your flow downloads assets.
- Test by invoking the function with an API Gateway proxy event body that matches the `POST /flows/:flowId/run` payload.

## Troubleshooting

- Ensure the Chromium executable is available inside your environment. Set `CHROME_EXECUTABLE_PATH` if needed.
- Increase timeouts per flow step by adding `timeout` fields or adjust `options.page` when invoking a flow.
- When running in containers, include `--no-sandbox` Puppeteer flags (already configured by default).
