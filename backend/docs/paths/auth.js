// docs/paths/auth.js — POST /auth/login, GET /auth/me
const { op, body, json, errors, bearer, publicApi } = require('../lib/helpers');

module.exports = {
  '/auth/login': {
    post: op({
      operationId: 'login',
      tags: ['Auth'],
      summary: 'Log in with email and password',
      description:
        'Exchanges credentials for a JWT. **Login is by email**, not username — usernames are auto-generated from the ' +
        'full name and can collide, so email is the unique identifier.\n\n' +
        '**Rate limited:** failed login attempts are limited to 10 per 15 minutes per IP in production and 100 in development. ' +
        'Successful logins do not count, and `GET /auth/me` does not use the login-specific limiter. Rate-limit responses are JSON.\n\n' +
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
          description: 'No account was found for the email, or the password was incorrect.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                userNotFound: { value: { success: false, message: 'No account found with this email.', code: 'USER_NOT_FOUND' } },
                wrongPassword: { value: { success: false, message: 'Incorrect password.', code: 'WRONG_PASSWORD' } }
              }
            }
          }
        },
        403: {
          description: 'The account exists but is deactivated.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                disabled: { value: { success: false, message: 'This account is deactivated. Please contact the admin.', code: 'ACCOUNT_DISABLED' } }
              }
            }
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
