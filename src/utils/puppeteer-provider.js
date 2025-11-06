let puppeteer;
let chromium;

const isLambda = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

if (isLambda) {
  chromium = require('chrome-aws-lambda');
  puppeteer = require('puppeteer-core');
} else {
  puppeteer = require('puppeteer');
}

const DEFAULT_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
];

const getExecutablePath = async (options = {}) => {
  if (options.executablePath) {
    return options.executablePath;
  }

  if (options.executablePath === null) {
    return undefined;
  }

  if (isLambda) {
    return chromium.executablePath;
  }

  return process.env.CHROME_EXECUTABLE_PATH || 'google-chrome-unstable';
};

const getLaunchArgs = (options = {}) => {
  const baseArgs = isLambda ? chromium.args : DEFAULT_ARGS;

  if (options.args && Array.isArray(options.args) && options.args.length > 0) {
    return [...baseArgs, ...options.args];
  }

  return baseArgs;
};

const getPuppeteer = () => puppeteer;

module.exports = {
  getExecutablePath,
  getLaunchArgs,
  getPuppeteer,
  isLambda,
};
