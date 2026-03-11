'use strict';

// Mock de @aws-sdk/client-ssm para tests
class MockCommand {
  constructor(input) { this.input = input; }
}

class SSMClient {
  constructor() {}
  async send(cmd) {
    // Simular ParameterNotFound para que el policy-engine use defaults
    const err = new Error('Parameter not found');
    err.name = 'ParameterNotFound';
    throw err;
  }
}

module.exports = {
  SSMClient,
  GetParameterCommand: class GetParameterCommand extends MockCommand {},
};
