'use strict';

// Mock del logger para tests — suprime output y evita dependencias
const noop = () => {};
const loggerInstance = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  initFromEvent: noop,
  setSystemId: noop,
  getCorrelationId: () => 'test-cid',
  child: () => loggerInstance,
};

// Factory que retorna el logger mock
function createLogger() {
  return loggerInstance;
}

// El auth-middleware usa require('logger') sin llamar al factory
// asi que tambien ponemos los metodos directamente en la funcion
createLogger.debug = noop;
createLogger.info = noop;
createLogger.warn = noop;
createLogger.error = noop;
createLogger.initFromEvent = noop;
createLogger.extractCorrelationId = () => 'test-cid';
createLogger.generateCorrelationId = () => 'test-cid';

module.exports = createLogger;
