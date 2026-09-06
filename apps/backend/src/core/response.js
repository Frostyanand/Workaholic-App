/**
 * Standard API response envelope helpers conforming to docs/15.API-SPECIFICATION.md
 */

export function sendSuccess(reply, data, statusCode = 200, pagination = undefined) {
  const body = { data };
  if (pagination !== undefined) {
    body.pagination = pagination;
  }
  return reply.status(statusCode).send(body);
}
