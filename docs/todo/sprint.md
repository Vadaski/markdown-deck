# Sprint Board

> Last updated: 2026-02-26 by VA Auto-Pilot
> Generated from `.va-auto-pilot/sprint-state.json` via `node scripts/sprint-board.mjs render`.
>
> Rules:
> - Machine source of truth: `.va-auto-pilot/sprint-state.json`
> - Human-readable projection: `docs/todo/sprint.md`
> - One primary task at a time in `In Progress`; independent tracks may run in parallel
> - Task ID format: `MARK-{3-digit number}`
> - Priority: P0(blocking) / P1(important) / P2(routine) / P3(optimization)
>
> State flow:
> ```
> Backlog -> In Progress -> Review -> Testing -> Done
>                  ^                     |
>                  +------ Failed <------+
> ```

---

## In Progress
| ID | Task | Owner | Started | Notes |
|----|------|-------|---------|-------|
| - | - | - | - | - |

## Failed
| ID | Task | Fail Count | Reason | Last Failed |
|----|------|------------|--------|-------------|
| - | - | - | - | - |

## Review
| ID | Task | Implementer | Security | QA | Domain | Architect |
|----|------|-------------|----------|----|--------|-----------|
| - | - | - | - | - | - | - |

## Testing
| ID | Task | Test Flow | MUST Pass Rate | SHOULD Pass Rate |
|----|------|-----------|----------------|------------------|
| - | - | - | - | - |

## Done
| ID | Task | Completed | Verification |
|----|------|-----------|--------------|
| - | - | - | - |

## Backlog
| Priority | ID | Task | Depends On | Owner | Source |
|----------|----|------|------------|-------|--------|
| P0 | MARK-003 | Configure GitHub Pages deployment (base path + workflow) | - | - | - |
| P0 | MARK-004 | Fix any TypeScript errors and ensure clean build | - | - | - |
| P1 | MARK-001 | Replace with your first deliverable | - | VA Auto-Pilot | bootstrap |
| P1 | MARK-002 | Polish UI/UX per human board instructions | - | - | - |
| P1 | MARK-005 | Add compelling demo content and sample data | - | - | - |
