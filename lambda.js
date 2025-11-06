const serverlessExpress = require('@vendia/serverless-express');

const { createApp } = require('./src/app');

let serverlessHandler;

const getHandler = () => {
  if (!serverlessHandler) {
    const app = createApp();
    serverlessHandler = serverlessExpress({ app });
  }

  return serverlessHandler;
};

exports.handler = async (event, context) => {
  const handler = getHandler();
  return handler(event, context);
};
