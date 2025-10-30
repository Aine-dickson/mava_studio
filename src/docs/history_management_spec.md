### History Management is desired to be multilevel as described beow

# **Multi-Level History Management Specification**

## 1. **Purpose**

Implement a hierarchical, scoped history management system to support undo/redo operations at multiple levels of content granularity within the CBL Studio, specifically:

* **Element internal editing session** (e.g., text input editing inside a text element)
* **Page scope** (layout, element styles, positioning, element-level commits)
* **Lesson scope** (ordering and metadata of pages)
* **Module scope** (ordering and metadata of lessons)
* **Course scope** (ordering and metadata of modules and course-wide settings)

This allows intuitive, context-aware undo/redo where undos cascade upward only when appropriate and never break user expectations.

---

## 2. **Key Concepts**

### 2.1 Scoped Histories

Each scope maintains its own **independent undo/redo stack** encapsulating changes at that level only.

| Scope                | Examples of changes tracked                           |
| -------------------- | ----------------------------------------------------- |
| **Element internal** | Text edits, caret moves, inline style changes         |
| **Page**             | Element position, size, style, element add/remove     |
| **Lesson**           | Page order, page metadata, lesson description changes |
| **Module**           | Lesson order, module metadata                         |
| **Course**           | Module order, course settings, global metadata        |

---

### 2.2 Editing Sessions

* An **internal editing session** starts when a user focuses on an element’s internal editor (e.g., focuses a text input inside a text element).
* All changes during this session are recorded **only in the element internal history**.
* The **page-level history is paused** during this time.

---

### 2.3 Commit on Blur

* When the user **blurs (unfocuses)** the internal editor, the entire internal editing session is **collapsed into a single atomic change**.
* This atomic change is then **committed to the page-level history stack** as a single action (e.g., `{ type: 'updateElement', id: 'abc123', changes: { content: "final text" } }`).
* The internal editing session history is then **discarded** to start fresh on next focus.

---

## 3. **Undo/Redo Behavior**

### 3.1 Scoped Undo

* Undo operates first on the **most specific scope currently active**.
* Example:

  * While editing text inside an element → undo reverts internal edits only.
  * Once internal edits are exhausted → undo falls back to page-level undo stack.
  * While manipulating page elements → undo affects page-level changes.
  * Once page-level changes are exhausted → **undo does NOT cascade to lesson-level**, because stage-level (page) editing is isolated.
  * While editing lesson metadata/order → undo affects lesson-level changes.
  * Once lesson-level changes are exhausted → undo cascades up to module-level, and similarly to course-level.

### 3.2 Cascading Rules Summary

| From Scope       | Undo cascade fallback scope | Notes                                   |
| ---------------- | --------------------------- | --------------------------------------- |
| Element internal | Page                        | Only after internal history exhausted   |
| Page             | None                        | No cascade to lesson                    |
| Lesson           | Module                      | Cascades after lesson history exhausted |
| Module           | Course                      | Cascades after module history exhausted |
| Course           | None                        | Top level                               |

---

## 4. **History Stack Model per Scope**

Each scope has a history stack structured as:

```ts
class ScopedHistory<T> {
  past: T[];     // Array of past states or diffs
  future: T[];   // Array of redoable states or diffs
  current: T;    // Current state
}
```

Operations:

* **commit(newState: T)**: Pushes current state to `past`, clears `future`, sets `current = newState`.
* **undo()**: Moves current state to `future`, pops last from `past` to `current`.
* **redo()**: Moves current state to `past`, pops last from `future` to `current`.
* **canUndo()**, **canRedo()** check stack availability.

---

## 5. **Undo Controller Logic**

Central undo controller manages scope selection and cascading:

```ts
function undo() {
  if (activeScope.canUndo()) {
    return activeScope.undo();
  }
  // Cascading logic based on scope:
  switch(activeScope) {
    case 'elementInternal':
      return pageHistory.undo();
    case 'page':
      // no cascade
      return null;
    case 'lesson':
      if (moduleHistory.canUndo()) return moduleHistory.undo();
      return null;
    case 'module':
      if (courseHistory.canUndo()) return courseHistory.undo();
      return null;
    case 'course':
      return null;
  }
}
```

---

## 6. **Autosave Integration**

* **Autosave runs per scope**, triggered after a commit at that scope.
* Internal editing sessions do not autosave continuously; instead:

  * Save ephemeral drafts locally for text editing (optional).
  * On blur, commit the session as a single page-level history entry and trigger page autosave.
* Higher scopes autosave after their respective commits.
* Autosave persists current state + optionally the `past` and `future` stacks to allow undo persistence after reload.

---

## 7. **Additional Notes**

* **History Size Limits**: Each scope should implement pruning to limit memory usage.
* **Branching Histories**: Can be added later to support alternate timelines but not required initially.
* **UI Feedback**: Undo/redo buttons and keyboard shortcuts should reflect the currently active scope and cascade behavior.
* **Collaboration**: Scoped history helps isolate changes by user/session and simplifies merging.

---

# Summary

| Scope            | History Stack | Undo cascade fallback | Autosave triggered on commit?  |
| ---------------- | ------------- | --------------------- | ------------------------------ |
| Element Internal | Yes           | Page                  | No (optional ephemeral drafts) |
| Page             | Yes           | None                  | Yes                            |
| Lesson           | Yes           | Module                | Yes                            |
| Module           | Yes           | Course                | Yes                            |
| Course           | Yes           | None                  | Yes                            |
