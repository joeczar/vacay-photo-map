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
│   ┌────────┐   ┌──────────┐                                     │
│   │ tester │ → │ reviewer │ → PR                                │
│   └────────┘   └──────────┘                                     │
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

### researcher
**Purpose:** Gathers context before planning.
- Analyzes codebase for relevant patterns
- Fetches library docs with Context7
- Identifies constraints and dependencies
- Returns structured findings

### planner
**Purpose:** Creates atomic commit plans.
- Writes plan to `/docs/implementation-plan-issue-{N}.md`
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
- Returns test results

### reviewer
**Purpose:** Validates code quality.
- Code quality checks
- Schema alignment
- Unused code detection
- Returns findings

### doc-writer (utility)
**Purpose:** Technical documentation.
Use for deployment guides, API docs, architecture docs.

### ui-polisher (utility)
**Purpose:** UI polish work.
Use for responsive fixes, animations, loading states.

## Direct Agent Use

You can use worker agents directly for focused tasks:

```
"Research how auth works"     → researcher
"Write tests for uploads"     → tester
"Review my changes"           → reviewer
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
├── researcher.md          # Context gathering
├── planner.md             # Implementation planning
├── implementer.md         # Feature building (one commit)
├── tester.md              # Test writing & verification
├── reviewer.md            # Code review & validation
├── doc-writer.md          # Documentation utility
└── ui-polisher.md         # UI polish utility

.claude/commands/
└── work-on-issue.md       # Slash command for gated workflow
```

---

**Version:** 3.0
**Last Updated:** December 2025
