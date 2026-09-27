import { pool, withTransaction } from '../../../core/db.js';
import * as extMappingsRepo from '../external-mappings.repository.js';
import * as tasksRepo from '../../tasks/tasks.repository.js';
import * as projectsRepo from '../../projects/projects.repository.js';
import { oauthBoundaryService, GOOGLE_API_SCOPES } from '../../auth/oauth-boundary.service.js';
import * as integrationsRepo from '../../auth/integrations.repository.js';
import { defaultGoogleTasksAdapter } from './google-tasks.adapter.js';
import { toWorkaholicTask, toGoogleTask } from './google-tasks.mapper.js';
import { syncCoordinator } from '../sync-coordinator.js';

/**
 * Google Tasks Synchronization Service
 * Conforms to docs/8.SYNC-SPECIFICATION.md Section 59-60,
 * docs/19.INTEGRATION-SPECIFICATION.md Section 21-24,
 * and REQ-GTASK-001 through REQ-GTASK-005.
 */
export class GoogleTasksSyncService {
  constructor(adapter = defaultGoogleTasksAdapter) {
    this.adapter = adapter;
  }

  /**
   * Helper to retrieve valid decrypted OAuth credentials for Google Tasks
   */
  async _getValidCredentials(userId, client = pool) {
    const integration = await integrationsRepo.findIntegration(userId, 'GOOGLE', client);
    if (!integration || integration.status === 'DISCONNECTED') {
      const err = new Error('Google Tasks is not connected');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    if (integration.status === 'REAUTH_REQUIRED') {
      const err = new Error(
        'Google Tasks authorization expired or revoked; reauthorization required',
      );
      err.code = 'REAUTH_REQUIRED';
      err.statusCode = 401;
      throw err;
    }

    const account = await integrationsRepo.findExternalAccount(integration.id, 'GOOGLE', client);
    if (!account) {
      const err = new Error('No external Google account found for integration');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    // Verify Tasks scope is authorized
    const scopes = account.scopes || [];
    const tasksScope = GOOGLE_API_SCOPES.TASKS[0];
    const hasTasksScope = scopes.includes(tasksScope);

    if (!hasTasksScope) {
      const err = new Error('Google Tasks is not authorized. Please connect Google Tasks.');
      err.code = 'NOT_CONNECTED';
      err.statusCode = 400;
      throw err;
    }

    const credentials = await oauthBoundaryService.getInternalCredentials(userId, client);
    if (!credentials || !credentials.accessToken) {
      const err = new Error('Google integration credentials unavailable; reauthorization required');
      err.code = 'REAUTH_REQUIRED';
      err.statusCode = 401;
      throw err;
    }

    return {
      integration,
      account,
      accessToken: credentials.accessToken,
      refreshToken: credentials.refreshToken,
    };
  }

  /**
   * Discovers the user's accessible Google Task Lists and maps them to Workaholic project containers.
   * Conforms to REQ-GTASK-001 and docs/5.user-flows.md Section 37.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} [adapterOverride]
   */
  async discoverTaskLists(userId, workspaceId, adapterOverride = null) {
    const adapter = adapterOverride || this.adapter;
    const { integration, account, accessToken } = await this._getValidCredentials(userId);

    let googleLists;
    try {
      googleLists = await adapter.listTaskLists(accessToken);
    } catch (err) {
      if (err.reauthRequired) {
        await integrationsRepo.updateIntegrationStatus(integration.id, 'REAUTH_REQUIRED');
      }
      throw err;
    }

    const results = [];

    await withTransaction(async txClient => {
      for (const gList of googleLists) {
        // 1. Find existing task list mapping
        let mapping = await extMappingsRepo.findMappingByExternalId(
          'GOOGLE',
          account.externalAccountId,
          'TASK_LIST',
          gList.id,
          txClient,
        );

        let nativeProjectId = null;

        if (mapping) {
          nativeProjectId = mapping.nativeObjectId;
        } else {
          // 2. Map to existing Project or create matching Project representation
          const existingProjects = await projectsRepo.listProjects(workspaceId, {}, txClient);
          const projectList = existingProjects.projects || existingProjects;
          let matchedProject = Array.isArray(projectList)
            ? projectList.find(p => p.name === gList.title && !p.deletedAt)
            : null;

          if (!matchedProject) {
            matchedProject = await projectsRepo.createProject(
              {
                workspaceId,
                name: gList.title || 'My Tasks',
                description: 'Imported from Google Tasks',
                status: 'ACTIVE',
                ownerUserId: userId,
              },
              txClient,
            );
          }
          nativeProjectId = matchedProject.id;

          // 3. Create persistent external object mapping
          mapping = await extMappingsRepo.upsertMapping(
            {
              userId,
              workspaceId,
              provider: 'GOOGLE',
              externalAccountId: account.externalAccountId,
              externalContainerId: gList.id,
              externalObjectType: 'TASK_LIST',
              externalObjectId: gList.id,
              nativeObjectType: 'PROJECT',
              nativeObjectId: nativeProjectId,
              syncState: 'SYNCED',
              externalEtag: gList.etag || null,
              lastExternalModifiedAt: gList.updated ? new Date(gList.updated) : new Date(),
              lastNativeModifiedAt: new Date(),
              lastSyncedAt: new Date(),
              metadata: {
                isDefault: Boolean(gList.isDefault),
                title: gList.title,
              },
            },
            txClient,
          );
        }

        results.push({
          mappingId: mapping.id,
          taskListId: gList.id,
          googleTaskListId: gList.id,
          externalAccountId: account.externalAccountId,
          nativeProjectId,
          title: gList.title,
          isDefault: Boolean(gList.isDefault),
          syncState: mapping.syncState,
          updatedAt: gList.updated,
        });
      }
    });

    return results;
  }

  /**
   * Two-Way Synchronization between Workaholic Tasks and Google Tasks.
   * Conforms to docs/8.SYNC-SPECIFICATION.md Section 59-60, REQ-GTASK-002,
   * REQ-GTASK-003, REQ-GTASK-004, and REQ-GTASK-005.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} [taskListMappingId=null] - Specific task list mapping to sync, or null for all
   * @param {Object} [options={}]
   * @param {boolean} [options.force=false]
   * @param {Object} [adapterOverride=null]
   */
  async syncTasks(
    userId,
    workspaceId,
    taskListMappingId = null,
    options = {},
    adapterOverride = null,
  ) {
    const adapter = adapterOverride || this.adapter;
    const { account, accessToken } = await this._getValidCredentials(userId);

    return syncCoordinator.runWithHardening(
      {
        userId,
        workspaceId,
        service: 'TASKS',
        targetId: taskListMappingId || 'all',
        direction: options.direction || 'BIDIRECTIONAL',
        operationType: options.force ? 'FULL' : 'INCREMENTAL',
      },
      async () => {
        let totalImported = 0;
        let totalExported = 0;
        let totalDeleted = 0;
        let totalConflicts = 0;
        // 1. Identify which task lists to synchronize
        let taskListMappings = [];
        if (taskListMappingId) {
          const userMappings = await extMappingsRepo.findMappingsByUser(
            userId,
            'GOOGLE',
            'PROJECT',
          );
          const target = userMappings.find(m => m.id === taskListMappingId);
          if (target) taskListMappings.push(target);
        } else {
          // Discover or find all mapped task lists
          const discovered = await this.discoverTaskLists(userId, workspaceId, adapter);
          const userMappings = await extMappingsRepo.findMappingsByUser(
            userId,
            'GOOGLE',
            'PROJECT',
          );
          taskListMappings = userMappings.filter(m => discovered.some(d => d.mappingId === m.id));
          if (taskListMappings.length === 0 && discovered.length > 0) {
            // Re-fetch mappings
            taskListMappings = await extMappingsRepo.findMappingsByUser(
              userId,
              'GOOGLE',
              'PROJECT',
            );
          }
        }

        // 2. Process each mapped task list
        for (const listMapping of taskListMappings) {
          const gTaskListId = listMapping.externalObjectId;
          const nativeProjectId = listMapping.nativeObjectId;

          // Fetch external tasks with pagination
          let allGoogleTasks = [];
          let pageToken = undefined;
          do {
            const listRes = await adapter.listTasks(accessToken, gTaskListId, {
              showCompleted: true,
              showHidden: true,
              showDeleted: true,
              pageToken,
            });
            if (listRes?.items) {
              allGoogleTasks.push(...listRes.items);
            }
            pageToken = listRes?.nextPageToken;
          } while (pageToken);

          // Sort: parent tasks first, then subtasks
          allGoogleTasks.sort((a, b) => {
            if (a.parent && !b.parent) return 1;
            if (!a.parent && b.parent) return -1;
            return 0;
          });

          // INBOUND SYNC: Google -> Workaholic
          for (const gTask of allGoogleTasks) {
            await withTransaction(async txClient => {
              const existingMapping = await extMappingsRepo.findMappingByExternalId(
                'GOOGLE',
                account.externalAccountId,
                'TASK',
                gTask.id,
                txClient,
              );

              // Handle externally deleted / cancelled task
              if (gTask.deleted) {
                if (existingMapping) {
                  // Update native task to CANCELLED (preserve for audit without hard delete)
                  await tasksRepo.updateTask(
                    existingMapping.nativeObjectId,
                    workspaceId,
                    { status: 'CANCELLED' },
                    null,
                    txClient,
                  );
                  await extMappingsRepo.updateMapping(
                    existingMapping.id,
                    {
                      syncState: 'DELETED_EXTERNALLY',
                      lastExternalModifiedAt: new Date(),
                      lastSyncedAt: new Date(),
                    },
                    txClient,
                  );
                  totalDeleted++;
                }
                return;
              }

              // Resolve parentTaskId if subtask
              let parentTaskId = null;
              if (gTask.parent) {
                const parentMapping = await extMappingsRepo.findMappingByExternalId(
                  'GOOGLE',
                  account.externalAccountId,
                  'TASK',
                  gTask.parent,
                  txClient,
                );
                if (parentMapping) {
                  parentTaskId = parentMapping.nativeObjectId;
                }
              }

              if (!existingMapping) {
                // Create native task
                const taskPayload = toWorkaholicTask(gTask, {
                  workspaceId,
                  projectId: nativeProjectId,
                  userId,
                  parentTaskId,
                });

                const createdTask = await tasksRepo.createTask(taskPayload, txClient);

                const now = new Date();
                await extMappingsRepo.upsertMapping(
                  {
                    userId,
                    workspaceId,
                    provider: 'GOOGLE',
                    externalAccountId: account.externalAccountId,
                    externalContainerId: gTaskListId,
                    externalObjectType: 'TASK',
                    externalObjectId: gTask.id,
                    nativeObjectType: 'TASK',
                    nativeObjectId: createdTask.id,
                    syncState: 'SYNCED',
                    externalEtag: gTask.etag || null,
                    lastExternalModifiedAt: gTask.updated ? new Date(gTask.updated) : now,
                    lastNativeModifiedAt: createdTask.updatedAt || now,
                    lastSyncedAt: now,
                    metadata: {
                      position: gTask.position || null,
                      externalSelfLink: gTask.selfLink || null,
                    },
                  },
                  txClient,
                );

                totalImported++;
              } else {
                // Existing mapping: Conflict & Update Resolution
                const nativeTask = await tasksRepo.findTaskById(
                  existingMapping.nativeObjectId,
                  workspaceId,
                  { includeDeleted: true },
                  txClient,
                );

                if (!nativeTask || nativeTask.deletedAt) {
                  // Locally deleted task -> delete on Google
                  try {
                    await adapter.deleteTask(accessToken, gTaskListId, gTask.id);
                  } catch {
                    // Ignore if already deleted
                  }
                  await extMappingsRepo.updateMapping(
                    existingMapping.id,
                    {
                      syncState: 'DELETED_EXTERNALLY',
                      lastSyncedAt: new Date(),
                    },
                    txClient,
                  );
                  totalDeleted++;
                  return;
                }

                const nativeModified = nativeTask.updatedAt
                  ? new Date(nativeTask.updatedAt).getTime()
                  : 0;
                const externalModified = gTask.updated ? new Date(gTask.updated).getTime() : 0;
                const lastNativeSync = existingMapping.lastNativeModifiedAt
                  ? new Date(existingMapping.lastNativeModifiedAt).getTime()
                  : 0;
                const lastExtSync = existingMapping.lastExternalModifiedAt
                  ? new Date(existingMapping.lastExternalModifiedAt).getTime()
                  : 0;

                const nativeChanged = lastNativeSync ? nativeModified > lastNativeSync : false;
                const externalChanged =
                  (existingMapping.externalEtag &&
                    gTask.etag &&
                    existingMapping.externalEtag !== gTask.etag) ||
                  (lastExtSync ? externalModified > lastExtSync : true);

                if (nativeChanged && externalChanged) {
                  // Case C Conflict: Both sides changed
                  totalConflicts++;
                  // Deterministic policy: native changes prevail, push to Google
                  const updatePayload = toGoogleTask(nativeTask);
                  await adapter.updateTask(accessToken, gTaskListId, gTask.id, updatePayload);
                  await extMappingsRepo.updateMapping(
                    existingMapping.id,
                    {
                      syncState: 'CONFLICT',
                      lastNativeModifiedAt: nativeTask.updatedAt,
                      lastExternalModifiedAt: new Date(),
                      lastSyncedAt: new Date(),
                    },
                    txClient,
                  );
                  totalExported++;
                } else if (externalChanged) {
                  // External changed: update native
                  const updatePayload = toWorkaholicTask(gTask, {
                    workspaceId,
                    projectId: nativeProjectId,
                    userId,
                    parentTaskId,
                    existingTask: nativeTask,
                  });

                  await tasksRepo.updateTask(
                    nativeTask.id,
                    workspaceId,
                    updatePayload,
                    null,
                    txClient,
                  );

                  await extMappingsRepo.updateMapping(
                    existingMapping.id,
                    {
                      syncState: 'SYNCED',
                      externalEtag: gTask.etag || null,
                      lastExternalModifiedAt: gTask.updated ? new Date(gTask.updated) : new Date(),
                      lastNativeModifiedAt: new Date(),
                      lastSyncedAt: new Date(),
                    },
                    txClient,
                  );
                  totalImported++;
                } else if (nativeChanged) {
                  // Native changed: push to Google
                  const updatePayload = toGoogleTask(nativeTask);
                  await adapter.updateTask(accessToken, gTaskListId, gTask.id, updatePayload);

                  await extMappingsRepo.updateMapping(
                    existingMapping.id,
                    {
                      syncState: 'SYNCED',
                      lastNativeModifiedAt: nativeTask.updatedAt,
                      lastSyncedAt: new Date(),
                    },
                    txClient,
                  );
                  totalExported++;
                }
              }
            });
          }

          // OUTBOUND SYNC: Workaholic -> Google (for unmapped native tasks in project)
          await withTransaction(async txClient => {
            const sql = `
            SELECT id, title, description, status, priority, due_at, completed_at,
                   parent_task_id, project_id, updated_at, source_type
            FROM tasks
            WHERE workspace_id = $1
              AND project_id = $2
              AND deleted_at IS NULL
          `;
            const nativeTasksRes = await txClient.query(sql, [workspaceId, nativeProjectId]);

            for (const rawTask of nativeTasksRes.rows) {
              const nativeTask = tasksRepo.mapTaskRow(rawTask);
              const mapping = await extMappingsRepo.findMappingByNativeId(
                'GOOGLE',
                userId,
                'TASK',
                nativeTask.id,
                txClient,
              );

              if (!mapping && nativeTask.sourceType !== 'GOOGLE') {
                // Export new native task to Google Tasks
                let parentGoogleTaskId = undefined;
                if (nativeTask.parentTaskId) {
                  const parentMap = await extMappingsRepo.findMappingByNativeId(
                    'GOOGLE',
                    userId,
                    'TASK',
                    nativeTask.parentTaskId,
                    txClient,
                  );
                  if (parentMap) {
                    parentGoogleTaskId = parentMap.externalObjectId;
                  }
                }

                const payload = toGoogleTask(nativeTask);
                const createdGTask = await adapter.createTask(
                  accessToken,
                  gTaskListId,
                  payload,
                  parentGoogleTaskId ? { parent: parentGoogleTaskId } : {},
                );

                const now = new Date();
                await extMappingsRepo.upsertMapping(
                  {
                    userId,
                    workspaceId,
                    provider: 'GOOGLE',
                    externalAccountId: account.externalAccountId,
                    externalContainerId: gTaskListId,
                    externalObjectType: 'TASK',
                    externalObjectId: createdGTask.id,
                    nativeObjectType: 'TASK',
                    nativeObjectId: nativeTask.id,
                    syncState: 'SYNCED',
                    externalEtag: createdGTask.etag || null,
                    lastExternalModifiedAt: createdGTask.updated
                      ? new Date(createdGTask.updated)
                      : now,
                    lastNativeModifiedAt: nativeTask.updatedAt || now,
                    lastSyncedAt: now,
                    metadata: {
                      position: createdGTask.position || null,
                    },
                  },
                  txClient,
                );
                totalExported++;
              } else if (
                mapping &&
                mapping.syncState !== 'CONFLICT' &&
                nativeTask.sourceType !== 'GOOGLE'
              ) {
                const lastNativeSync = mapping.lastNativeModifiedAt
                  ? new Date(mapping.lastNativeModifiedAt).getTime()
                  : mapping.lastSyncedAt
                    ? new Date(mapping.lastSyncedAt).getTime()
                    : 0;
                const nativeModified = new Date(nativeTask.updatedAt).getTime();
                if (nativeModified > lastNativeSync) {
                  const payload = toGoogleTask(nativeTask);
                  await adapter.updateTask(
                    accessToken,
                    gTaskListId,
                    mapping.externalObjectId,
                    payload,
                  );
                  await extMappingsRepo.updateMapping(
                    mapping.id,
                    {
                      syncState: 'SYNCED',
                      lastNativeModifiedAt: nativeTask.updatedAt,
                      lastSyncedAt: new Date(),
                    },
                    txClient,
                  );
                  totalExported++;
                }
              }
            }
          });

          // Update list mapping last_synced_at
          await extMappingsRepo.updateMapping(listMapping.id, {
            lastSyncedAt: new Date(),
          });
        }

        return {
          imported: totalImported,
          exported: totalExported,
          deleted: totalDeleted,
          conflicts: totalConflicts,
          examined: totalImported + totalExported + totalDeleted + totalConflicts,
        };
      },
    );
  }

  /**
   * Disconnects Google Tasks integration without destroying native Workaholic tasks.
   * Conforms to REQ-GTASK-005.
   *
   * @param {string} userId
   */
  async disconnect(userId) {
    const integration = await integrationsRepo.findIntegration(userId, 'GOOGLE');
    if (!integration || integration.status === 'DISCONNECTED') {
      return { disconnected: true };
    }

    const account = await integrationsRepo.findExternalAccount(integration.id, 'GOOGLE');
    if (!account) {
      return { disconnected: true };
    }

    // 1. Detach/delete TASK and TASK_LIST mappings for user
    const taskMappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE', 'TASK');
    for (const m of taskMappings) {
      await extMappingsRepo.deleteMapping(m.id);
    }
    const listMappings = await extMappingsRepo.findMappingsByUser(userId, 'GOOGLE', 'PROJECT');
    for (const m of listMappings) {
      await extMappingsRepo.deleteMapping(m.id);
    }

    // 2. Remove TASKS scope from external_accounts
    const remainingScopes = (account.scopes || []).filter(
      s => !GOOGLE_API_SCOPES.TASKS.includes(s),
    );

    if (remainingScopes.length === 0) {
      // If no other scopes (e.g. Calendar) remain, disconnect integration record
      await oauthBoundaryService.disconnectGoogleIntegration(userId);
    } else {
      // Otherwise keep Calendar active and just update scopes
      await integrationsRepo.upsertExternalAccount({
        integrationId: integration.id,
        provider: 'GOOGLE',
        externalAccountId: account.externalAccountId,
        displayName: account.displayName,
        scopes: remainingScopes,
        encryptedCredentials: account.encryptedCredentials,
      });
    }

    return { disconnected: true };
  }
}

export const googleTasksSyncService = new GoogleTasksSyncService();
