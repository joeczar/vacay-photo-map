# Agent Architecture

This project uses an orchestrator-worker pattern based on Anthropic's multi-agent research system design.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    workflow-orchestrator                         │
│         (coordinates full Issue → PR lifecycle)                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────┐   ┌─────────┐   ┌────────────┐   ┌────────┐     │
│   │researcher│ → │ planner │ → │implementer │ → │ tester │     │
│   └──────────┘   └─────────┘   └────────────┘   └────────┘     │
│        │              │              │               │          │
│        ▼              ▼              ▼               ▼          │
│   [findings]     [plan.md]       [code]          [tests]       │
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
**Purpose:** Creates detailed implementation plans.

**Outputs:**
- Implementation plan in `/docs/implementation-plan-issue-{N}.md`
- Step-by-step instructions
- Testing strategy
- Risk assessment

### implementer
**Purpose:** Builds features by executing plans.

**Activities:**
- Follows plan steps in order
- Writes code following project patterns
- Uses TDD approach
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

### AUTO Mode (Default for simple issues)
```
Issue → Research → Plan → Implement → Test → Review → PR
         ↓          ↓          ↓          ↓         ↓
      (continuous, no pauses between phases)
```

### STEP Mode (Default for complex issues)
```
Issue → Research → [PAUSE] → Plan → [PAUSE] → Implement → [PAUSE] → ...
                      ↑              ↑                        ↑
                 (user approval required to continue)
```

## Usage Examples

### Full Workflow (AUTO)
```
User: "Work on issue #42"
→ Orchestrator fetches issue, assesses complexity
→ Research → Plan → Implement → Test → Review → PR
→ Returns PR URL
```

### Full Workflow (STEP)
```
User: "Step through issue #15"
→ Orchestrator fetches issue
→ Research → [pause for approval]
→ Plan → [pause for approval]
→ ... → PR
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
