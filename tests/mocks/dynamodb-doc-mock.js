'use strict';

// Mock de @aws-sdk/lib-dynamodb para tests
class MockCommand {
  constructor(input) { this.input = input; }
}

module.exports = {
  DynamoDBDocumentClient: {
    from: () => ({
      send: async (cmd) => {
        // Por defecto, simular operaciones exitosas
        if (cmd.constructor.name === 'GetCommand') {
          return { Item: null };
        }
        return {};
      },
    }),
  },
  PutCommand: class PutCommand extends MockCommand {},
  DeleteCommand: class DeleteCommand extends MockCommand {},
  GetCommand: class GetCommand extends MockCommand {},
  QueryCommand: class QueryCommand extends MockCommand {},
};
