# Escalation Patterns

When to escalate to the user and how to report problems.

## Escalation Triggers

### Auto-Fix Failures

| Trigger | Condition |
|---------|-----------|
| MAX_RETRY exceeded | Same CRITICAL finding persists after 3 fix attempts |
| MAX_FIX_COMMITS exceeded | Total fix commits reaches 10 |
| Validation loop | Fix passes but creates new CRITICAL finding |

### Validation Failures

| Trigger | Condition |
|---------|-----------|
| Type-check fails | `pnpm type-check` returns non-zero after fix |
| Lint fails | `pnpm lint` returns non-zero after fix |
| Tests fail | `pnpm test` returns non-zero (if `--require-tests`) |
| Build fails | `pnpm build` returns non-zero |

### Agent Failures

| Trigger | Condition |
|---------|-----------|
| Agent crash | Agent returns error or times out |
| All agents fail | Every review agent fails to execute |
| No findings returned | Agent runs but returns empty/malformed output |

### Git Failures

| Trigger | Condition |
|---------|-----------|
| Merge conflict | Git operation fails with conflict |
| Push rejected | Remote rejects push |
| Branch conflict | Target branch already exists with changes |

---

## Escalation Report Format

When escalation triggers, present this report to the user:

```markdown
## ESCALATION REQUIRED

**Issue:** #{number} - {title}
**Branch:** feat/issue-{number}-{description}
**Phase:** {current phase}
**Trigger:** {escalation trigger}

### Unresolved Findings

| # | Agent | File | Issue | Attempts | Last Result |
|---|-------|------|-------|----------|-------------|
| 1 | code-reviewer | src/foo.ts:42 | Missing null check | 3 | Type error |
| 2 | silent-failure-hunter | src/bar.ts:89 | Empty catch | 2 | Lint error |

### Fix Attempt Log

**Finding #1: Missing null check (src/foo.ts:42)**

Attempt 1:
- Applied: Added optional chaining `?.`
- Result: FAILED - Type error: Cannot use ?. on required property

Attempt 2:
- Applied: Added explicit null check `if (x !== null)`
- Result: FAILED - Lint error: Prefer optional chaining

Attempt 3:
- Applied: Type narrowing with `if (x)`
- Result: FAILED - Test failure: Expected null to throw

### Current State

- Commits made: {N} implementation + {M} fixes
- Tests: {PASS|FAIL}
- Type-check: {PASS|FAIL}
- Lint: {PASS|FAIL}

### Your Options

1. **Fix manually** - Make the fix yourself, then type `continue`
2. **Force PR** - Type `force-pr` to create PR with issues flagged
3. **Abort** - Type `abort` to delete branch and exit
4. **Reset** - Type `reset` to go back to last good state
5. **Skip this finding** - Type `skip` to mark as non-critical and proceed
```

---

## User Response Handling

### Option: `continue`

User has made manual fixes. Resume workflow:

1. Verify user's changes pass validation
2. Commit user's changes with message: `fix: Manual fix for {finding}`
3. Re-run review agents
4. Continue auto-fix loop if more CRITICAL findings

### Option: `force-pr`

Create PR despite unresolved issues:

1. Add `## Unresolved Issues` section to PR body
2. List all CRITICAL findings with context
3. Add `needs-attention` label to PR
4. Push and create PR
5. Report PR URL with warning

PR body addition:
```markdown
## Unresolved Issues

The following issues could not be auto-resolved:

- [ ] **src/foo.ts:42** - Missing null check (3 attempts failed)
- [ ] **src/bar.ts:89** - Empty catch block (2 attempts failed)

Please review and address before merging.
```

### Option: `abort`

Clean up and exit:

1. Stash any uncommitted changes: `git stash`
2. Switch to main: `git checkout main`
3. Delete feature branch: `git branch -D feat/issue-{N}-*`
4. Report: "Workflow aborted. Changes saved in git stash."

### Option: `reset`

Reset to last good state:

1. Find last passing commit: `git log --oneline`
2. Reset to it: `git reset --hard {commit}`
3. Report: "Reset to {commit}. Retry count cleared."
4. Resume auto-fix loop with fresh retry count

### Option: `skip`

Reclassify finding as non-critical:

1. Move finding from CRITICAL to NON-CRITICAL list
2. Log: "Finding #{N} marked as non-critical by user"
3. Continue with remaining CRITICAL findings
4. Include skipped finding in PR body as advisory

---

## Escalation Thresholds

### Configurable Limits

| Limit | Default | Description |
|-------|---------|-------------|
| `MAX_RETRY` | 3 | Max fix attempts per finding |
| `MAX_FIX_COMMITS` | 10 | Max total fix commits |
| `MAX_ESCALATIONS` | 2 | Max times to escalate before force-abort |

### Threshold Behavior

```
if fix_attempts >= MAX_RETRY:
    ESCALATE("Max retries for finding #{N}")

if total_fix_commits >= MAX_FIX_COMMITS:
    ESCALATE("Max fix commits reached")

if escalation_count >= MAX_ESCALATIONS:
    FORCE_ABORT("Too many escalations - workflow unstable")
```

---

## Escalation States

### State Machine

```
WORKING → (trigger) → ESCALATED
ESCALATED → (continue) → WORKING
ESCALATED → (force-pr) → FINALIZING
ESCALATED → (abort) → ABORTED
ESCALATED → (reset) → WORKING
ESCALATED → (skip) → WORKING
```

### State Persistence

During escalation, preserve:
- Current branch state
- Fix attempt log
- Finding classifications
- Commit history

This allows resumption after user intervention.

---

## Escalation Examples

### Example 1: Type Error Loop

```
ESCALATION REQUIRED

Issue: #127 - Add photo description API
Branch: feat/issue-127-photo-description-api
Phase: Review + Auto-Fix
Trigger: MAX_RETRY exceeded

Finding: Silent failure in description update

Attempts:
1. Added error logging → Still flagged (not thrown)
2. Added throw → Type error (return type changed)
3. Changed return type → API contract broken

Your Options: continue | force-pr | abort | reset | skip
```

### Example 2: Git Conflict

```
ESCALATION REQUIRED

Issue: #127 - Add photo description API
Branch: feat/issue-127-photo-description-api
Phase: Finalize
Trigger: Push rejected - remote has changes

Details:
Remote branch 'main' has 2 new commits since branch creation.

Your Options:
1. `rebase` - Rebase onto latest main
2. `merge` - Merge main into feature branch
3. `abort` - Cancel and review manually
```
