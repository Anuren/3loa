const { URL } = require('url');

const { resolveDeep, resolveTemplate } = require('../utils/template');
const { httpRequest } = require('../utils/http');
const {
  getPuppeteer,
  getLaunchArgs,
  getExecutablePath,
  isLambda,
} = require('../utils/puppeteer-provider');

const StepAction = {
  GOTO: 'goto',
  TYPE: 'type',
  CLICK: 'click',
  WAIT_FOR_SELECTOR: 'waitForSelector',
  DELAY: 'delay',
};

const buildRequestOptions = (tokenConfig, context) => {
  const method = (tokenConfig.method || 'GET').toUpperCase();
  const expectJson = tokenConfig.expectJson !== false;
  const timeout = tokenConfig.timeout;

  const baseUrl = resolveTemplate(tokenConfig.url, context);
  const url = new URL(baseUrl);

  if (tokenConfig.query) {
    const resolvedQuery = resolveDeep(tokenConfig.query, context);
    Object.entries(resolvedQuery).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.set(key, value);
      }
    });
  }

  const options = {
    method,
    uri: url.toString(),
    expectJson,
  };

  if (timeout !== undefined) {
    options.timeout = timeout;
  }

  if (tokenConfig.headers) {
    options.headers = resolveDeep(tokenConfig.headers, context);
  }

  if (method === 'POST') {
    if (tokenConfig.form) {
      options.form = resolveDeep(tokenConfig.form, context);
    }

    if (tokenConfig.body) {
      const resolvedBody = resolveDeep(tokenConfig.body, context);
      options.body = JSON.stringify(resolvedBody);
      options.headers = {
        'content-type': 'application/json',
        ...(options.headers || {}),
      };
    }
  }

  return options;
};

const launchBrowser = async (options = {}) => {
  const puppeteer = getPuppeteer();
  const launchOptions = {
    headless: options.headless !== false,
    args: getLaunchArgs(options),
  };

  const executablePath = await getExecutablePath(options);
  if (executablePath) {
    launchOptions.executablePath = executablePath;
  }

  if (options.ignoreHTTPSErrors !== undefined) {
    launchOptions.ignoreHTTPSErrors = options.ignoreHTTPSErrors;
  }

  if (options.defaultViewport !== undefined) {
    launchOptions.defaultViewport = options.defaultViewport;
  }

  if (options.slowMo !== undefined) {
    launchOptions.slowMo = options.slowMo;
  }

  if (isLambda) {
    launchOptions.headless = true;
  }

  return puppeteer.launch(launchOptions);
};

const configurePage = async (page, flowDefinition, options = {}) => {
  const viewport = options.viewport || flowDefinition.defaults?.viewport;
  if (viewport) {
    await page.setViewport(viewport);
  }

  if (options.userAgent) {
    await page.setUserAgent(options.userAgent);
  }

  if (options.defaultTimeout || flowDefinition.defaults?.defaultTimeout) {
    const timeout = options.defaultTimeout || flowDefinition.defaults?.defaultTimeout;
    page.setDefaultTimeout(timeout);
  }

  if (options.defaultNavigationTimeout || flowDefinition.defaults?.defaultNavigationTimeout) {
    const timeout = options.defaultNavigationTimeout || flowDefinition.defaults?.defaultNavigationTimeout;
    page.setDefaultNavigationTimeout(timeout);
  }
};

const runStep = async (page, step, context, flowDefinition) => {
  const waitUntil = step.waitUntil || flowDefinition.defaults?.waitUntil || 'networkidle2';

  switch (step.action) {
    case StepAction.GOTO: {
      const targetUrl = resolveTemplate(step.url, context);
      return page.goto(targetUrl, { waitUntil });
    }
    case StepAction.WAIT_FOR_SELECTOR: {
      const selector = resolveTemplate(step.selector, context);
      return page.waitForSelector(selector, {
        visible: step.visible,
        hidden: step.hidden,
        timeout: step.timeout,
      });
    }
    case StepAction.TYPE: {
      const selector = resolveTemplate(step.selector, context);
      const value = resolveTemplate(step.value, context);

      if (step.clear) {
        await page.$eval(selector, (element) => {
          // eslint-disable-next-line no-param-reassign
          element.value = '';
        });
      }

      await page.focus(selector);
      return page.type(selector, value, { delay: step.delay });
    }
    case StepAction.CLICK: {
      const selector = resolveTemplate(step.selector, context);

      if (step.waitForNavigation) {
        const waitForOptions = {
          waitUntil,
        };

        if (step.navigationTimeout) {
          waitForOptions.timeout = step.navigationTimeout;
        }

        return Promise.all([
          page.waitForNavigation(waitForOptions),
          page.$eval(selector, (element) => element.click()),
        ]);
      }

      return page.$eval(selector, (element) => element.click());
    }
    case StepAction.DELAY: {
      const timeout = step.ms || step.timeout || 1000;
      return page.waitForTimeout(timeout);
    }
    default:
      throw new Error(`Unsupported step action: ${step.action}`);
  }
};

const runFlow = async (flowDefinition, payload = {}) => {
  const { credentials = {}, parameters = {}, options = {} } = payload;

  const context = {
    ...(flowDefinition.defaults || {}),
    ...parameters,
    ...credentials,
  };

  const stepTimeline = [];
  const browser = await launchBrowser(options.browser || {});
  const page = await browser.newPage();

  try {
    await configurePage(page, flowDefinition, options.page || {});

    for (const step of flowDefinition.steps || []) {
      const startedAt = Date.now();
      try {
        await runStep(page, step, context, flowDefinition);
        stepTimeline.push({
          name: step.name || step.action,
          action: step.action,
          status: 'completed',
          durationMs: Date.now() - startedAt,
        });
      } catch (error) {
        stepTimeline.push({
          name: step.name || step.action,
          action: step.action,
          status: 'failed',
          durationMs: Date.now() - startedAt,
          error: error.message,
        });
        throw error;
      }
    }

    const finalUrl = await page.url();
    const result = {
      success: true,
      flowId: flowDefinition.id,
      finalUrl,
      steps: stepTimeline,
    };

    if (flowDefinition.result?.type === 'authorization_code') {
      const urlInstance = new URL(finalUrl);
      const param = flowDefinition.result.param || 'code';
      const authorizationCode = urlInstance.searchParams.get(param);

      if (!authorizationCode) {
        throw new Error(`Authorization code not found in redirect URL using param "${param}"`);
      }

      context.authorizationCode = authorizationCode;
      result.authorizationCode = authorizationCode;

      const tokenConfig = flowDefinition.result.tokenRequest;
      if (tokenConfig && tokenConfig.enabled !== false) {
        const requestOptions = buildRequestOptions(tokenConfig, context);
        const tokenResponse = await httpRequest(requestOptions);
        result.token = tokenResponse;
      }
    }

    return result;
  } finally {
    await browser.close();
  }
};

module.exports = {
  runFlow,
};
