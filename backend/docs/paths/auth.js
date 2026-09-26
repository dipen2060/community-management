// docs/paths/auth.js — POST /auth/login, GET /auth/me
const { op, body, json, errors, param, bearer, publicApi } = require('../lib/helpers');

module.exports = {
  '/auth/login': {
    post: op({
      operationId: 'login',
      tags: ['Auth'],
      summary: 'Log in with email and password',
      description:
        'Exchanges credentials for a JWT. **Login is by email**, not username — usernames are auto-generated from the ' +
        'full name and can collide, so email is the unique identifier.\n\n' +
        '**Rate limited:** 10 attempts per 15 minutes per IP (a second, coarser limiter also covers the whole `/api/auth` ' +
        'mount). After 10 failures the endpoint answers `429` until the window resets.\n\n' +
        'On success the response includes `mustChangePassword`. When that is `true` the account still uses an admin-generated ' +
        'temporary password, so the frontend should force the user through `PUT /users/me/profile` with `currentPassword` ' +
        'and `newPassword` before allowing normal use.',
      security: publicApi,
      requestBody: body('LoginRequest', true, { description: 'Credentials.' }),
      responses: {
        200: {
          description: 'Authenticated. The `token` is a JWT valid for the `JWT_EXPIRE` window (default 7 days).',
          ...json('LoginResponse')
        },
        400: { $ref: '#/components/responses/ValidationFailedResponse' },
        401: {
          description:
            'Invalid email or password. The message is deliberately identical for unknown-email, wrong-password and ' +
            'deactivated-account cases so the endpoint cannot be used to enumerate accounts.',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          examples: {
            invalid: { value: { success: false, message: 'Invalid email or password' } }
          }
        },
        429: { $ref: '#/components/responses/RateLimitResponse' },
        500: { $ref: '#/components/responses/ServerErrorResponse' }
      }
    })
  },

  '/auth/me': {
    get: op({
      operationId: 'getCurrentUser',
      tags: ['Auth'],
      summary: 'Get the authenticated user profile',
      description:
        'Returns the profile of the user identified by the bearer token. Useful on app start-up to restore a session and ' +
        'to discover the caller\'s role, which determines which endpoints the UI should expose.',
      security: bearer,
      responses: {
        200: {
          description: 'The authenticated user.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { success: { type: 'boolean', example: true }, user: { $ref: '#/components/schemas/UserProfile' } }
              }
            }
          }
        },
        ...errors()
      }
    })
  }
};
