'use strict';

// Mock minimo de aws-sdk para tests que no necesitan DynamoDB real
module.exports = {
  DynamoDB: {
    DocumentClient: class MockDocumentClient {
      put() { return { promise: () => Promise.resolve({}) }; }
      get() { return { promise: () => Promise.resolve({}) }; }
      query() { return { promise: () => Promise.resolve({ Items: [] }) }; }
      update() { return { promise: () => Promise.resolve({}) }; }
      delete() { return { promise: () => Promise.resolve({}) }; }
    },
  },
};
