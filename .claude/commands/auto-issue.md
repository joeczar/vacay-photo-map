# /auto-issue $ARGUMENTS

Execute fully autonomous issue-to-PR workflow for issue #$ARGUMENTS.

**Mode:** Autonomous - no gates, auto-fix enabled, escalation only on failure
**Rules:** See `.claude/rules/auto-issue-rules.md`
**Classification:** See `.claude/shared/finding-classification.md`
**Break-glass:** See `.claude/shared/break-glass-commands.md`

---

## Quick Reference

```bash
/auto-issue 123                  # Fully autonomous (default)
/auto-issue 123 --dry-run        # Research only, show plan, don't implement
/auto-issue 123 --require-tests  # Fail if tests don't pass
/auto-issue 123 --force-pr       # Create PR even with unresolved issues
/auto-issue 123 --abort-on-fail  # Abort if auto-fix fails
/auto-issue 123 --sequential     # Run review agents sequentially
```

---

## Configuration

| Limit | Default | Description |
|-------|---------|-------------|
| `MAX_RETRY` | 3 | Max fix attempts per CRITICAL finding |
| `MAX_FIX_COMMITS` | 10 | Max total fix commits |
| `MAX_ESCALATIONS` | 2 | Max escalations before force-abort |

---

## Workflow Overview

```
PHASE 1: Setup       → Validate issue, create branch
PHASE 2: Research    → Gather context, create plan
PHASE 3: Implement   → Execute plan with atomic commits
PHASE 4: Review      → Batch review + auto-fix loop
PHASE 5: Finalize    → Validate, push, create PR
ESCALATION           → Only if auto-fix fails MAX_RETRY times
```

---

## Phase 1: Setup

1. **Validate input:**
   ```bash
   if ! [[ "$ARGUMENTS" =~ ^[0-9]+$ ]]; then
     echo "[AUTO-ISSUE] ERROR: Invalid issue number: $ARGUMENTS"
     exit 1
   fi
   ```

2. **Spawn `setup-agent`:**
   ```yaml
   INPUT:
     issue_number: $ARGUMENTS
   ```

3. **Handle result:**
   - `status: "ready"` → proceed
   - `status: "blocked"` → WARN but continue (log blockers)
   - `status: "error"` → abort with message

4. **Check for break-glass commands**

---

## Phase 2: Research & Planning

5. **Spawn `researcher` agent:**
   ```yaml
   INPUT:
     issue_number: $ARGUMENTS
     issue_title: {from setup}
     issue_body: {from setup}
     labels: {from setup}
   ```

6. **Spawn `planner` agent:**
   ```yaml
   INPUT:
     issue_number: $ARGUMENTS
     issue_title: {from setup}
     research_findings: {from researcher}
   ```

7. **If `--dry-run`:** Show plan, exit.

8. **Check for break-glass commands**

---

## Phase 3: Implementation

9. **For each commit in plan:**

   a. **Spawn `implementer` agent:**

      Use the Task tool to spawn implementer with the current commit spec.

      ```yaml
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

   b. **On success:** Commit changes (no gate)

   c. **On error:** Log and continue if possible, escalate if fatal

10. **Run validation:**
    ```bash
    pnpm type-check && pnpm lint
    ```
    - If fails: Attempt inline fix (up to 3 times)
    - If still fails: Proceed to review (will be caught there)

11. **Check for break-glass commands**

---

## Phase 4: Review + Auto-Fix Loop

12. **Spawn `review-orchestrator`:**
    ```yaml
    INPUT:
      changed_files: {all files modified}
      issue_number: $ARGUMENTS
      max_retry: 3        # Or from flags
      max_fix_commits: 10
    ```

    The review-orchestrator will:
    - Launch review agents in parallel:
      - `pr-review-toolkit:code-reviewer`
      - `pr-review-toolkit:pr-test-analyzer`
      - `pr-review-toolkit:silent-failure-hunter`
    - Classify findings (CRITICAL vs NON-CRITICAL)
    - Run auto-fix loop for CRITICAL findings
    - Return summary

13. **Handle review-orchestrator result:**

    - `status: "clean"` → proceed to Phase 5
    - `status: "fixed"` → proceed to Phase 5
    - `status: "escalate"` → show escalation report

14. **If escalation:**
    ```
    ## AUTO-ISSUE ESCALATION REQUIRED

    Issue: #$ARGUMENTS - {title}
    Branch: {branch}
    Trigger: {reason}

    ### Unresolved Findings
    | # | Agent | File | Issue | Attempts |
    |---|-------|------|-------|----------|
    {table}

    ### Your Options
    1. Fix manually → 'continue'
    2. Create PR with issues → 'force-pr'
    3. Cancel → 'abort'
    4. Reset and retry → 'reset'
    ```

15. **Handle escalation response:**
    - `continue` → verify fixes, re-run review-orchestrator
    - `force-pr` → proceed to Phase 5 with `force: true`
    - `abort` → clean up, exit
    - `reset` → reset to last good commit, retry Phase 4

---

## Phase 5: Finalization

16. **Spawn `finalize-agent`:**
    ```yaml
    INPUT:
      issue_number: $ARGUMENTS
      branch_name: {from setup}
      issue_title: {from setup}
      findings_summary: {from review-orchestrator}
      advisory: {non-critical findings}
      commit_count: {total commits}
      force: {true if force-pr}
    ```

17. **Handle result:**
    - `status: "success"` → report completion
    - `status: "validation_failed"` → escalate
    - `status: "error"` → escalate

18. **Report completion:**
    ```
    AUTO-ISSUE COMPLETE

    Issue: #$ARGUMENTS
    Branch: {branch_name}
    Commits: {N} implementation + {M} fixes
    PR: {pr_url}

    Check PR for feedback.
    ```

---

## Break-Glass Commands

The orchestrator checks for these between phases:

| Command | Effect |
|---------|--------|
| `stop` | Halt, show status, wait |
| `pause` | Same as stop |
| `abort` | Clean up, delete branch, exit |
| `continue` | Resume after manual fix |
| `force-pr` | Create PR with issues flagged |
| `reset` | Reset to last good commit |
| `skip review` | Skip review phase, go to finalize |

See `.claude/shared/break-glass-commands.md` for behaviors.

---

## Escalation Triggers

Escalate when:

1. **MAX_RETRY exceeded** - Same CRITICAL finding persists after 3 fix attempts
2. **MAX_FIX_COMMITS exceeded** - Total fix commits reaches 10
3. **Validation fails after fix** - Type-check/lint fails
4. **Agent failure** - Any agent returns error
5. **Git errors** - Conflict, push rejected

See `.claude/shared/escalation-patterns.md` for report format.

---

## Flag Behaviors

| Flag | Behavior |
|------|----------|
| `--dry-run` | Stop after Phase 2, show plan |
| `--require-tests` | Make test failures a hard blocker |
| `--force-pr` | On escalation, auto-select force-pr |
| `--abort-on-fail` | On escalation, auto-select abort |
| `--sequential` | Run review agents one at a time |

---

## Error Handling

### Issue Not Found
```
[AUTO-ISSUE] ERROR: Issue #$ARGUMENTS not found. Aborting.
```

### Branch Already Exists
```
[AUTO-ISSUE] WARNING: Branch exists. Checking out existing branch.
```

### Agent Failure
- Log the failure
- Continue with remaining agents if possible
- If all agents fail: ESCALATE

### Git Conflicts
- STOP immediately
- Report conflict details
- Wait for user guidance
- Do NOT auto-resolve

---

## Agents Used

| Agent | Purpose | Phase |
|-------|---------|-------|
| `setup-agent` | Validate, create branch | 1 |
| `researcher` | Analyze codebase | 2 |
| `planner` | Create dev plan | 2 |
| `implementer` | Execute commits | 3 |
| `review-orchestrator` | Batch review + auto-fix | 4 |
| `finalize-agent` | Validate, push, create PR | 5 |

---

## Success Criteria

Workflow is successful when:
- All planned commits implemented
- All CRITICAL findings resolved (or user-approved)
- PR created with proper body
- User informed of PR URL

---

## Comparison: /auto-issue vs /work-on-issue

| Aspect | /auto-issue | /work-on-issue |
|--------|-------------|----------------|
| Gates | None (escalation only) | 4 hard gates |
| User approval | Only on failure | Every phase |
| Speed | Fast (autonomous) | Slow (manual) |
| Control | Low during execution | High throughout |
| Best for | Simple, clear issues | Complex, uncertain work |
| Learning | Not ideal | Good for understanding |
