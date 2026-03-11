'use strict';

// Mock de @aws-sdk/client-dynamodb para tests
module.exports = {
  DynamoDBClient: class MockDynamoDBClient {
    constructor() {}
    send() { return Promise.resolve({}); }
  },
};
