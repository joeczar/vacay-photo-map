# Agent Usage in Workflows

**Applies to:** `/work-on-issue`, `/auto-issue`

<agent_workflow>
Each phase of the workflow uses a specialized agent. Spawn the designated
agent for each phase rather than performing the work directly.

| Phase | Agent | Purpose |
|-------|-------|---------|
| Research | researcher | Gathers codebase context and patterns |
| Planning | planner | Creates atomic commit plan |
| Implementation | implementer | Executes commits with diff preparation |
| Review | tester, reviewer | Validates quality before PR |
| Finalization | finalize-agent | Creates PR with proper body |

<why>
Agents provide consistent execution patterns, proper diff preparation for
gates, atomic commit workflow, and quality enforcement at each phase.
The orchestrator coordinates agents and handles gates - agents do the work.
</why>
</agent_workflow>

## Role Separation

**Orchestrator (you) responsibilities:**
- Fetch issue details and show gates
- Coordinate agent spawning in sequence
- Present agent outputs for user review
- Handle break-glass commands
- Create commits after approval

**Agent responsibilities:**
- Perform focused, phase-specific work
- Return results to orchestrator
- Prepare diffs and summaries
- Validate their own output before returning

## Implementation Phase

For implementation, spawn the `implementer` agent for each commit:

```yaml
Task(implementer):
  INPUT:
    issue_number: $ARGUMENTS
    commit_number: {N}
    total_commits: {M}
    plan_file: docs/plans/issue-$ARGUMENTS.md
    branch_name: {from setup}
```

<why>
The implementer agent ensures consistent commit-by-commit execution,
proper diff preparation for review, and adherence to project patterns.
Spawning implementer rather than editing directly keeps the workflow
predictable and reviewable.
</why>

## When to Spawn vs. Do Directly

**Spawn an agent when:**
- The task matches a workflow phase (research, plan, implement, test, review)
- The work requires multiple file changes
- The output needs structured formatting for gates

**Do directly when:**
- Simple orchestration tasks (showing gates, waiting for input)
- Git operations after approval
- Single-line fixes suggested by user
