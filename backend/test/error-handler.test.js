const errorHandler = require('../middleware/errorHandler');

const createResponse = () => {
  const response = {
    status: jest.fn(() => response),
    json: jest.fn()
  };

  return response;
};

describe('error handler', () => {
  let consoleError;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('returns a generic message for server errors without exposing internals', () => {
    const response = createResponse();
    const error = new Error('Database connection details');
    error.stack = 'private stack trace';

    errorHandler(error, {}, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(500);
    expect(response.json).toHaveBeenCalledWith({ message: 'Server Error' });
  });

  it('preserves client error messages in a message-only payload', () => {
    const response = createResponse();
    const error = new Error('Resource not found');
    error.statusCode = 404;

    errorHandler(error, {}, response, jest.fn());

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.json).toHaveBeenCalledWith({ message: 'Resource not found' });
  });
});
