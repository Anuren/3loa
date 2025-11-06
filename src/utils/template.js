const PLACEHOLDER_PATTERN = /{{\s*([\w.-]+)\s*}}/g;

const resolveTemplate = (value, context = {}) => {
  if (typeof value !== 'string') {
    return value;
  }

  return value.replace(PLACEHOLDER_PATTERN, (_match, key) => {
    if (Object.prototype.hasOwnProperty.call(context, key)) {
      return context[key];
    }

    return _match;
  });
};

const resolveDeep = (input, context = {}) => {
  if (Array.isArray(input)) {
    return input.map((entry) => resolveDeep(entry, context));
  }

  if (input && typeof input === 'object') {
    return Object.entries(input).reduce((acc, [key, value]) => {
      acc[key] = resolveDeep(value, context);
      return acc;
    }, {});
  }

  return resolveTemplate(input, context);
};

module.exports = {
  resolveTemplate,
  resolveDeep,
};
