import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { query } from '../src/core/db.js';
import { createApp } from '../src/app.js';
import { createUser } from '../src/modules/users/users.repository.js';
import { createWorkspaceWithMembership } from '../src/modules/workspaces/workspaces.repository.js';
import { createSession } from '../src/modules/auth/sessions.repository.js';
import { hashSessionToken } from '../src/core/crypto.js';
import * as tasksRepo from '../src/modules/tasks/tasks.repository.js';
import * as projectsRepo from '../src/modules/projects/projects.repository.js';
import * as attachmentsRepo from '../src/modules/attachments/attachments.repository.js';
import * as notesRepo from '../src/modules/notes/notes.repository.js';

describe('Phase 17: Notes / Knowledge Workspace Integration Tests', () => {
  let app;
  let userA;
  let userB;
  let workspaceA;
  let workspaceB;
  let tokenA;
  let tokenB;

  beforeAll(async () => {
    app = createApp({ logger: false });

    // 1. Create Users
    userA = await createUser({
      displayName: 'Notes Tester A',
      email: `notes_user_a_${Date.now()}@example.com`,
    });

    userB = await createUser({
      displayName: 'Notes Tester B',
      email: `notes_user_b_${Date.now()}@example.com`,
    });

    // 2. Create Workspaces
    const wsA = await createWorkspaceWithMembership({
      name: 'Notes Workspace A',
      workspaceType: 'PERSONAL',
      ownerUserId: userA.id,
    });
    workspaceA = wsA.workspace;

    const wsB = await createWorkspaceWithMembership({
      name: 'Notes Workspace B',
      workspaceType: 'PERSONAL',
      ownerUserId: userB.id,
    });
    workspaceB = wsB.workspace;

    // 3. Create Sessions
    tokenA = `notes_token_a_${Date.now()}`;
    await createSession({
      userId: userA.id,
      sessionTokenHash: hashSessionToken(tokenA),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });

    tokenB = `notes_token_b_${Date.now()}`;
    await createSession({
      userId: userB.id,
      sessionTokenHash: hashSessionToken(tokenB),
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  });

  afterAll(async () => {
    if (workspaceA) {
      await query('DELETE FROM note_relationships WHERE workspace_id = $1', [workspaceA.id]);
      await query(
        'DELETE FROM note_tags WHERE note_id IN (SELECT id FROM notes WHERE workspace_id = $1)',
        [workspaceA.id],
      );
      await query('DELETE FROM tags WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM attachments WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM tasks WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM projects WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM notes WHERE workspace_id = $1', [workspaceA.id]);
      await query('DELETE FROM workspaces WHERE id = $1', [workspaceA.id]);
    }

    if (workspaceB) {
      await query('DELETE FROM note_relationships WHERE workspace_id = $1', [workspaceB.id]);
      await query(
        'DELETE FROM note_tags WHERE note_id IN (SELECT id FROM notes WHERE workspace_id = $1)',
        [workspaceB.id],
      );
      await query('DELETE FROM tags WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM attachments WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM tasks WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM projects WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM notes WHERE workspace_id = $1', [workspaceB.id]);
      await query('DELETE FROM workspaces WHERE id = $1', [workspaceB.id]);
    }

    if (userA) await query('DELETE FROM users WHERE id = $1', [userA.id]);
    if (userB) await query('DELETE FROM users WHERE id = $1', [userB.id]);
  });

  // =========================================================================
  // 1. Note Lifecycle (CRUD, Archive, Pin, Favorite, Soft Delete, Recover)
  // =========================================================================
  describe('1. Note Lifecycle (REQ-NOTE-001, REQ-NOTE-002)', () => {
    let createdNoteId;

    it('creates a new note with title, content, tags, and category', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Architecture Overview',
          content: [
            { id: 'p1', type: 'paragraph', text: 'This is the main architecture document.' },
          ],
          category: 'Engineering',
          tags: ['architecture', 'backend'],
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.data.id).toBeDefined();
      expect(body.data.title).toBe('Architecture Overview');
      expect(body.data.category).toBe('Engineering');
      expect(body.data.tags).toContain('architecture');
      expect(body.data.tags).toContain('backend');
      expect(body.data.isPinned).toBe(false);
      expect(body.data.isFavorite).toBe(false);
      expect(body.data.isArchived).toBe(false);

      createdNoteId = body.data.id;
    });

    it('retrieves an existing note by ID', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.id).toBe(createdNoteId);
      expect(body.data.title).toBe('Architecture Overview');
      expect(body.data.contentText).toContain('This is the main architecture document');
      expect(Array.isArray(body.data.backlinks)).toBe(true);
      expect(Array.isArray(body.data.attachments)).toBe(true);
    });

    it('updates note title and category', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Architecture Overview v2',
          category: 'Architecture',
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.data.title).toBe('Architecture Overview v2');
      expect(body.data.category).toBe('Architecture');
    });

    it('pins and unpins a note', async () => {
      // Pin
      const pinRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { isPinned: true },
      });
      expect(pinRes.statusCode).toBe(200);
      expect(pinRes.json().data.isPinned).toBe(true);

      // Unpin
      const unpinRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { isPinned: false },
      });
      expect(unpinRes.statusCode).toBe(200);
      expect(unpinRes.json().data.isPinned).toBe(false);
    });

    it('favorites and unfavorites a note', async () => {
      // Favorite
      const favRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { isFavorite: true },
      });
      expect(favRes.statusCode).toBe(200);
      expect(favRes.json().data.isFavorite).toBe(true);

      // Unfavorite
      const unfavRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { isFavorite: false },
      });
      expect(unfavRes.statusCode).toBe(200);
      expect(unfavRes.json().data.isFavorite).toBe(false);
    });

    it('archives and unarchives a note', async () => {
      // Archive
      const arcRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { isArchived: true },
      });
      expect(arcRes.statusCode).toBe(200);
      expect(arcRes.json().data.isArchived).toBe(true);

      // Verify filtered out by default active list
      const listRes = await app.inject({
        method: 'GET',
        url: '/api/v1/notes?isArchived=false',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(listRes.json().data.some(n => n.id === createdNoteId)).toBe(false);

      // Unarchive
      const unarcRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { isArchived: false },
      });
      expect(unarcRes.statusCode).toBe(200);
      expect(unarcRes.json().data.isArchived).toBe(false);
    });

    it('soft deletes and restores a note', async () => {
      // Soft delete
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(delRes.statusCode).toBe(200);

      // Verify not accessible via GET
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(getRes.statusCode).toBe(404);

      // Restore
      const restoreRes = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${createdNoteId}/restore`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(restoreRes.statusCode).toBe(200);
      expect(restoreRes.json().data.id).toBe(createdNoteId);

      // Verify accessible again
      const getAgain = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${createdNoteId}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(getAgain.statusCode).toBe(200);
    });
  });

  // =========================================================================
  // 2. Rich Content Types & Persistence (REQ-NOTE-003)
  // =========================================================================
  describe('2. Rich Content Types & Persistence (REQ-NOTE-003)', () => {
    it('persists and validates all required node types: headings, lists, checklists, links, images, code, tables', async () => {
      const richContent = [
        { id: 'h1', type: 'heading', level: 1, text: 'Project Roadmap' },
        { id: 'p1', type: 'paragraph', text: 'Introduction to roadmap milestones.' },
        { id: 'ul1', type: 'list', listType: 'bullet', items: ['Item 1', 'Item 2'] },
        { id: 'ol1', type: 'list', listType: 'ordered', items: ['First step', 'Second step'] },
        {
          id: 'cl1',
          type: 'checklist',
          items: [
            { id: 'chk_1', text: 'Write specification', checked: true },
            { id: 'chk_2', text: 'Review architecture', checked: false },
          ],
        },
        { id: 'code1', type: 'code', language: 'javascript', code: 'const answer = 42;' },
        {
          id: 'tbl1',
          type: 'table',
          rows: [
            ['Phase', 'Status'],
            ['Phase 17', 'In Progress'],
          ],
        },
        { id: 'lnk1', type: 'link', url: 'https://example.com/spec', text: 'Specification Link' },
        {
          id: 'img1',
          type: 'image',
          url: 'https://example.com/diagram.png',
          caption: 'System diagram',
        },
      ];

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Full Rich Content Note',
          content: richContent,
        },
      });

      expect(res.statusCode).toBe(201);
      const note = res.json().data;
      expect(Array.isArray(note.content)).toBe(true);
      expect(note.content).toHaveLength(9);

      // Verify plain text extractor extracted content from all nodes for search
      expect(note.contentText).toContain('Project Roadmap');
      expect(note.contentText).toContain('Introduction to roadmap milestones');
      expect(note.contentText).toContain('Item 1');
      expect(note.contentText).toContain('Write specification');
      expect(note.contentText).toContain('const answer = 42;');
      expect(note.contentText).toContain('Specification Link');

      // Verify content reload from database preserves exact structure
      const reload = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${note.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(reload.statusCode).toBe(200);
      const reloadedContent = reload.json().data.content;
      expect(reloadedContent[0].type).toBe('heading');
      expect(reloadedContent[4].type).toBe('checklist');
      expect(reloadedContent[4].items[0].checked).toBe(true);
      expect(reloadedContent[6].type).toBe('table');
      expect(reloadedContent[6].rows[1][1]).toBe('In Progress');
    });
  });

  // =========================================================================
  // 3. Security, Content Sanitization & Malformed Input Handling
  // =========================================================================
  describe('3. Security & Content Sanitization (docs/12.PRIVACY-SECURITY.md)', () => {
    it('sanitizes dangerous URLs such as javascript: protocol', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'XSS Attempt Note',
          content: [
            {
              id: 'bad_link',
              type: 'link',
              url: 'javascript:alert(document.cookie)',
              text: 'Click here for free reward',
            },
            {
              id: 'bad_img',
              type: 'image',
              url: 'vbscript:msgbox("hacked")',
              caption: 'Exploit',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const note = res.json().data;
      // javascript: and vbscript: must be neutralized
      expect(note.content[0].url).toBe('about:blank');
      expect(note.content[1].url).toBe('about:blank');
    });

    it('strips unsafe embedded script tags and HTML event handlers', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Script Injection Attempt',
          content: [
            {
              id: 'p_malicious',
              type: 'paragraph',
              text: 'Hello <script>alert("pwnd")</script><img src="x" onerror="evil()" /> world',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const note = res.json().data;
      expect(note.content[0].text).not.toContain('<script>');
      expect(note.content[0].text).not.toContain('onerror');
    });

    it('safely normalizes malformed rich content structures (non-array / invalid nodes)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Malformed Content Note',
          content: 'Plain unformatted raw string content',
        },
      });

      expect(res.statusCode).toBe(201);
      const note = res.json().data;
      expect(Array.isArray(note.content)).toBe(true);
      expect(note.content[0].type).toBe('paragraph');
      expect(note.content[0].text).toBe('Plain unformatted raw string content');
    });
  });

  // =========================================================================
  // 4. Organization: Categories, Tags, and Filtering
  // =========================================================================
  describe('4. Organization & Tags (REQ-NOTE-001, REQ-NOTE-007)', () => {
    it('manages tags, prevents duplicate tag links, and returns distinct workspace tags', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Tagged Note 1',
          tags: ['research', 'ai', 'research'], // contains duplicate
        },
      });

      expect(res.statusCode).toBe(201);
      const note = res.json().data;
      // Duplicates deduplicated
      expect(note.tags).toEqual(['ai', 'research']);

      // Retrieve workspace tags
      const tagsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/notes/tags',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(tagsRes.statusCode).toBe(200);
      const tagsList = tagsRes.json().data;
      expect(tagsList.some(t => t.name === 'research')).toBe(true);
      expect(tagsList.some(t => t.name === 'ai')).toBe(true);
    });

    it('returns distinct workspace categories with note counts', async () => {
      const catsRes = await app.inject({
        method: 'GET',
        url: '/api/v1/notes/categories',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(catsRes.statusCode).toBe(200);
      const cats = catsRes.json().data;
      expect(cats.some(c => c.category === 'Architecture' && c.noteCount >= 1)).toBe(true);
    });
  });

  // =========================================================================
  // 5. Search & Workspace Isolation (REQ-NOTE-007)
  // =========================================================================
  describe('5. Search & Workspace Isolation (REQ-NOTE-007)', () => {
    let searchableNoteA;
    let searchableNoteB;

    beforeAll(async () => {
      // Create Note in Workspace A
      const resA = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Quantum Computing Algorithms',
          content: [
            {
              id: 'p',
              type: 'paragraph',
              text: 'Exploration of Shor algorithm and Grover search.',
            },
          ],
          category: 'Quantum',
          tags: ['physics', 'computing'],
        },
      });
      searchableNoteA = resA.json().data;

      // Create Note in Workspace B with same keyword
      const resB = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenB}`,
          'x-workspace-id': workspaceB.id,
        },
        payload: {
          title: 'Quantum Supremacy Claims',
          content: [
            { id: 'p', type: 'paragraph', text: 'Private research on superconducting qubits.' },
          ],
          category: 'Secret',
        },
      });
      searchableNoteB = resB.json().data;
    });

    it('finds notes by title query', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notes?q=Computing',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const notes = res.json().data;
      expect(notes.some(n => n.id === searchableNoteA.id)).toBe(true);
    });

    it('finds notes by body content query', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notes?q=Grover',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const notes = res.json().data;
      expect(notes.some(n => n.id === searchableNoteA.id)).toBe(true);
    });

    it('filters notes by tag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notes?tag=physics',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const notes = res.json().data;
      expect(notes.some(n => n.id === searchableNoteA.id)).toBe(true);
    });

    it('strictly enforces workspace tenant isolation: User A cannot search or see User B notes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notes?q=Quantum',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const notes = res.json().data;
      // Must contain Note A from Workspace A
      expect(notes.some(n => n.id === searchableNoteA.id)).toBe(true);
      // Must NEVER contain Note B from Workspace B
      expect(notes.some(n => n.id === searchableNoteB.id)).toBe(false);
    });

    it('returns empty array when search query matches nothing', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/notes?q=NonExistentSuperStringZ123984',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().data).toHaveLength(0);
      expect(res.json().pagination.total).toBe(0);
    });
  });

  // =========================================================================
  // 6. Explicit Note Relationships & Backlinks (REQ-NOTE-005, REQ-NOTE-006)
  // =========================================================================
  describe('6. Explicit Note Relationships & Backlinks (REQ-NOTE-005, REQ-NOTE-006)', () => {
    let sourceNote;
    let targetNote;
    let sampleTask;
    let sampleProject;
    let relToTask;

    beforeAll(async () => {
      // 1. Create source note & target note
      const n1 = await notesRepo.createNote({
        workspaceId: workspaceA.id,
        ownerUserId: userA.id,
        title: 'Source Documentation Note',
      });
      sourceNote = n1;

      const n2 = await notesRepo.createNote({
        workspaceId: workspaceA.id,
        ownerUserId: userA.id,
        title: 'Target Architecture Note',
      });
      targetNote = n2;

      // 2. Create sample Task & Project in Workspace A
      sampleTask = await tasksRepo.createTask({
        workspaceId: workspaceA.id,
        title: 'Implement Database Migrations',
        status: 'TODO',
        createdBy: userA.id,
      });

      sampleProject = await projectsRepo.createProject({
        workspaceId: workspaceA.id,
        name: 'Workaholic Engine',
        createdBy: userA.id,
      });
    });

    it('links a Note to a Task explicitly', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${sourceNote.id}/relationships`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          targetType: 'TASK',
          targetId: sampleTask.id,
          relationshipType: 'RELATES_TO',
        },
      });

      expect(res.statusCode).toBe(201);
      const rel = res.json().data;
      expect(rel.noteId).toBe(sourceNote.id);
      expect(rel.targetType).toBe('TASK');
      expect(rel.targetId).toBe(sampleTask.id);
      relToTask = rel;
    });

    it('links a Note to a Project explicitly', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${sourceNote.id}/relationships`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          targetType: 'PROJECT',
          targetId: sampleProject.id,
          relationshipType: 'RELATES_TO',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json().data.targetType).toBe('PROJECT');
    });

    it('links Note A to Note B and discovers reverse backlink from Note B', async () => {
      // Source Note links to Target Note
      const linkRes = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${sourceNote.id}/relationships`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          targetType: 'NOTE',
          targetId: targetNote.id,
          relationshipType: 'REFERENCES',
        },
      });
      expect(linkRes.statusCode).toBe(201);

      // Query backlinks on Target Note
      const backlinksRes = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${targetNote.id}/backlinks`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(backlinksRes.statusCode).toBe(200);
      const backlinks = backlinksRes.json().data;
      expect(backlinks.some(b => b.noteId === sourceNote.id)).toBe(true);
    });

    it('discovers notes related to a target entity via /related endpoint', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/related?targetType=TASK&targetId=${sampleTask.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const relatedNotes = res.json().data;
      expect(relatedNotes.some(r => r.noteId === sourceNote.id)).toBe(true);
    });

    it('removes an explicit relationship without deleting either resource', async () => {
      const removeRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notes/${sourceNote.id}/relationships/${relToTask.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(removeRes.statusCode).toBe(200);

      // Verify Note still exists
      const noteCheck = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${sourceNote.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });
      expect(noteCheck.statusCode).toBe(200);

      // Verify Task still exists
      const taskInDb = await tasksRepo.findTaskById(sampleTask.id, workspaceA.id);
      expect(taskInDb).not.toBeNull();
    });

    it('rejects relationship to non-existent target ID', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${sourceNote.id}/relationships`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          targetType: 'TASK',
          targetId: '00000000-0000-0000-0000-000000000099',
          relationshipType: 'RELATES_TO',
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  // =========================================================================
  // 7. Attachments Integration (Phase 15 integration & REQ-NOTE-004)
  // =========================================================================
  describe('7. Attachments Integration (REQ-NOTE-004)', () => {
    let noteWithAttachment;
    let attachmentRecord;

    beforeAll(async () => {
      noteWithAttachment = await notesRepo.createNote({
        workspaceId: workspaceA.id,
        ownerUserId: userA.id,
        title: 'Note With Attached Files',
      });
    });

    it('attaches a file to a note using the shared attachment subsystem', async () => {
      const created = await attachmentsRepo.createAttachment({
        workspaceId: workspaceA.id,
        ownerUserId: userA.id,
        targetType: 'NOTE',
        targetId: noteWithAttachment.id,
        fileName: 'spec_v1.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1048576,
        externalFileId: 'mock_drive_file_id_123',
        webUrl: 'https://drive.google.com/file/d/mock_drive_file_id_123/view',
      });

      attachmentRecord = created;
      expect(created.id).toBeDefined();
      expect(created.targetType).toBe('NOTE');
      expect(created.targetId).toBe(noteWithAttachment.id);
    });

    it('includes attachments when retrieving note details', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${noteWithAttachment.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(200);
      const note = res.json().data;
      expect(note.attachments).toHaveLength(1);
      expect(note.attachments[0].fileName).toBe('spec_v1.pdf');
    });

    it('detaches attachment relationship without deleting Google Drive external file', async () => {
      // Soft-delete attachment
      const detached = await attachmentsRepo.deleteAttachment(attachmentRecord.id, workspaceA.id);
      expect(detached.deletedAt).toBeDefined();

      // Verify Google Drive external mapping / file ID is preserved on detached record
      expect(detached.externalFileId).toBe('mock_drive_file_id_123');

      // Verify note now has 0 active attachments
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${noteWithAttachment.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.json().data.attachments).toHaveLength(0);
    });
  });

  // =========================================================================
  // 8. Checklist / Task Boundary (BR-NOTE-001, BR-NOTE-002, REQ-NOTE-008)
  // =========================================================================
  describe('8. Checklist / Task Boundary (BR-NOTE-001, BR-NOTE-002, REQ-NOTE-008)', () => {
    let checklistNote;
    const item1Id = 'item_spec_101';
    const item2Id = 'item_spec_102';

    it('creating and updating checklist items inside a note DOES NOT create Workaholic Tasks', async () => {
      // Count tasks before
      const tasksBefore = await query(
        'SELECT COUNT(*) as count FROM tasks WHERE workspace_id = $1',
        [workspaceA.id],
      );
      const countBefore = parseInt(tasksBefore.rows[0].count, 10);

      // Create note with 2 checklist items
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/notes',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          title: 'Sprint Planning Checklist',
          content: [
            {
              id: 'chk_node_1',
              type: 'checklist',
              items: [
                { id: item1Id, text: 'Deploy database migration to staging', checked: false },
                { id: item2Id, text: 'Update API documentation', checked: false },
              ],
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      checklistNote = res.json().data;

      // Toggle checklist item state in note
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${checklistNote.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          content: [
            {
              id: 'chk_node_1',
              type: 'checklist',
              items: [
                { id: item1Id, text: 'Deploy database migration to staging', checked: true },
                { id: item2Id, text: 'Update API documentation', checked: false },
              ],
            },
          ],
        },
      });

      // Count tasks after: Must be IDENTICAL to countBefore!
      const tasksAfter = await query(
        'SELECT COUNT(*) as count FROM tasks WHERE workspace_id = $1',
        [workspaceA.id],
      );
      const countAfter = parseInt(tasksAfter.rows[0].count, 10);

      expect(countAfter).toBe(countBefore);
    });

    it('explicitly converts a checklist item into a Workaholic Task with ownership and bidirectional relationship', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${checklistNote.id}/convert-checklist-item`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          itemId: item1Id,
          title: 'Deploy database migration to staging (Task)',
          priority: 'P1',
        },
      });

      expect(res.statusCode).toBe(201);
      const result = res.json().data;
      expect(result.task).toBeDefined();
      expect(result.task.title).toBe('Deploy database migration to staging (Task)');
      expect(result.task.priority).toBe('P1');
      expect(result.task.workspaceId).toBe(workspaceA.id);
      expect(result.task.createdBy).toBe(userA.id);
      expect(result.alreadyConverted).toBe(false);

      // Verify note content now has convertedTaskId on item1Id
      const refreshedNote = await notesRepo.findNoteById(checklistNote.id, workspaceA.id);
      const checklistBlock = refreshedNote.content.find(n => n.type === 'checklist');
      const item1 = checklistBlock.items.find(i => i.id === item1Id);
      expect(item1.convertedTaskId).toBe(result.task.id);

      // Verify NoteRelationship was established
      const relationships = await notesRepo.findNoteRelationships(checklistNote.id, workspaceA.id);
      const conversionRel = relationships.find(
        r => r.targetType === 'TASK' && r.targetId === result.task.id,
      );
      expect(conversionRel).toBeDefined();
      expect(conversionRel.relationshipType).toBe('CONVERTED_FROM');
    });

    it('prevents accidental duplicate conversion on repeated convert request', async () => {
      const duplicateRes = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${checklistNote.id}/convert-checklist-item`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          itemId: item1Id, // same item that was already converted
          title: 'Deploy database migration duplicate attempt',
        },
      });

      expect(duplicateRes.statusCode).toBe(201);
      const dupResult = duplicateRes.json().data;
      // Must signal alreadyConverted = true and return existing task rather than creating a duplicate
      expect(dupResult.alreadyConverted).toBe(true);
    });
  });

  // =========================================================================
  // 9. Cross-Workspace Authorization & Tenant Isolation
  // =========================================================================
  describe('9. Cross-Workspace Security & Authorization (docs/11.PERMISSIONS-MODEL.md)', () => {
    let noteInWorkspaceB;

    beforeAll(async () => {
      noteInWorkspaceB = await notesRepo.createNote({
        workspaceId: workspaceB.id,
        ownerUserId: userB.id,
        title: 'User B Private Financials',
      });
    });

    it('blocks User A from reading User B note', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/notes/${noteInWorkspaceB.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id, // User A's workspace context
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('blocks User A from modifying User B note', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/notes/${noteInWorkspaceB.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: { title: 'Compromised Title' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('blocks User A from deleting User B note', async () => {
      const res = await app.inject({
        method: 'DELETE',
        url: `/api/v1/notes/${noteInWorkspaceB.id}`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
      });

      expect(res.statusCode).toBe(404);
    });

    it('blocks User A from creating cross-workspace relationship to User B resource', async () => {
      const noteA = await notesRepo.createNote({
        workspaceId: workspaceA.id,
        ownerUserId: userA.id,
        title: 'User A Attacker Note',
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/notes/${noteA.id}/relationships`,
        headers: {
          authorization: `Bearer ${tokenA}`,
          'x-workspace-id': workspaceA.id,
        },
        payload: {
          targetType: 'NOTE',
          targetId: noteInWorkspaceB.id, // Target exists only in Workspace B!
          relationshipType: 'RELATES_TO',
        },
      });

      // Target note must NOT be found in Workspace A
      expect(res.statusCode).toBe(400);
      expect(res.json().error.message).toContain('not found in workspace');
    });
  });
});
