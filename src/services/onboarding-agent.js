const { loadFlows } = require('../config/flow-loader');
const { runFlow } = require('./flow-runner');

class FlowNotFoundError extends Error {
  constructor(flowId) {
    super(`Flow with id "${flowId}" was not found.`);
    this.name = 'FlowNotFoundError';
    this.flowId = flowId;
    this.statusCode = 404;
  }
}

class OnboardingAgent {
  constructor() {
    this.flows = loadFlows();
  }

  reload() {
    this.flows = loadFlows();
    return this.listFlows();
  }

  listFlows() {
    return Object.values(this.flows).map((entry) => entry.metadata);
  }

  getFlow(flowId) {
    const entry = this.flows[flowId];
    if (!entry) {
      throw new FlowNotFoundError(flowId);
    }

    return entry.definition;
  }

  getFlowMetadata(flowId) {
    const entry = this.flows[flowId];
    if (!entry) {
      throw new FlowNotFoundError(flowId);
    }

    return entry.metadata;
  }

  async runFlow(flowId, payload) {
    const definition = this.getFlow(flowId);
    return runFlow(definition, payload);
  }
}

const createOnboardingAgent = () => new OnboardingAgent();

module.exports = {
  createOnboardingAgent,
  FlowNotFoundError,
};
