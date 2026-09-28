import { NotFoundError, ValidationError } from '../../core/errors.js';
import { withTransaction } from '../../core/db.js';
import * as notesRepo from './notes.repository.js';
import * as tasksRepo from '../tasks/tasks.repository.js';
import * as projectsRepo from '../projects/projects.repository.js';
import * as eventsRepo from '../calendar/events.repository.js';
import * as boardsRepo from '../boards/boards.repository.js';
import * as attachmentsRepo from '../attachments/attachments.repository.js';
import { sanitizeNoteContent } from './note-sanitizer.js';

/**
 * Notes Service: Encapsulates domain logic, content sanitization,
 * relationship validation, and explicit checklist-to-task conversion.
 */
export class NotesService {
  /**
   * Create a new note.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} payload
   */
  async createNote(userId, workspaceId, payload) {
    const { sanitizedContent, plainText } = sanitizeNoteContent(payload.content);

    return notesRepo.createNote({
      workspaceId,
      ownerUserId: userId,
      title: payload.title || 'Untitled Note',
      content: sanitizedContent,
      contentText: payload.contentText || plainText,
      contentFormat: payload.contentFormat || 'STRUCTURED',
      category: payload.category || null,
      isPinned: Boolean(payload.isPinned),
      isFavorite: Boolean(payload.isFavorite),
      isArchived: Boolean(payload.isArchived),
      tags: payload.tags || [],
    });
  }

  /**
   * Get note by ID including tags, relationships, backlinks, and attachments.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   */
  async getNote(userId, workspaceId, noteId) {
    const note = await notesRepo.findNoteById(noteId, workspaceId);
    if (!note) {
      throw new NotFoundError(`Note ${noteId} not found in workspace`);
    }

    // Discover reverse backlinks (other notes referencing this note)
    const backlinks = await notesRepo.findNoteBacklinks(noteId, workspaceId);

    // Retrieve note attachments (conforms to Phase 15 & REQ-NOTE-004)
    let attachments = [];
    try {
      attachments = await attachmentsRepo.findAttachmentsByTarget('NOTE', noteId, workspaceId);
    } catch {
      attachments = [];
    }

    return {
      ...note,
      backlinks,
      attachments,
    };
  }

  /**
   * List notes in a workspace with filters, search, and pagination.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {Object} queryOptions
   */
  async listNotes(userId, workspaceId, queryOptions = {}) {
    return notesRepo.findNotesByWorkspace(workspaceId, queryOptions);
  }

  /**
   * Update an existing note.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   * @param {Object} payload
   */
  async updateNote(userId, workspaceId, noteId, payload) {
    const existing = await notesRepo.findNoteById(noteId, workspaceId);
    if (!existing) {
      throw new NotFoundError(`Note ${noteId} not found in workspace`);
    }

    const updateData = { ...payload };

    if (payload.content !== undefined) {
      const { sanitizedContent, plainText } = sanitizeNoteContent(payload.content);
      updateData.content = sanitizedContent;
      updateData.contentText = payload.contentText || plainText;
    }

    const updated = await notesRepo.updateNote(noteId, workspaceId, updateData);
    if (!updated) {
      throw new NotFoundError(`Note ${noteId} not found`);
    }

    return updated;
  }

  /**
   * Soft-delete a note.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   */
  async deleteNote(userId, workspaceId, noteId) {
    const existing = await notesRepo.findNoteById(noteId, workspaceId);
    if (!existing) {
      throw new NotFoundError(`Note ${noteId} not found in workspace`);
    }

    return notesRepo.deleteNote(noteId, workspaceId);
  }

  /**
   * Restore a soft-deleted note.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   */
  async restoreNote(userId, workspaceId, noteId) {
    const restored = await notesRepo.restoreNote(noteId, workspaceId);
    if (!restored) {
      throw new NotFoundError(`Note ${noteId} not found or not deleted`);
    }
    return restored;
  }

  /**
   * Add an explicit relationship from a Note to another domain object.
   * Verifies workspace boundary and target resource existence.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   * @param {Object} relationshipData
   */
  async addRelationship(userId, workspaceId, noteId, relationshipData) {
    const note = await notesRepo.findNoteById(noteId, workspaceId);
    if (!note) {
      throw new NotFoundError(`Note ${noteId} not found in workspace`);
    }

    const {
      targetType,
      targetId,
      relationshipType = 'RELATES_TO',
      metadata = {},
    } = relationshipData;

    // Validate target existence within same workspace
    switch (targetType) {
      case 'TASK': {
        const task = await tasksRepo.findTaskById(targetId, workspaceId);
        if (!task) {
          throw new ValidationError(`Target Task ${targetId} not found in workspace`);
        }
        break;
      }
      case 'PROJECT': {
        const project = await projectsRepo.findProjectById(targetId, workspaceId);
        if (!project) {
          throw new ValidationError(`Target Project ${targetId} not found in workspace`);
        }
        break;
      }
      case 'EVENT': {
        const event = await eventsRepo.findEventById(targetId, workspaceId);
        if (!event) {
          throw new ValidationError(`Target Event ${targetId} not found in workspace`);
        }
        break;
      }
      case 'BOARD': {
        const board = await boardsRepo.findBoardById(targetId, workspaceId);
        if (!board) {
          throw new ValidationError(`Target Board ${targetId} not found in workspace`);
        }
        break;
      }
      case 'NOTE': {
        const targetNote = await notesRepo.findNoteById(targetId, workspaceId);
        if (!targetNote) {
          throw new ValidationError(`Target Note ${targetId} not found in workspace`);
        }
        break;
      }
      case 'PERSON':
        // Supported person/collaborator reference
        break;
      default:
        throw new ValidationError(`Unsupported target type: ${targetType}`);
    }

    return notesRepo.addNoteRelationship({
      workspaceId,
      noteId,
      targetType,
      targetId,
      relationshipType,
      metadata,
    });
  }

  /**
   * Remove a relationship between a Note and another object.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   * @param {string} relationshipId
   */
  async removeRelationship(userId, workspaceId, noteId, relationshipId) {
    const note = await notesRepo.findNoteById(noteId, workspaceId);
    if (!note) {
      throw new NotFoundError(`Note ${noteId} not found in workspace`);
    }

    const removed = await notesRepo.removeNoteRelationship(noteId, relationshipId, workspaceId);
    if (!removed) {
      throw new NotFoundError(`Relationship ${relationshipId} not found`);
    }
    return removed;
  }

  /**
   * Discover reverse backlinks to this note.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   */
  async getBacklinks(userId, workspaceId, noteId) {
    const note = await notesRepo.findNoteById(noteId, workspaceId);
    if (!note) {
      throw new NotFoundError(`Note ${noteId} not found in workspace`);
    }

    return notesRepo.findNoteBacklinks(noteId, workspaceId);
  }

  /**
   * Converts a checklist item inside a note into an explicit Workaholic Task.
   * Conforms strictly to BR-NOTE-001, BR-NOTE-002, and REQ-NOTE-008.
   *
   * @param {string} userId
   * @param {string} workspaceId
   * @param {string} noteId
   * @param {Object} conversionData
   */
  async convertChecklistItem(userId, workspaceId, noteId, conversionData) {
    const { itemId, title, projectId = null, priority = 'P3', description = '' } = conversionData;

    return withTransaction(async txClient => {
      // 1. Verify Note exists and user has workspace authorization
      const note = await notesRepo.findNoteById(noteId, workspaceId, txClient);
      if (!note) {
        throw new NotFoundError(`Note ${noteId} not found in workspace`);
      }

      // 2. Inspect note content and locate checklist item
      let contentArray = Array.isArray(note.content) ? note.content : [];
      let foundItem = null;
      let alreadyConvertedTaskId = null;

      for (const node of contentArray) {
        if (node.type === 'checklist' && Array.isArray(node.items)) {
          for (const item of node.items) {
            if (item.id === itemId) {
              foundItem = item;
              if (item.convertedTaskId) {
                alreadyConvertedTaskId = item.convertedTaskId;
              }
              break;
            }
          }
        }
        if (foundItem) break;
      }

      // Prevent accidental duplicate conversion if already converted
      if (alreadyConvertedTaskId) {
        const existingTask = await tasksRepo.findTaskById(
          alreadyConvertedTaskId,
          workspaceId,
          { includeDeleted: false },
          txClient,
        );
        if (existingTask) {
          return {
            task: existingTask,
            note,
            alreadyConverted: true,
          };
        }
      }

      // 3. Explicitly create the Workaholic Task
      const taskTitle = title || (foundItem ? foundItem.text : 'New Task from Note');
      const taskDescription =
        description || `Converted from checklist item in Note: "${note.title}"`;

      const createdTask = await tasksRepo.createTask(
        {
          workspaceId,
          projectId: projectId || null,
          title: taskTitle,
          description: taskDescription,
          priority: priority || 'P3',
          status: 'TODO',
          sourceType: 'WORKAHOLIC',
          createdBy: userId,
        },
        txClient,
      );

      // 4. Update the note's checklist item to record convertedTaskId
      if (foundItem) {
        foundItem.convertedTaskId = createdTask.id;
        await notesRepo.updateNote(
          noteId,
          workspaceId,
          {
            content: contentArray,
          },
          txClient,
        );
      }

      // 5. Establish explicit bidirectional NoteRelationship
      await notesRepo.addNoteRelationship(
        {
          workspaceId,
          noteId,
          targetType: 'TASK',
          targetId: createdTask.id,
          relationshipType: 'CONVERTED_FROM',
          metadata: {
            checklistItemId: itemId,
          },
        },
        txClient,
      );

      return {
        task: createdTask,
        noteId,
        alreadyConverted: false,
      };
    });
  }

  /**
   * Get all workspace tags.
   */
  async getTags(userId, workspaceId) {
    return notesRepo.findTagsByWorkspace(workspaceId);
  }

  /**
   * Get all workspace categories.
   */
  async getCategories(userId, workspaceId) {
    return notesRepo.findCategoriesByWorkspace(workspaceId);
  }
}

export const notesService = new NotesService();
