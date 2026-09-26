// docs/paths/users.js — 7 operations on /users
const { op, body, json, errors, param, schema } = require('../lib/helpers');

const userEnvelope = (dataRef) => ({
  type: 'object',
  properties: { success: { type: 'boolean', example: true }, data: dataRef }
});

module.exports = {
  '/users': {
    get: op({
      operationId: 'listUsers',
      tags: ['Users'],
      summary: 'List users',
      description:
        'Returns users (without passwords), newest first. `count` reflects the number of records returned in this ' +
        'response, so for the filtered non-admin cases `count === data.length`.\n\n' +
        '**Who sees what** — the response is role-dependent, which is unusual for this API and worth stating plainly:\n\n' +
        '| Caller role | Result |\n' +
        '| --- | --- |\n' +
        '| `admin` | Every user matching the optional `role` filter. |\n' +
        '| `staff` | Forced to `role=staff` **and** `isActive=true`. Any other `role` value is ignored. |\n' +
        '| `resident` | Same as `staff` — only active staff members, used to populate "contact staff" pickers. |\n\n' +
        'A resident additionally gets **403** if they explicitly request `?role=` something other than `staff`.',
      params: [param('RoleQuery')],
      responses: {
        200: {
          description: 'Matching users. The set depends on the caller\'s role — see the description.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  count: { type: 'integer', example: 4, description: 'Always equals the length of `data` (this endpoint does not paginate).' },
                  data: { type: 'array', items: schema('User') }
                }
              }
            }
          }
        },
        ...errors({ forbidden: true })
      }
    }),

    post: op({
      operationId: 'createUser',
      tags: ['Users'],
      summary: 'Create a user',
      description:
        'Creates an account. The caller supplies only the identity fields; the server generates the rest:\n\n' +
        '- `username` — derived from the name (`firstname.lastname`), de-duplicated with a numeric suffix.\n' +
        '- `password` — a cryptographically random temporary password.\n' +
        '- `mustChangePassword` — set to `true`.\n\n' +
        '**The temporary password is never included in the response.** Read the returned `message` and deliver the ' +
        'credential to the user through a secure channel. The password itself is only written to the server log, so if ' +
        'it is lost the admin must use `PUT /users/{id}/reset-password` to issue a new one.\n\n' +
        '`specialization` is mandatory for `staff` accounts and forced to `null` otherwise. `exportSection` is forced to ' +
        '`all` for admins and `null` for residents.',
      requestBody: body('CreateUserRequest'),
      responses: {
        201: {
          description:
            'The user was created. **No password is returned** — `data` contains the identity fields only, and the ' +
            '`message` explains how to deliver the temporary password.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: userEnvelope(schema('User')).properties.data,
                  message: {
                    type: 'string',
                    example:
                      'User created. Deliver the temporary password through a secure channel; it must be changed on first login.'
                  }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true, conflict: true })
      }
    })
  },

  '/users/me/profile': {
    put: op({
      operationId: 'updateMyProfile',
      tags: ['Users'],
      summary: 'Update my own profile',
      description:
        'Lets any authenticated user edit their own profile. This is the only way to change your own password, and the ' +
        'only way to clear `mustChangePassword`.\n\n' +
        '- Changing `name` also regenerates `username` (only when the name actually changed, so repeated saves do not ' +
        'inflate the username).\n' +
        '- To change the password, send **both** `currentPassword` and `newPassword`. A missing or wrong ' +
        '`currentPassword` returns 400, as does a `newPassword` shorter than 6 characters.\n' +
        '- Omitting `currentPassword`/`newPassword` leaves the password untouched.\n\n' +
        'Admins should prefer `PUT /users/{id}` for editing *other* people.',
      requestBody: body('UpdateMyProfileRequest', false, {
        description: 'Omit every field to leave the profile unchanged.'
      }),
      responses: {
        200: {
          description: 'The profile was updated.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  data: schema('User'),
                  message: { type: 'string', example: 'Profile updated successfully' }
                }
              }
            }
          }
        },
        ...errors({ validation: true, badRequest: true, forbidden: true, notFound: true })
      }
    })
  },

  '/users/{id}': {
    get: op({
      operationId: 'getUserById',
      tags: ['Users'],
      summary: 'Get a user by ID',
      description: 'Returns a single user without their password.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The user.', content: { 'application/json': { schema: userEnvelope(schema('User')) } } },
        ...errors({ notFound: true, forbidden: true })
      }
    }),

    put: op({
      operationId: 'updateUser',
      tags: ['Users'],
      summary: 'Update a user',
      description:
        'Admin-only partial update of another account. Only the keys present in the body are applied.\n\n' +
        '**Last-admin protection:** the server refuses (400) to deactivate or demote the final active admin, since that ' +
        'would leave the system with no way to manage users. Create a second admin first.\n\n' +
        'Promoting someone to `staff` requires a `specialization`, and demoting away from `staff` clears it. ' +
        '`exportSection` is normalised against the resulting role: admins are forced to `all`, residents to `null`; for ' +
        'staff it is honoured as sent. Omitting `exportSection` still applies that normalisation, so demoting a staff ' +
        'member to resident also revokes their export rights.',
      params: [param('IdPathParam')],
      requestBody: body('UpdateUserRequest'),
      responses: {
        200: { description: 'The updated user.', content: { 'application/json': { schema: userEnvelope(schema('User')) } } },
        ...errors({ validation: true, badRequest: true, forbidden: true, notFound: true })
      }
    }),

    delete: op({
      operationId: 'deactivateUser',
      tags: ['Users'],
      summary: 'Deactivate (soft-delete) a user',
      description:
        '**This is a soft delete.** The account is kept with `isActive=false` so historical references stay meaningful, ' +
        'and the session is invalidated immediately because `protect` rejects inactive users.\n\n' +
        'To avoid dangling references, the server also cascades:\n\n' +
        '- deletes the user\'s `resident_houses` links;\n' +
        '- clears `owner`/`tenant` on any houses they held;\n' +
        '- unsets `submittedBy`, `assignedTo` and `resolvedBy` on their complaints;\n' +
        '- unsets `paidBy`, `submittedBy` and `verifiedBy` on their dues;\n' +
        '- deletes their notifications;\n' +
        '- removes their votes from poll options and clears `createdBy` on their polls;\n' +
        '- clears `createdBy` on their notices.\n\n' +
        '**Guard rails:** you cannot deactivate your own account (400), and you cannot deactivate the last active admin ' +
        '(400). Use `isActive: true` via `PUT /users/{id}` to reactivate someone.',
      params: [param('IdPathParam')],
      responses: {
        200: { description: 'The user was deactivated.', ...json('MessageResponse') },
        ...errors({ badRequest: true, forbidden: true, notFound: true })
      }
    })
  },

  '/users/{id}/reset-password': {
    put: op({
      operationId: 'resetUserPassword',
      tags: ['Users'],
      summary: 'Issue a new temporary password',
      description:
        'Generates a fresh random temporary password, stores its bcrypt hash, and sets `mustChangePassword=true` so the ' +
        'user is forced to change it on next login.\n\n' +
        '**The new password is not returned.** As with account creation, read the `message` and deliver the credential ' +
        'through a secure channel. Only active users can be reset — an inactive or missing account returns 404.\n\n' +
        'There is no self-service "forgot password" flow; this admin operation is the only recovery path.',
      params: [param('IdPathParam')],
      responses: {
        200: {
          description: 'The password was reset. **The new password is not included in the response.**',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  success: { type: 'boolean', example: true },
                  message: {
                    type: 'string',
                    example: 'Password reset. Deliver the new temporary password through a secure channel; it must be changed on first login.'
                  }
                }
              }
            }
          }
        },
        ...errors({ notFound: true, forbidden: true })
      }
    })
  }
};
