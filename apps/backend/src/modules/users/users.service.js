import * as usersRepo from './users.repository.js';
import { NotFoundError, ConflictError } from '../../core/errors.js';

/**
 * Users Service — encapsulates domain logic and business rules for User entities.
 * Conforms to docs/6.SYSTEM-ARCHITECTURE.md Section 48 & docs/4.BUSINESS-RULES.md
 */
export class UsersService {
  constructor(repository = usersRepo) {
    this.repo = repository;
  }

  /**
   * Retrieve active user profile by ID.
   * Throws NotFoundError if user does not exist or is soft-deleted.
   */
  async getUserProfile(userId, client = undefined) {
    const user = await this.repo.findUserById(userId, client);
    if (!user) {
      throw new NotFoundError('User not found');
    }
    return user;
  }

  /**
   * Register a new user with duplicate email prevention.
   */
  async createUser(userData, client = undefined) {
    const existing = await this.repo.findUserByEmail(userData.email, client);
    if (existing) {
      throw new ConflictError('User with this email already exists');
    }
    return this.repo.createUser(userData, client);
  }

  /**
   * Update user profile fields with email collision prevention.
   */
  async updateUserProfile(userId, updateData, client = undefined) {
    const user = await this.getUserProfile(userId, client);

    if (updateData.email && updateData.email.toLowerCase() !== user.email.toLowerCase()) {
      const existing = await this.repo.findUserByEmail(updateData.email, client);
      if (existing && existing.id !== userId) {
        throw new ConflictError('User with this email already exists');
      }
    }

    return this.repo.updateUser(userId, updateData, client);
  }

  /**
   * Soft-delete user account.
   */
  async deleteUser(userId, client = undefined) {
    await this.getUserProfile(userId, client);
    return this.repo.softDeleteUser(userId, client);
  }
}

export const usersService = new UsersService();
