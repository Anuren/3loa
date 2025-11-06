const request = require('request');

const httpRequest = (options = {}) => new Promise((resolve, reject) => {
  const { expectJson = true, ...requestOptions } = options;

  request(requestOptions, (error, response, body) => {
    if (error) {
      return reject(error);
    }

    if (!expectJson) {
      return resolve({ response, body });
    }

    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      return resolve(parsed);
    } catch (parseError) {
      return reject(parseError);
    }
  });
});

module.exports = {
  httpRequest,
};
