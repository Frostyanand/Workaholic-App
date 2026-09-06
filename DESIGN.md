# DESIGN.md — Workaholic Design System & UI/UX Specifications

> **Authoritative Visual & Interaction Design Standards**  
> **Product:** Workaholic  
> **Status:** Active Standard (Derived from `docs/14.DESIGN-SYSTEM.md` & `docs/13.UX-SPECIFICATION.md`)

---

## 1. Visual Direction & Brand Stance

Workaholic communicates:

```text
Calm • Focused • Modern • Structured • Reliable • Personal • Premium
```

- **Aesthetic Stance:** **Technical Editorial**. A high-craft, structured dark-first productivity workspace tailored for cognitive clarity during long focus sessions.
- **Tone:** Quiet confidence. No frivolous decorative elements, no cartoonish illustrations, no flashy neon gradients. Visual weight directly signals functional importance.

---

## 2. Color System & Surface Hierarchy

The color system uses semantically named CSS custom properties defined in `apps/web/src/index.css`. Components MUST reference semantic tokens rather than raw hexadecimal values.

### 2.1 Surface Elevation (Dark Theme Primary)

Workaholic uses a layered physical elevation model in dark mode to establish spatial depth without visual noise:

```
┌────────────────────────────────────────────────────────┐
│ Modal / Dialog / Popover:  var(--bg-surface-elevated)  │ (rgba(51, 65, 85, 0.95) + 16px blur)
├────────────────────────────────────────────────────────┤
│ Cards / Panels / Columns:  var(--bg-surface)           │ (#1e293b / Slate 800)
├────────────────────────────────────────────────────────┤
│ Base Application Canvas:   var(--bg-primary)           │ (#0f172a / Slate 900)
└────────────────────────────────────────────────────────┘
```

### 2.2 Core Color Palette Tokens

| Semantic Token          | Value (Dark)                | Purpose / Usage                                    |
| ----------------------- | --------------------------- | -------------------------------------------------- |
| `--bg-primary`          | `#0f172a`                   | App background, main window canvas                 |
| `--bg-secondary`        | `#111827`                   | Navigation sidebar, table headers                  |
| `--bg-surface`          | `#1e293b`                   | Task cards, board columns, calendar blocks         |
| `--bg-surface-elevated` | `#334155`                   | Dropdown menus, modals, tooltips                   |
| `--glass-bg`            | `rgba(30, 41, 59, 0.7)`     | Glassmorphic overlays and header bars              |
| `--border-subtle`       | `rgba(255, 255, 255, 0.08)` | Card borders, dividers, subtle separators          |
| `--border-default`      | `rgba(255, 255, 255, 0.16)` | Input borders, active card outlines                |
| `--text-primary`        | `#f8fafc`                   | Primary titles, active task titles (high contrast) |
| `--text-secondary`      | `#94a3b8`                   | Supporting descriptions, metadata, labels          |
| `--text-muted`          | `#64748b`                   | Disabled text, subtle timestamps                   |
| `--accent-primary`      | `#38bdf8`                   | Sky 400: Primary actions, focus rings, active tabs |
| `--accent-success`      | `#10b981`                   | Emerald 500: Completed tasks, positive sync state  |
| `--accent-warning`      | `#f59e0b`                   | Amber 500: Impending deadlines, warning badges     |
| `--accent-danger`       | `#ef4444`                   | Rose 500: Overdue tasks, destructive actions       |

---

## 3. Typography Scale & Hierarchy

Typography is set in a modern, highly legible system sans-serif font stack (`Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`).

| Level          | Size             | Weight         | Line Height | Tracking | Usage                                     |
| -------------- | ---------------- | -------------- | ----------- | -------- | ----------------------------------------- |
| **Display**    | 32px (2.0rem)    | 700 (Bold)     | 1.2         | -0.025em | Today view greeting, main workspace title |
| **Heading 1**  | 24px (1.5rem)    | 700 (Bold)     | 1.3         | -0.02em  | Section headings, modal headers           |
| **Heading 2**  | 20px (1.25rem)   | 600 (Semibold) | 1.35        | -0.015em | Board column titles, card cluster headers |
| **Heading 3**  | 16px (1.0rem)    | 600 (Semibold) | 1.4         | -0.01em  | Sub-headings, task title in detail view   |
| **Body Large** | 16px (1.0rem)    | 400 (Regular)  | 1.5         | normal   | Rich-text notes, description text         |
| **Body**       | 14px (0.875rem)  | 400 (Regular)  | 1.5         | normal   | Standard task titles, list items, inputs  |
| **Body Small** | 12px (0.75rem)   | 400 (Regular)  | 1.4         | normal   | Metadata, timestamps, status tags         |
| **Caption**    | 11px (0.6875rem) | 500 (Medium)   | 1.3         | +0.01em  | Keyboard shortcut hints, micro-labels     |
| **Label**      | 12px (0.75rem)   | 600 (Semibold) | 1.2         | +0.05em  | Uppercase badge text, column status pills |

---

## 4. Spacing Scale & Layout Grid

Workaholic uses an 8-point spatial system with a 4px sub-grid:

```text
--space-1:  4px   (tight badges, icon offsets)
--space-2:  8px   (gap between icon & text, list item vertical padding)
--space-3: 12px   (standard card internal padding, button horizontal padding)
--space-4: 16px   (container padding, grid gap)
--space-5: 20px   (section separation)
--space-6: 24px   (panel margins, sidebar padding)
--space-8: 32px   (page view padding)
--space-12: 48px  (major section breaks)
--space-16: 64px  (landing / empty state vertical margins)
```

### 4.1 Desktop 3-Column Layout

On desktop (`>= 1024px`), the application is structured as a flexible three-column workspace:

```
┌─────────────────┬───────────────────────────────────┬───────────────────┐
│ Navigation      │ Main Content View                 │ Context Panel     │
│ (240px fixed)   │ (flex-1: Tasks, Board, Calendar)  │ (320px-380px)     │
│                 │                                   │ (Task details /   │
│ - Workspaces    │ - Header bar                      │  Reminders /      │
│ - Today         │ - Active operational surface      │  DO Schedule)     │
│ - Tasks         │ - Floating quick capture          │                   │
│ - Boards        │                                   │                   │
│ - Calendar      │                                   │                   │
└─────────────────┴───────────────────────────────────┴───────────────────┘
```

---

## 5. Component Language & Interaction Patterns

### 5.1 Interactive Elements

- **Buttons**:
  - Primary: Filled `--accent-primary` (`#38bdf8`) with dark text (`#0f172a`), semibold weight.
  - Secondary: Transparent with `1px solid var(--border-default)`, hovering to `var(--bg-surface-elevated)`.
  - Destructive: Subdued rose background (`rgba(239, 68, 68, 0.15)`) with `--accent-danger` text.
- **Form Controls & Inputs**:
  - Background: `var(--bg-secondary)`. Border: `1px solid var(--border-subtle)`.
  - Focus Ring: `2px solid var(--accent-primary)` with `2px` offset.
- **Cards (Tasks / Boards / Events)**:
  - Background: `var(--bg-surface)`. Border: `1px solid var(--border-subtle)`.
  - Hover: Subtle elevation change + border transitions to `var(--border-default)`.
  - Active / Dragging: Opacity `0.85`, box shadow `0 12px 24px -4px rgba(0,0,0,0.4)`.

### 5.2 Key Interaction Patterns

1. **Quick Capture Everywhere**: Pressing `C` or clicking Quick Capture opens a lightweight, non-blocking modal that defaults to title entry with natural keyboard submission (`Enter` to save, `Cmd+Enter` to save and open details).
2. **Keyboard-First Navigation**: Navigation links, task selection, and actions support complete keyboard traversal (`Tab`, `Shift+Tab`, `Arrow` keys for Kanban).
3. **Optimistic UI with Graceful Rollback**: Local task completion or status shifts reflect immediately on screen. If the backend or sync fails, state reverts smoothly with an actionable notification toast.
4. **Non-Destructive Soft Deletion**: Deleted tasks enter Trash with a 5-second "Undo" snackbar.

---

## 6. Motion & Animation Standards

- **Timing**:
  - Micro-interactions (hover, focus, button active): `150ms ease-out`
  - Structural transitions (drawer slide, modal fade, card expand): `220ms cubic-bezier(0.16, 1, 0.3, 1)`
  - Reorder / Drag animations: `200ms ease`
- **Rule of Restraint**: Zero decorative bouncing or continuous spin animations. Motion exists solely to convey spatial relationship or confirm user action.
- **Accessibility**: All animations MUST respect `@media (prefers-reduced-motion: reduce)`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    * {
      animation-duration: 0.01ms !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```

---

## 7. Responsive Breakpoints

| Breakpoint  | Range             | Behavioral Adaptation                                                                                            |
| ----------- | ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Mobile**  | `< 768px`         | Single column. Navigation collapses to bottom tab bar or swipe drawer. Context panel opens as full-screen modal. |
| **Tablet**  | `768px - 1023px`  | Collapsible sidebar. Main view fills available width. Context panel overlays as side drawer.                     |
| **Desktop** | `1024px - 1439px` | Standard 3-column layout. Sidebar visible. Context panel toggleable.                                             |
| **Wide**    | `>= 1440px`       | Full 3-column layout visible simultaneously with expanded Kanban columns.                                        |

---

## 8. Accessibility (WCAG 2.1 AA Compliance)

- **Contrast**: Normal text must satisfy minimum `4.5:1` contrast ratio against its background. Large text (>= 18pt/24px) must satisfy `3.0:1`.
- **Focus Rings**: Never suppress outline without providing an explicit, high-contrast replacement focus state (`var(--accent-primary)`).
- **Icon-Only Buttons**: Every icon button (e.g. close, edit, delete) MUST include an explicit `aria-label` or `title`.
- **Form Association**: All form inputs must have programmatic label association via `htmlFor` / `id`.

---

## 9. Visual Anti-Patterns (What NOT to do)

- ❌ **No Generic "AI Templates"**: Avoid generic purple-tinted gradients, floating abstract blobs, or cartoonish placeholders.
- ❌ **No Low-Contrast Gray-on-Black**: Avoid illegible text where contrast drops below 4.5:1. Secondary text must remain readable.
- ❌ **No Unstyled Native Form Elements**: Checkboxes, select dropdowns, and date pickers must use customized, coherent design tokens.
- ❌ **No Full-Page Blocking Spinners**: Use skeleton screens or localized spinner badges so existing content remains readable during data fetches.
- ❌ **No Inconsistent Date Formats**: Standardize on unambiguous date representations (e.g. `MMM D, YYYY` or relative time `Today at 2:00 PM`).
