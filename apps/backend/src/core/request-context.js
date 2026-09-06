/**
 * Request context decorator conforming to docs/15.API-SPECIFICATION.md Section 6.
 * Decorates every Fastify request with standard request context fields:
 * - user: Authenticated user context or null
 * - workspace: Active workspace context or null
 * - session: Active session / device context or null
 */
export function setupRequestContext(app) {
  app.decorateRequest('user', null);
  app.decorateRequest('workspace', null);
  app.decorateRequest('session', null);
}
