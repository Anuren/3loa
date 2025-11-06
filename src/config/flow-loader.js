const fs = require('fs');
const path = require('path');

const FLOW_DIR = path.join(__dirname, '..', 'flows');

const readJsonFile = (filePath) => {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
};

const loadFlows = () => {
  if (!fs.existsSync(FLOW_DIR)) {
    return {};
  }

  const entries = fs.readdirSync(FLOW_DIR).filter((fileName) => fileName.endsWith('.json'));

  return entries.reduce((acc, fileName) => {
    const filePath = path.join(FLOW_DIR, fileName);
    try {
      const definition = readJsonFile(filePath);
      if (!definition || !definition.id) {
        return acc;
      }

      const metadata = {
        id: definition.id,
        name: definition.name || definition.id,
        description: definition.description || '',
        version: definition.version || '1.0.0',
        tags: definition.tags || [],
        filePath,
      };

      acc[definition.id] = {
        definition,
        metadata,
      };
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`[flow-loader] Could not load flow from ${fileName}:`, error.message);
    }

    return acc;
  }, {});
};

module.exports = {
  loadFlows,
};
