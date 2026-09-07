import { NotFoundError, ValidationError } from '../../core/errors.js';
import * as boardsRepo from './boards.repository.js';
import * as columnsRepo from './columns.repository.js';
import * as projectsRepo from '../projects/projects.repository.js';
import { withTransaction } from '../../core/db.js';

export class BoardsService {
  /**
   * Create a new board with optional project association and default columns
   * @param {string} workspaceId
   * @param {string} userId
   * @param {object} data
   */
  async createBoard(workspaceId, userId, data) {
    if (!workspaceId) {
      throw new ValidationError('workspaceId is required');
    }

    if (data.projectId) {
      const project = await projectsRepo.findProjectById(data.projectId, workspaceId);
      if (!project) {
        throw new NotFoundError('Project not found in this workspace');
      }
    }

    return withTransaction(async client => {
      const board = await boardsRepo.createBoard(
        {
          ...data,
          workspaceId,
          createdBy: userId,
        },
        client,
      );

      // Automatically provision standard Kanban columns: To Do, In Progress, Done
      const defaultCols = [
        { name: 'To Do', position: 0, statusMapping: 'TODO' },
        { name: 'In Progress', position: 1, statusMapping: 'IN_PROGRESS' },
        { name: 'Done', position: 2, statusMapping: 'COMPLETED' },
      ];

      const columns = [];
      for (const col of defaultCols) {
        const createdCol = await columnsRepo.createColumn(
          {
            boardId: board.id,
            name: col.name,
            position: col.position,
            statusMapping: col.statusMapping,
          },
          client,
        );
        columns.push(createdCol);
      }

      return {
        ...board,
        columns,
      };
    });
  }

  /**
   * Retrieve single board by ID with its columns
   * @param {string} id
   * @param {string} workspaceId
   */
  async getBoardById(id, workspaceId) {
    const board = await boardsRepo.findBoardById(id, workspaceId);
    if (!board) {
      throw new NotFoundError('Board not found');
    }

    const columns = await columnsRepo.listColumnsByBoard(id);
    return {
      ...board,
      columns,
    };
  }

  /**
   * List boards in workspace
   * @param {string} workspaceId
   * @param {object} [query={}]
   */
  async listBoards(workspaceId, query = {}) {
    if (query.projectId) {
      const project = await projectsRepo.findProjectById(query.projectId, workspaceId);
      if (!project) {
        throw new NotFoundError('Project not found in this workspace');
      }
    }

    return boardsRepo.listBoards(workspaceId, query);
  }

  /**
   * Update board
   * @param {string} id
   * @param {string} workspaceId
   * @param {object} updates
   */
  async updateBoard(id, workspaceId, updates) {
    const existing = await boardsRepo.findBoardById(id, workspaceId);
    if (!existing) {
      throw new NotFoundError('Board not found');
    }

    if (updates.projectId) {
      const project = await projectsRepo.findProjectById(updates.projectId, workspaceId);
      if (!project) {
        throw new NotFoundError('Project not found in this workspace');
      }
    }

    return boardsRepo.updateBoard(id, workspaceId, updates);
  }

  /**
   * Soft-delete board
   * @param {string} id
   * @param {string} workspaceId
   */
  async deleteBoard(id, workspaceId) {
    const existing = await boardsRepo.findBoardById(id, workspaceId);
    if (!existing) {
      throw new NotFoundError('Board not found');
    }

    return boardsRepo.softDeleteBoard(id, workspaceId);
  }

  /**
   * Restore soft-deleted board
   * @param {string} id
   * @param {string} workspaceId
   */
  async restoreBoard(id, workspaceId) {
    const existing = await boardsRepo.findBoardById(id, workspaceId, undefined, true);
    if (!existing) {
      throw new NotFoundError('Board not found');
    }

    if (!existing.deletedAt) {
      return existing;
    }

    return boardsRepo.restoreBoard(id, workspaceId);
  }

  /**
   * Create column on a board
   * @param {string} boardId
   * @param {string} workspaceId
   * @param {object} columnData
   */
  async createColumn(boardId, workspaceId, columnData) {
    const board = await boardsRepo.findBoardById(boardId, workspaceId);
    if (!board) {
      throw new NotFoundError('Board not found');
    }

    return columnsRepo.createColumn({
      ...columnData,
      boardId,
    });
  }

  /**
   * Update column
   * @param {string} columnId
   * @param {string} workspaceId
   * @param {object} updates
   */
  async updateColumn(columnId, workspaceId, updates) {
    const col = await columnsRepo.findColumnById(columnId);
    if (!col || col.workspaceId !== workspaceId) {
      throw new NotFoundError('Column not found');
    }

    return columnsRepo.updateColumn(columnId, updates);
  }

  /**
   * Delete column
   * @param {string} columnId
   * @param {string} workspaceId
   */
  async deleteColumn(columnId, workspaceId) {
    const col = await columnsRepo.findColumnById(columnId);
    if (!col || col.workspaceId !== workspaceId) {
      throw new NotFoundError('Column not found');
    }

    return columnsRepo.deleteColumn(columnId);
  }

  /**
   * Reorder columns on a board
   * @param {string} boardId
   * @param {string} workspaceId
   * @param {string[]} columnIds
   */
  async reorderColumns(boardId, workspaceId, columnIds) {
    const board = await boardsRepo.findBoardById(boardId, workspaceId);
    if (!board) {
      throw new NotFoundError('Board not found');
    }

    const existingCols = await columnsRepo.listColumnsByBoard(boardId);
    const existingIdSet = new Set(existingCols.map(c => c.id));

    for (const colId of columnIds) {
      if (!existingIdSet.has(colId)) {
        throw new ValidationError(`Column ${colId} does not belong to board ${boardId}`);
      }
    }

    return withTransaction(async client => {
      return columnsRepo.reorderColumns(boardId, columnIds, client);
    });
  }
}

export const boardsService = new BoardsService();
