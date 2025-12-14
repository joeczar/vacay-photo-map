# Work on Issue $ARGUMENTS

Execute the gated workflow for issue #$ARGUMENTS.

## GATE 1: Show Issue

1. Fetch the issue: `gh issue view $ARGUMENTS`
2. Show the COMPLETE issue to the user (verbatim, do not summarize)
3. STOP and wait for user to say "proceed" or give feedback

## After Gate 1 Approval: Research & Plan

4. Spawn `researcher` agent to gather codebase context
5. Spawn `planner` agent to create implementation plan in `/docs/implementation-plan-issue-$ARGUMENTS.md`

## GATE 2: Show Plan

6. Read the plan file with the Read tool
7. Show the COMPLETE plan to the user (every line, do not summarize)
8. STOP and wait for user to say "proceed" or give feedback

## After Gate 2 Approval: Implement

9. Create feature branch: `git checkout -b feature/issue-$ARGUMENTS-{description}`
10. For each atomic commit in the plan:
    - Spawn `implementer` agent for that commit
    - Show the diff to the user (GATE 3)
    - Wait for approval
    - Commit the changes

## Finalization

11. Spawn `tester` agent to write and run tests
12. Spawn `reviewer` agent to validate quality
13. Create PR with `gh pr create`

---

**CRITICAL**: Do not proceed past any GATE without explicit user approval.
