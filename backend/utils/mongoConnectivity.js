const transientMongoErrorNames = new Set([
  'MongoNetworkError',
  'MongoNetworkTimeoutError',
  'MongoServerSelectionError',
  'MongoNotConnectedError',
  'MongoTopologyClosedError',
  'MongoPoolClearedError'
]);

let pollFinalizationWarningLogged = false;

const isTransientMongoConnectivityError = (error) =>
  Boolean(error && transientMongoErrorNames.has(error.name));

const reportPollFinalizationConnectionError = (error) => {
  if (!isTransientMongoConnectivityError(error)) {
    return false;
  }

  if (!pollFinalizationWarningLogged) {
    console.warn(`Poll finalization paused: MongoDB is temporarily unavailable (${error.name}).`);
    pollFinalizationWarningLogged = true;
  }
  return true;
};

const resetPollFinalizationConnectionWarning = () => {
  pollFinalizationWarningLogged = false;
};

module.exports = {
  isTransientMongoConnectivityError,
  reportPollFinalizationConnectionError,
  resetPollFinalizationConnectionWarning
};
