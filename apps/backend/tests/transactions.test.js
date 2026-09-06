import { describe, it, expect, vi } from 'vitest';
import { withTransaction, withSavepoint, pool } from '../src/core/db.js';

describe('Transaction Utilities & ACID Boundaries (Task 3.5)', () => {
  describe('Mocked Transaction Unit Tests', () => {
    it('executes successful transaction with BEGIN, COMMIT and client release', async () => {
      const queries = [];
      let released = false;

      const mockClient = {
        query: vi.fn(async sql => {
          queries.push(sql);
          return { rows: [] };
        }),
        release: vi.fn(() => {
          released = true;
        }),
      };

      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      const result = await withTransaction(async client => {
        await client.query('INSERT INTO test VALUES ($1)', [1]);
        return 'success_val';
      }, mockPool);

      expect(result).toBe('success_val');
      expect(queries[0]).toBe('BEGIN');
      expect(queries[1]).toBe('INSERT INTO test VALUES ($1)');
      expect(queries[2]).toBe('COMMIT');
      expect(released).toBe(true);
    });

    it('rolls back on error and guarantees client release', async () => {
      const queries = [];
      let released = false;

      const mockClient = {
        query: vi.fn(async sql => {
          queries.push(sql);
          if (sql === 'FAIL') throw new Error('Database mutation failed');
          return { rows: [] };
        }),
        release: vi.fn(() => {
          released = true;
        }),
      };

      const mockPool = {
        connect: vi.fn(async () => mockClient),
      };

      await expect(
        withTransaction(async client => {
          await client.query('FAIL');
        }, mockPool),
      ).rejects.toThrow('Database mutation failed');

      expect(queries[0]).toBe('BEGIN');
      expect(queries[1]).toBe('FAIL');
      expect(queries[2]).toBe('ROLLBACK');
      expect(released).toBe(true);
    });

    it('supports re-entrant transaction propagation without duplicate BEGIN/COMMIT', async () => {
      const queries = [];

      const mockClient = {
        query: vi.fn(async sql => {
          queries.push(sql);
          return { rows: [] };
        }),
      };

      // Passing existing transaction client (no .connect method)
      const outerResult = await withTransaction(async tx1 => {
        await tx1.query('STEP 1');
        return withTransaction(async tx2 => {
          await tx2.query('STEP 2');
          return 'nested_done';
        }, tx1);
      }, mockClient);

      expect(outerResult).toBe('nested_done');
      expect(queries).toEqual(['STEP 1', 'STEP 2']);
      // Neither tx1 nor tx2 issued inner BEGIN/COMMIT because it was already a transaction client
    });

    it('configures transaction isolation levels', async () => {
      const queries = [];
      const mockClient = {
        query: vi.fn(async sql => {
          queries.push(sql);
          return { rows: [] };
        }),
        release: vi.fn(),
      };
      const mockPool = { connect: async () => mockClient };

      await withTransaction(async () => 'done', mockPool, { isolationLevel: 'REPEATABLE READ' });
      expect(queries[0]).toBe('BEGIN ISOLATION LEVEL REPEATABLE READ');
      expect(queries[1]).toBe('COMMIT');

      queries.length = 0;
      await withTransaction(async () => 'done', mockPool, {
        isolationLevel: 'SERIALIZABLE',
        readOnly: true,
      });
      expect(queries[0]).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY');
    });

    it('rejects invalid isolation levels', async () => {
      const mockClient = { query: vi.fn(), release: vi.fn() };
      const mockPool = { connect: async () => mockClient };

      await expect(
        withTransaction(async () => 'done', mockPool, {
          isolationLevel: 'CHAOS_READ',
        }),
      ).rejects.toThrow('Invalid isolation level');
    });

    it('executes withSavepoint committing savepoint on success', async () => {
      const queries = [];
      const mockClient = {
        query: vi.fn(async sql => {
          queries.push(sql);
          return { rows: [] };
        }),
      };

      const result = await withSavepoint(
        mockClient,
        async client => {
          await client.query('SELECT 1');
          return 'sp_success';
        },
        'sp_checkpoint_1',
      );

      expect(result).toBe('sp_success');
      expect(queries).toEqual([
        'SAVEPOINT sp_checkpoint_1',
        'SELECT 1',
        'RELEASE SAVEPOINT sp_checkpoint_1',
      ]);
    });

    it('executes withSavepoint rolling back to savepoint on error', async () => {
      const queries = [];
      const mockClient = {
        query: vi.fn(async sql => {
          queries.push(sql);
          if (sql === 'FAIL_SP') throw new Error('Savepoint operation failed');
          return { rows: [] };
        }),
      };

      await expect(
        withSavepoint(
          mockClient,
          async client => {
            await client.query('FAIL_SP');
          },
          'sp_fail_point',
        ),
      ).rejects.toThrow('Savepoint operation failed');

      expect(queries).toEqual([
        'SAVEPOINT sp_fail_point',
        'FAIL_SP',
        'ROLLBACK TO SAVEPOINT sp_fail_point',
      ]);
    });

    it('rejects invalid savepoint names to prevent injection', async () => {
      const mockClient = { query: vi.fn() };
      await expect(
        withSavepoint(mockClient, async () => {}, 'bad name; DROP TABLE users;'),
      ).rejects.toThrow('Invalid savepoint name');
    });
  });

  describe('Live PostgreSQL Integration', () => {
    it('executes transaction with REPEATABLE READ on live database', async () => {
      const result = await withTransaction(
        async client => {
          const res = await client.query('SELECT current_setting($1) as isolation', [
            'transaction_isolation',
          ]);
          return res.rows[0].isolation;
        },
        pool,
        { isolationLevel: 'REPEATABLE READ' },
      );

      expect(result).toBe('repeatable read');
    });

    it('supports nested savepoints and partial rollbacks on live database', async () => {
      await withTransaction(async client => {
        // Create temporary table for test
        await client.query('CREATE TEMP TABLE test_tx_sp (val INT)');
        await client.query('INSERT INTO test_tx_sp VALUES (1)');

        // Run savepoint that fails
        try {
          await withSavepoint(client, async spClient => {
            await spClient.query('INSERT INTO test_tx_sp VALUES (2)');
            throw new Error('Rollback only step 2');
          });
        } catch {
          // Expected catch
        }

        // Run savepoint that succeeds
        await withSavepoint(client, async spClient => {
          await spClient.query('INSERT INTO test_tx_sp VALUES (3)');
        });

        // Verify state: val 1 and 3 remain, val 2 was rolled back by savepoint
        const res = await client.query('SELECT val FROM test_tx_sp ORDER BY val ASC');
        expect(res.rows.map(r => r.val)).toEqual([1, 3]);

        await client.query('DROP TABLE test_tx_sp');
      });
    });
  });
});
