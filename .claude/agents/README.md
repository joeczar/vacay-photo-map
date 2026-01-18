# Agent Architecture

This project uses an orchestrator-worker pattern. **Claude (main) is the orchestrator**, worker agents handle focused tasks.

## Key Insight

Subagents cannot stop mid-task and wait for approval. They complete their task and return.

Therefore: **Claude (main) handles the gates**, worker agents do focused work.

## Roles

- **Human**: Approves at each gate
- **Claude (Main)**: Orchestrates workflow, handles gates, spawns workers
- **Worker Agents**: Execute focused tasks (research, plan, implement, test)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Human (You)                              │
│                    (approves at each gate)                       │
├─────────────────────────────────────────────────────────────────┤
│                     Claude (Main)                                │
│              THE ORCHESTRATOR - handles gates                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   /work-on-issue 60                                             │
│           │                                                      │
│           ▼                                                      │
│   ╔═══════════════════╗                                         │
│   ║  GATE 1: Issue    ║  ← Claude shows full issue              │
│   ║  (you review)     ║                                         │
│   ╚═════════╤═════════╝                                         │
│             ▼                                                    │
│   ┌──────────┐   ┌─────────┐                                    │
│   │researcher│ → │ planner │  (worker agents)                   │
│   └──────────┘   └────┬────┘                                    │
│                       ▼                                          │
│   ╔═══════════════════╗                                         │
│   ║  GATE 2: Plan     ║  ← Claude shows full plan               │
│   ║  (you review)     ║                                         │
│   ╚═════════╤═════════╝                                         │
│             ▼                                                    │
│   ┌────────────────────────────────────────┐                    │
│   │  For each atomic commit:               │                    │
│   │    ┌────────────┐                      │                    │
│   │    │implementer │ → diff               │                    │
│   │    └────────────┘                      │                    │
│   │           ▼                            │                    │
│   │   ╔═══════════════════╗                │                    │
│   │   ║  GATE 3: Commit   ║ ← You review   │                    │
│   │   ╚═══════════════════╝                │                    │
│   └────────────────────────────────────────┘                    │
│             ▼                                                    │
│   ┌────────┐   ┌──────────┐   ┌──────────────────┐              │
│   │ tester │ → │ reviewer │ → │ pr-review-toolkit│ → PR         │
│   └────────┘   └──────────┘   └──────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## Triggering the Workflow

Use the slash command:

```
/work-on-issue 60
```

This expands to a prompt that guides Claude through the gated workflow.

## Worker Agents

These are subagents that do focused work and return results:

### setup-agent
**Purpose:** Issue setup and branch creation.
- Validates issue exists
- Checks for blockers
- Creates feature branch
- Updates project board
- Returns issue details and branch name

### researcher
**Purpose:** Gathers context before planning.
- Analyzes codebase for relevant patterns
- Fetches library docs with Context7
- Identifies constraints and dependencies
- Returns structured findings

### planner
**Purpose:** Creates atomic commit plans.
- Writes plan to `/docs/plans/issue-{N}.md`
- Each commit: message, files, acceptance criteria
- Returns when plan file is written

### implementer
**Purpose:** Implements ONE commit.
- Works on single atomic commit
- Does NOT commit - returns diff
- Follows TDD approach

### tester
**Purpose:** Writes and runs tests.
- Creates unit, integration, E2E tests
- Runs full test suite
- Audits test infrastructure in review mode
- Returns test results

### reviewer
**Purpose:** Validates code quality (project-specific).
- Schema alignment (types match DB)
- API integration (client calls correct endpoints)
- Auth flows (guards check correct meta)
- Unused code detection
- Auto-fixes Critical/High issues
- Returns findings

### review-orchestrator
**Purpose:** Coordinates parallel reviews and auto-fix loop.
- Spawns code-reviewer, pr-test-analyzer, silent-failure-hunter
- Classifies findings as CRITICAL vs NON-CRITICAL
- Runs auto-fix loop (up to MAX_RETRY per finding)
- Returns summary with fixed/unresolved counts

### finalize-agent
**Purpose:** Final validation and PR creation.
- Runs final validation (tests, type-check, lint)
- Cleans up plan files
- Pushes branch and creates PR
- Updates project board
- Returns PR URL

### doc-writer (utility)
**Purpose:** Technical documentation.
Use for deployment guides, API docs, architecture docs.

### ui-polisher (utility)
**Purpose:** UI polish work.
Use for responsive fixes, animations, loading states.

## Review Tools: Custom vs Plugin

This project uses **two complementary review tools**:

### Custom `reviewer` Agent
Project-specific validation that knows this codebase:
- Schema alignment (types match database exactly)
- API integration (client calls correct endpoints)
- Auth flows (guards check correct route meta)
- Unused code detection
- Auto-fixes Critical/High issues

**Use for:** Every PR, catches project-specific issues.

### `pr-review-toolkit` Plugin
General-purpose PR review with 6 specialized agents:
- `code-reviewer` - CLAUDE.md compliance, bugs, style
- `pr-test-analyzer` - Test coverage and gaps
- `comment-analyzer` - Documentation accuracy
- `silent-failure-hunter` - Error handling issues
- `type-design-analyzer` - Type quality and invariants
- `code-simplifier` - Complexity reduction

**Use for:** Thorough review, run `/pr-review-toolkit:review-pr`.

### Review Workflow

```
Code Complete → Custom Reviewer → Tests Pass → PR-Review-Toolkit → Create PR
```

1. **Custom reviewer** catches project-specific issues (schema, API, auth)
2. **pr-review-toolkit** does comprehensive quality checks

## Direct Agent Use

You can use worker agents directly for focused tasks:

```
"Research how auth works"     → researcher
"Write tests for uploads"     → tester
"Review my changes"           → reviewer (project-specific)
"Review PR for quality"       → /pr-review-toolkit:review-pr (comprehensive)
"Polish the mobile UI"        → ui-polisher
```

## Why This Architecture?

Based on [Anthropic's research](https://www.anthropic.com/engineering/claude-code-best-practices):

1. **Subagents can't pause** - They complete tasks and return
2. **Gates need the main agent** - Only Claude (main) can show output and wait
3. **Workers should be focused** - One clear goal, input, output
4. **Context is preserved** - Main Claude sees everything, workers get summaries

## Agent Files

```
.claude/agents/
├── README.md              # This file
├── setup-agent.md         # Issue setup, branch creation
├── researcher.md          # Context gathering
├── planner.md             # Implementation planning
├── implementer.md         # Feature building (one commit)
├── tester.md              # Test writing & verification
├── reviewer.md            # Code review & validation
├── review-orchestrator.md # Parallel reviews + auto-fix loop
├── finalize-agent.md      # PR creation & cleanup
├── doc-writer.md          # Documentation utility
└── ui-polisher.md         # UI polish utility

.claude/commands/
├── work-on-issue.md       # Slash command for gated workflow
└── auto-issue.md          # Slash command for autonomous workflow

.claude/shared/
├── finding-classification.md  # CRITICAL vs NON-CRITICAL rules
├── escalation-patterns.md     # When/how to escalate
└── break-glass-commands.md    # Emergency user commands

.claude/rules/
├── gate-workflow.md       # Gate rules for /work-on-issue
└── auto-issue-rules.md    # Limits & triggers for /auto-issue
```

---

**Version:** 4.0
**Last Updated:** January 2026

### Changelog (v4.0)
- Added `setup-agent` for issue validation and branch creation
- Added `review-orchestrator` for parallel reviews and auto-fix loop
- Added `finalize-agent` for PR creation and cleanup
- Added INPUT/OUTPUT/ERROR contracts to all agents
- Added `.claude/shared/` for cross-cutting patterns
- Added `.claude/rules/gate-workflow.md` and `auto-issue-rules.md`
- Updated `/work-on-issue` and `/auto-issue` to use new agents
