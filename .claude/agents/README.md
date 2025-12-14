# Agent Architecture

This project uses an orchestrator-worker pattern based on Anthropic's multi-agent research system design, with **atomic commits** and **senior dev review gates**.

## Roles

- **Human**: Final approval on all commits
- **Claude (Senior Dev)**: Reviews diffs, catches issues, coordinates agents
- **Agents**: Execute specialized tasks (research, plan, implement, test)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Human (You)                              │
│                    (approves each commit)                        │
├─────────────────────────────────────────────────────────────────┤
│                     Claude (Senior Dev)                          │
│              (reviews diffs, coordinates agents)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐   ┌─────────┐   ┌────────────┐   ┌────────┐     │
│   │researcher│ → │ planner │ → │implementer │ → │ tester │     │
│   └──────────┘   └─────────┘   └────────────┘   └────────┘     │
│        │              │              │               │          │
│        ▼              ▼              ▼               ▼          │
│   [findings]   [atomic commits]  [one commit    [tests]        │
│                    plan          at a time]                     │
│                                      │                          │
│                              ┌───────┴───────┐                  │
│                              │ Review Gate   │                  │
│                              │ (per commit)  │                  │
│                              └───────────────┘                  │
│                                                                  │
│                         ┌──────────┐                            │
│                         │ reviewer │                            │
│                         └──────────┘                            │
│                              │                                   │
│                              ▼                                   │
│                         [PR ready]                              │
└─────────────────────────────────────────────────────────────────┘

Utility Agents (called by implementer when needed):
├── doc-writer     → Technical documentation
└── ui-polisher    → UI polish and refinement
```

## Core Workflow Agents

### workflow-orchestrator
**Purpose:** Coordinates the full development lifecycle from issue to PR.

**Modes:**
- **AUTO** - Runs all phases continuously (simple issues)
- **STEP** - Pauses between phases for user approval (complex issues)

**Triggers:**
- "Work on issue #X"
- "Implement feature Y"
- "Step through issue #Z"

### researcher
**Purpose:** Gathers context before planning.

**Activities:**
- Analyzes codebase for relevant patterns
- Fetches library docs with Context7
- Identifies constraints and dependencies
- Produces structured findings for planner

### planner
**Purpose:** Creates atomic commit plans (not just steps).

**Outputs:**
- Implementation plan in `/docs/implementation-plan-issue-{N}.md`
- **Atomic commits** - each with: message, files, acceptance criteria
- Testing strategy
- Risk assessment

**Key principle:** Each commit is independently reviewable and leaves codebase working.

### implementer
**Purpose:** Builds features ONE COMMIT AT A TIME.

**Critical behavior:**
- Works on ONE atomic commit at a time
- **Does NOT commit directly** - returns diff for review
- Waits for senior dev approval before next commit

**Activities:**
- Implements single commit's scope
- Writes code following project patterns
- Uses TDD approach
- Returns diff to senior dev for review
- Delegates to utility agents when appropriate

### tester
**Purpose:** Writes and verifies tests.

**Activities:**
- Creates unit, integration, and E2E tests
- Runs full test suite
- Verifies coverage
- Fixes failing tests

### reviewer
**Purpose:** Validates code is production-ready.

**Checks (run in parallel):**
- Code quality and readability
- Schema alignment (types match DB)
- Unused code detection
- Documentation sync
- Correctness verification (spec compliance, data lifecycle)

**Behavior:** Auto-fixes Critical/High issues, reports Medium/Low.

## Utility Agents

### doc-writer
**Purpose:** Creates technical documentation.
**Use when:** Need deployment guides, API docs, architecture docs.

### ui-polisher
**Purpose:** Handles UI polish tasks.
**Use when:** Need responsive fixes, animations, loading states.

## Execution Modes

### Atomic Commit Flow (Default)
```
Issue → Research → Plan (atomic commits) → Implement → Test → Review → PR
                          ↓
                   For each commit:
                   ┌─────────────────────────────────┐
                   │ 1. Implementer makes changes    │
                   │ 2. Senior dev reviews diff      │
                   │ 3. Commit if approved           │
                   │ 4. Next commit                  │
                   └─────────────────────────────────┘
```

### Why Atomic Commits?
- **Catch issues early** - Before they compound
- **Easier review** - Smaller changes are easier to understand
- **Natural checkpoints** - Course correct at any point
- **Clean git history** - Each commit is meaningful and revertable

## Usage Examples

### Full Workflow
```
User: "Work on issue #42"

→ Orchestrator fetches issue, assesses complexity
→ Research phase
→ Plan phase (outputs atomic commits)
→ Implement phase:
    Commit 1: Implementer → diff → Senior dev reviews → commit
    Commit 2: Implementer → diff → Senior dev reviews → commit
    ... (repeat for each commit)
→ Test phase
→ Review phase
→ PR created
```

### Direct Agent Use
```
User: "Research how auth works in this codebase"
→ Use researcher agent directly

User: "Write tests for the photo upload feature"
→ Use tester agent directly

User: "Review my recent changes"
→ Use reviewer agent directly
```

## Design Principles

Based on [Anthropic's multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system):

### 1. Orchestrator-Worker Pattern
Lead agent coordinates while specialized workers handle subtasks.

### 2. Synchronous Execution
Each phase completes before the next begins, with clear handoffs.

### 3. Context Management
Each agent gets relevant context via summaries, not full history.

### 4. Effort Scaling
Simple issues: minimal research, quick implementation.
Complex issues: deep research, detailed planning, comprehensive testing.

### 5. Explicit Task Decomposition
Each phase has clear: objectives, inputs, outputs, and handoff format.

## Agent Files

```
.claude/agents/
├── README.md              # This file
├── workflow-orchestrator.md  # Main coordinator
├── researcher.md          # Context gathering
├── planner.md            # Implementation planning
├── implementer.md        # Feature building
├── tester.md             # Test writing & verification
├── reviewer.md           # Code review & validation
├── doc-writer.md         # Documentation utility
└── ui-polisher.md        # UI polish utility
```

## Performance Characteristics

| Agent | Typical Duration | Token Usage | When to Use |
|-------|------------------|-------------|-------------|
| workflow-orchestrator | 10-30 min | High | Full issue lifecycle |
| researcher | 2-5 min | Medium | Before planning |
| planner | 3-7 min | Medium | After research |
| implementer | 5-15 min | High | After planning |
| tester | 3-8 min | Medium | After implementation |
| reviewer | 2-5 min | Medium | Before PR |
| doc-writer | 3-6 min | Medium | Documentation needs |
| ui-polisher | 4-8 min | Medium | UI polish needs |

## Migration from Previous Architecture

Previous agents merged into new structure:

| Old Agent | New Location |
|-----------|--------------|
| feature-planner | researcher + planner |
| feature-implementer | implementer |
| test-writer | tester |
| test-verifier | tester |
| pr-manager | workflow-orchestrator |
| schema-validator | reviewer |
| unused-code-detector | reviewer |
| doc-syncer | reviewer |
| code-reviewer | reviewer |

---

**Version:** 2.0
**Last Updated:** December 2025
**Based on:** [Anthropic's Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
