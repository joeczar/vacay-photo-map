# /auto-issue $ARGUMENTS

Execute fully autonomous issue-to-PR workflow for issue #$ARGUMENTS.

**Mode:** Autonomous - no gates, auto-fix enabled, escalation only on MAX_RETRY exceeded

---

## Quick Reference

```bash
/auto-issue 123                  # Fully autonomous (default)
/auto-issue 123 --dry-run        # Research only, show plan, don't implement
/auto-issue 123 --require-tests  # Fail if tests don't pass
/auto-issue 123 --force-pr       # Create PR even with unresolved issues
/auto-issue 123 --abort-on-fail  # Abort if auto-fix fails
/auto-issue 123 --sequential     # Run review agents sequentially (slower, easier debug)
```

---

## Configuration

| Setting           | Default  | Description                                       |
| ----------------- | -------- | ------------------------------------------------- |
| `MAX_RETRY`       | 3        | Max auto-fix attempts per critical finding        |
| `MAX_FIX_COMMITS` | 10       | Max total fix commits before escalation           |
| `REQUIRE_TESTS`   | false    | Fail if tests don't pass (use `--require-tests`)  |
| `ESCALATION`      | wait     | Default escalation behavior (wait/force-pr/abort) |
| `REVIEW_MODE`     | parallel | Run reviews parallel or sequential                |

---

## Workflow Overview

```
PHASE 1: Research    → Fetch issue, create dev plan (NO GATE)
PHASE 2: Implement   → Execute plan with atomic commits (NO GATE)
PHASE 3: Review      → Batch review + auto-fix loop
PHASE 4: Finalize    → Create PR (NO GATE)
ESCALATION           → Only if auto-fix fails MAX_RETRY times
```

**Key Difference from `/work-on-issue`:** No human gates. The workflow proceeds autonomously unless critical issues cannot be resolved.

---

## Phase 1: Research (Autonomous)

0. **Validate input:**

   ```bash
   # Ensure $ARGUMENTS is a valid issue number
   if ! [[ "$ARGUMENTS" =~ ^[0-9]+$ ]]; then
     echo "[AUTO-ISSUE] ERROR: Invalid issue number: $ARGUMENTS"
     echo "[AUTO-ISSUE] Usage: /auto-issue <issue-number>"
     exit 1
   fi
   ```

1. **Fetch issue details:**

   ```bash
   gh issue view $ARGUMENTS --json number,title,body,labels,milestone,assignees
   ```

2. **Check for blockers:**

   ```bash
   gh issue view $ARGUMENTS --json body | grep -iE "blocked by|depends on"
   ```

   - If blockers found: **WARN but continue** (unlike /work-on-issue which stops)
   - Log: "Warning: Issue has blockers - proceeding anyway"

3. **Create feature branch:**

   ```bash
   git checkout -b feat/issue-$ARGUMENTS-{short-description}
   ```

4. **Spawn `researcher` agent:**
   - Analyze codebase
   - Find relevant patterns and files
   - Assess complexity

5. **Spawn `planner` agent:**
   - Create dev plan at `docs/plans/issue-$ARGUMENTS.md`
   - Break work into atomic commits
   - Define testing strategy

6. **If `--dry-run`:** Stop here, show plan, exit.

---

## Phase 2: Implement (Autonomous)

7. **Execute plan commits:**
   - Read the plan from `docs/plans/issue-$ARGUMENTS.md`
   - Implement each commit per plan
   - Each commit is atomic and buildable

8. **On completion, run validation:**

   ```bash
   pnpm type-check && pnpm lint
   ```

   - If validation fails: Attempt to fix inline, then continue
   - If still fails: Log and proceed to review (reviewer will catch it)

---

## Phase 3: Review + Auto-Fix Loop

### 3a. Batch Review (Parallel by Default)

9. **Launch review agents in parallel:**

    ```
    - pr-review-toolkit:code-reviewer
    - pr-review-toolkit:pr-test-analyzer
    - pr-review-toolkit:silent-failure-hunter
    ```

10. **Collect and classify findings:**

### 3b. Finding Classification

| Agent                  | CRITICAL if                          | NON-CRITICAL if          |
| ---------------------- | ------------------------------------ | ------------------------ |
| code-reviewer          | Confidence >= 91 OR label="Critical" | Confidence < 91          |
| silent-failure-hunter  | Severity="CRITICAL"                  | Severity="HIGH"/"MEDIUM" |
| pr-test-analyzer       | Gap rating >= 8                      | Gap rating < 8           |

### 3c. Auto-Fix Loop

```
retry_count = 0
fix_commit_count = 0

while has_critical_findings AND retry_count < MAX_RETRY:
    for each critical_finding:
        if fix_commit_count >= MAX_FIX_COMMITS:
            ESCALATE("Max fix commits reached")
            break

        attempt to fix the finding

        if fix successful:
            fix_commit_count++
        else:
            log failure

    # Re-review after fixes
    run review agents again
    classify findings
    retry_count++

if has_critical_findings:
    ESCALATE_TO_HUMAN()
else:
    PROCEED_TO_PHASE_4()
```

---

## Phase 4: Finalize (Autonomous)

11. **Run final validation:**

    ```bash
    pnpm test && pnpm type-check && pnpm lint
    ```

    - If `--require-tests` and tests fail: ESCALATE
    - If build fails: ESCALATE
    - Otherwise: Proceed

12. **Clean up dev-plan file:**

    ```bash
    rm docs/plans/issue-$ARGUMENTS.md
    git add docs/plans/
    git commit -m "chore: clean up dev-plan for issue #$ARGUMENTS"
    ```

13. **Push branch:**

    ```bash
    git push -u origin HEAD
    ```

14. **Create PR:**

    ```bash
    gh pr create --title "<type>(<scope>): <description> (#$ARGUMENTS)" --body "..."
    ```

    PR body includes:
    - Summary from dev plan
    - Non-critical findings (for reviewer awareness)
    - Auto-fix log (if any fixes were applied)
    - Footer: `Closes #$ARGUMENTS`

15. **Report completion:**

    ```
    AUTO-ISSUE COMPLETE

    Issue: #$ARGUMENTS
    Branch: feat/issue-$ARGUMENTS-<desc>
    Commits: N implementation + M fixes
    PR: https://github.com/.../pull/XXX

    Check PR for feedback.
    ```

---

## Escalation Handling

### When Escalation Triggers

1. Same critical finding persists after `MAX_RETRY` (3) attempts
2. Type-check or lint fails after fix attempt
3. Tests fail (if `--require-tests` set)
4. Build fails
5. Review agent fails to execute
6. `MAX_FIX_COMMITS` (10) exceeded

### Escalation Report Format

```markdown
## AUTO-ISSUE ESCALATION REQUIRED

**Issue:** #$ARGUMENTS - <title>
**Branch:** feat/issue-$ARGUMENTS-<desc>
**Retry Count:** 3/3

### Critical Findings (Unresolved)

| #   | Agent                 | File          | Issue              | Fix Attempts         |
| --- | --------------------- | ------------- | ------------------ | -------------------- |
| 1   | code-reviewer         | src/foo.ts:42 | Missing null check | 3 - all failed       |
| 2   | silent-failure-hunter | src/bar.ts:89 | Silent catch block | 2 - validation error |

### Fix Attempt Log

**Attempt 1 (src/foo.ts:42):**

- Applied: Added optional chaining
- Result: FAILED - Type error: cannot use ?. on required property

**Attempt 2 (src/foo.ts:42):**

- Applied: Added explicit null check
- Result: FAILED - Lint error: prefer optional chaining

**Attempt 3 (src/foo.ts:42):**

- Applied: Combined approach with type narrowing
- Result: FAILED - Test failure: expected null to throw

### Your Options

1. **Fix manually** - Make the fix yourself, then type `continue`
2. **Force PR** - Type `force-pr` to create PR with issues flagged
3. **Abort** - Type `abort` to delete branch and exit
4. **Reset** - Type `reset` to go back to last good state and retry
```

### Escalation Flag Behaviors

| Flag              | Behavior on Escalation                                                     |
| ----------------- | -------------------------------------------------------------------------- |
| (default)         | Show report, wait for input                                                |
| `--force-pr`      | Create PR with `## UNRESOLVED ISSUES` section, add `needs-attention` label |
| `--abort-on-fail` | Delete branch, report failure, exit                                        |

---

## Break Glass: User Intervention

The user can intervene at ANY time by typing in the chat:

| Input             | Action                                            |
| ----------------- | ------------------------------------------------- |
| `stop` or `pause` | Halt workflow, show current status                |
| `skip review`     | Skip remaining review, go straight to PR creation |
| `abort`           | Clean up (delete branch), exit                    |
| `continue`        | Resume after manual fix (during escalation)       |
| `force-pr`        | Force PR creation (during escalation)             |
| `reset`           | Reset to last good commit, retry                  |

Between phases, the orchestrator checks for user input. If detected, handle appropriately.

---

## Comparison: /auto-issue vs /work-on-issue

| Aspect        | /auto-issue            | /work-on-issue          |
| ------------- | ---------------------- | ----------------------- |
| Gates         | None (escalation only) | 4 hard gates            |
| User approval | Only on failure        | Every phase             |
| Speed         | Fast (autonomous)      | Slow (manual)           |
| Control       | Low during execution   | High throughout         |
| Best for      | Simple, clear issues   | Complex, uncertain work |
| Learning      | Not ideal              | Good for understanding  |

---

## Error Handling

### Issue Not Found

```
Error: Issue #$ARGUMENTS not found. Aborting.
```

### Branch Already Exists

```
Warning: Branch feat/issue-$ARGUMENTS-* exists. Checking out existing branch.
```

### Agent Failure

If any agent fails to execute:

1. Log the failure
2. Continue with remaining agents
3. If all agents fail: ESCALATE

### Git Conflicts

If git operations fail due to conflicts:

1. STOP immediately
2. Report conflict details
3. Wait for user guidance
4. Do not auto-resolve

---

## Agents Used

| Agent                                     | Purpose             | When Called             |
| ----------------------------------------- | ------------------- | ----------------------- |
| `researcher`                              | Analyze codebase    | Phase 1                 |
| `planner`                                 | Create dev plan     | Phase 1                 |
| `pr-review-toolkit:code-reviewer`         | Code quality review | Phase 3                 |
| `pr-review-toolkit:pr-test-analyzer`      | Test coverage       | Phase 3                 |
| `pr-review-toolkit:silent-failure-hunter` | Edge cases          | Phase 3                 |

---

## Success Criteria

This workflow is successful when:

- Issue is fully implemented per plan
- All critical findings resolved (or escalated)
- PR created and reviews triggered
- User informed of PR URL
