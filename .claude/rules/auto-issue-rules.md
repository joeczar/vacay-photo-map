# Auto-Issue Workflow Rules

**Applies to:** `/auto-issue` command

These rules govern the autonomous workflow behavior, limits, and escalation.

---

## Configuration Limits

| Limit | Value | Description |
|-------|-------|-------------|
| `MAX_RETRY` | 3 | Max fix attempts per CRITICAL finding |
| `MAX_FIX_COMMITS` | 10 | Max total fix commits before escalation |
| `MAX_ESCALATIONS` | 2 | Max escalations before force-abort |
| `AGENT_TIMEOUT` | 120s | Max time for any single agent |

These limits protect against infinite loops and runaway workflows.

---

## Escalation Triggers

### Automatic Escalation

Escalate to user when:

1. **MAX_RETRY exceeded**
   - Same CRITICAL finding persists after 3 fix attempts
   - Each attempt must be meaningfully different

2. **MAX_FIX_COMMITS exceeded**
   - Total fix commits (across all findings) reaches 10
   - Indicates systemic issues

3. **Validation fails after fix**
   - Type-check fails after applying fix
   - Lint fails after applying fix
   - Tests fail after applying fix

4. **Agent failure**
   - Any agent times out
   - Any agent returns error
   - All agents fail

5. **Git errors**
   - Merge conflict
   - Push rejected
   - Branch conflict

### Escalation Report

Use format from `.claude/shared/escalation-patterns.md`:

```markdown
## AUTO-ISSUE ESCALATION REQUIRED

Issue: #{number}
Branch: {branch}
Trigger: {reason}

### Unresolved Findings
{table of findings with attempt counts}

### Your Options
1. Fix manually → type 'continue'
2. Create PR with issues → type 'force-pr'
3. Cancel workflow → type 'abort'
4. Reset and retry → type 'reset'
```

---

## Break-Glass Command Detection

Check for user commands between workflow phases:

```
After Phase 1 (Research) → check for commands
After Phase 2 (Implement) → check for commands
During Phase 3 (Review loop) → check after each iteration
Before Phase 4 (Finalize) → check for commands
```

### Supported Commands

| Command | Action |
|---------|--------|
| `stop` | Halt, show status, wait |
| `pause` | Same as stop |
| `abort` | Clean up, delete branch, exit |
| `continue` | Resume after manual fix |
| `force-pr` | Create PR with issues flagged |
| `reset` | Reset to last good commit |
| `skip review` | Skip review phase, go to PR |

See `.claude/shared/break-glass-commands.md` for behaviors.

---

## Finding Classification

Use rules from `.claude/shared/finding-classification.md`:

### CRITICAL (Must fix before PR)

| Agent | Condition |
|-------|-----------|
| code-reviewer | confidence ≥ 91 OR label="Critical" |
| silent-failure-hunter | severity = "CRITICAL" |
| pr-test-analyzer | gap_rating ≥ 8 |

### NON-CRITICAL (Advisory only)

Everything else. Include in PR body as advisory notes.

---

## Auto-Fix Loop Rules

```
retry_count = {}  # Per-finding
fix_commits = 0   # Total

while CRITICAL_FINDINGS and fix_commits < MAX_FIX_COMMITS:

    for finding in CRITICAL_FINDINGS:
        if retry_count[finding] >= MAX_RETRY:
            mark_for_escalation(finding)
            continue

        result = attempt_fix(finding)

        if result.success:
            commit_fix()
            fix_commits++
            remove(finding)
        else:
            retry_count[finding]++
            log_failure(finding, result.error)

    if any_fixed:
        re_run_reviews()
        re_classify()

if has_escalation_findings():
    ESCALATE()
else:
    PROCEED_TO_FINALIZE()
```

### Fix Attempt Requirements

Each fix attempt must:
1. Be meaningfully different from previous attempts
2. Pass validation (type-check, lint)
3. Not introduce new CRITICAL findings

If validation fails, revert the change immediately.

---

## Phase Validation

### After Phase 1 (Research)

Validation:
- Issue exists and is fetchable
- Branch created successfully
- Research completed without errors

If validation fails:
- Log error
- ESCALATE with clear message
- Do not proceed to implementation

### After Phase 2 (Implementation)

Validation:
```bash
pnpm type-check  # Must pass
pnpm lint        # Must pass
```

If validation fails:
- Attempt inline fix (up to 3 times)
- If still fails, proceed to review (reviewer will catch it)
- Log the validation failure

### After Phase 3 (Review)

Validation:
- All CRITICAL findings resolved OR escalated
- fix_commits < MAX_FIX_COMMITS
- No infinite loops (same finding → same fix → same error)

If validation fails:
- ESCALATE with full attempt log

### Before Phase 4 (Finalize)

Validation:
```bash
pnpm test        # Must pass (if --require-tests)
pnpm type-check  # Must pass
pnpm lint        # Must pass
```

If validation fails:
- ESCALATE
- Show validation output
- Wait for user decision

---

## Command-Line Flags

| Flag | Effect |
|------|--------|
| `--dry-run` | Stop after research, show plan |
| `--require-tests` | Fail if tests don't pass |
| `--force-pr` | Create PR even with unresolved issues |
| `--abort-on-fail` | Abort if auto-fix fails |
| `--sequential` | Run review agents one at a time |

### Flag Behaviors

**`--dry-run`**
- Complete Phase 1 (research + planning)
- Show plan to user
- Exit without implementing

**`--require-tests`**
- Make test failures a hard blocker
- Escalate if tests fail in Phase 4

**`--force-pr`**
- On escalation, auto-select "force-pr" option
- Create PR with issues flagged
- Add `needs-attention` label

**`--abort-on-fail`**
- On escalation, auto-select "abort" option
- Clean up branch
- Exit with failure status

**`--sequential`**
- Run review agents one at a time
- Easier to debug
- Slower overall

---

## Logging Requirements

Log all significant events:

```
[AUTO-ISSUE] Phase 1 started: Issue #127
[AUTO-ISSUE] Branch created: feat/issue-127-photo-api
[AUTO-ISSUE] Research complete: 5 relevant files found
[AUTO-ISSUE] Plan created: 4 commits planned
[AUTO-ISSUE] Phase 2 started: Implementation
[AUTO-ISSUE] Commit 1/4: feat(api): add description types
[AUTO-ISSUE] Commit 2/4: feat(api): implement PUT endpoint
[AUTO-ISSUE] Commit 3/4: test(api): add description tests
[AUTO-ISSUE] Commit 4/4: docs: update API documentation
[AUTO-ISSUE] Phase 2 complete: 4 commits
[AUTO-ISSUE] Phase 3 started: Review
[AUTO-ISSUE] Review agents launched: code-reviewer, pr-test-analyzer, silent-failure-hunter
[AUTO-ISSUE] Findings: 2 CRITICAL, 3 NON-CRITICAL
[AUTO-ISSUE] Fix attempt 1/3: src/auth.ts:42 - Adding null check
[AUTO-ISSUE] Fix FAILED: Type error
[AUTO-ISSUE] Fix attempt 2/3: src/auth.ts:42 - Using type narrowing
[AUTO-ISSUE] Fix SUCCESS: Committed
[AUTO-ISSUE] Phase 3 complete: 1 fix applied
[AUTO-ISSUE] Phase 4 started: Finalize
[AUTO-ISSUE] Validation PASS
[AUTO-ISSUE] PR created: https://github.com/.../pull/42
[AUTO-ISSUE] COMPLETE
```

---

## Error States

### Recoverable Errors

- Agent timeout → retry once, then escalate
- Validation failure → attempt fix, then escalate
- Push rejected → suggest rebase, wait for user

### Non-Recoverable Errors

- Issue not found → abort immediately
- Git conflict → escalate, don't auto-resolve
- All agents fail → escalate, show partial results

---

## Success Criteria

Workflow is successful when:
- All planned commits implemented
- All CRITICAL findings resolved (or user-approved)
- PR created with proper body
- User informed of PR URL

Workflow is partially successful when:
- PR created with `force-pr`
- Known issues documented in PR body
- `needs-attention` label added
