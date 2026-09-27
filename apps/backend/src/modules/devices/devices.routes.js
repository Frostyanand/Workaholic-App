import { z } from 'zod';
import { sendSuccess } from '../../core/response.js';
import { requireAuth } from '../auth/auth.middleware.js';
import { validateRequest } from '../../core/validation.js';
import { registerPushTokenSchema, idSchema } from '@workaholic/shared';
import { NotFoundError } from '../../core/errors.js';
import * as devicesRepo from './devices.repository.js';

const deviceIdParamsSchema = z.object({
  id: idSchema,
});

const updateDeviceSchema = z.object({
  deviceName: z.string().trim().min(1).max(255).optional(),
  platform: z.enum(['WEB', 'WINDOWS', 'ANDROID']).optional(),
  trustState: z.enum(['TRUSTED', 'UNTRUSTED']).optional(),
});

/**
 * Devices and Push Token Registration routes conforming to docs/15.API-SPECIFICATION.md Section 52
 */
export async function devicesRoutes(fastify, _opts) {
  fastify.addHook('preHandler', requireAuth);

  // 1. List User's Devices: GET /devices
  fastify.get('/', async (request, reply) => {
    const devices = await devicesRepo.findDevicesByUserId(request.user.id);
    return sendSuccess(reply, devices);
  });

  // Handler for device registration
  const handleRegisterDevice = async (request, reply) => {
    const payload = request.validated.body;
    const device = await devicesRepo.registerPushDevice({
      userId: request.user.id,
      platform: payload.platform,
      pushToken: payload.token,
      deviceName: payload.deviceName,
      deviceId: payload.deviceId || request.session?.deviceId,
    });
    return sendSuccess(reply, device, 201);
  };

  // 2. Authoritative Device Registration: POST /devices
  fastify.post(
    '/',
    {
      preValidation: [validateRequest({ body: registerPushTokenSchema })],
    },
    handleRegisterDevice,
  );

  // 2b. Backward-compatible alias: POST /devices/register-push
  fastify.post(
    '/register-push',
    {
      preValidation: [validateRequest({ body: registerPushTokenSchema })],
    },
    handleRegisterDevice,
  );

  // 3. Update Device: PATCH /devices/{id}
  fastify.patch(
    '/:id',
    {
      preValidation: [
        validateRequest({
          params: deviceIdParamsSchema,
          body: updateDeviceSchema,
        }),
      ],
    },
    async (request, reply) => {
      const updated = await devicesRepo.updateDevice(
        request.params.id,
        request.user.id,
        request.validated.body,
      );
      if (!updated) {
        throw new NotFoundError(`Device ${request.params.id} not found`);
      }
      return sendSuccess(reply, updated);
    },
  );

  // 4. Delete Device: DELETE /devices/{id}
  fastify.delete(
    '/:id',
    {
      preValidation: [validateRequest({ params: deviceIdParamsSchema })],
    },
    async (request, reply) => {
      const deleted = await devicesRepo.deleteDevice(request.params.id, request.user.id);
      if (!deleted) {
        throw new NotFoundError(`Device ${request.params.id} not found`);
      }
      return sendSuccess(reply, { deleted: true });
    },
  );
}
