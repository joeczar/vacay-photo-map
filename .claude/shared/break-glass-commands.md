# Break Glass Commands

Emergency commands the user can type at any time to intervene in workflows.

## Command Reference

| Command | Effect | When to Use |
|---------|--------|-------------|
| `stop` | Halt immediately, show status | Need to review what's happening |
| `pause` | Same as `stop` | Alternative keyword |
| `abort` | Clean up, delete branch, exit | Want to cancel entirely |
| `continue` | Resume after manual fix | Made a fix during escalation |
| `force-pr` | Create PR with issues flagged | Accept known issues |
| `reset` | Go back to last good state | Start fresh on fix attempts |
| `skip review` | Skip review phase, go to PR | Confident code is ready |

---

## Command Behaviors

### `stop` / `pause`

**Behavior:**
1. Halt current operation immediately
2. Show current status report
3. Wait for user instruction

**Status Report:**
```
WORKFLOW PAUSED

Phase: {current phase}
Branch: {branch name}
Last action: {what was being done}

Progress:
- Commits: {N} of {M} planned
- Reviews: {completed}/{total}
- Fixes: {applied}/{attempted}

Type 'continue' to resume, 'abort' to cancel, or give new instructions.
```

**Cleanup:** None (preserves state for resumption)

---

### `abort`

**Behavior:**
1. Stash uncommitted changes
2. Switch to main branch
3. Delete feature branch
4. Report what was preserved

**Cleanup Procedure:**
```bash
# Save work in progress
git stash push -m "Aborted: issue-{N}"

# Return to main
git checkout main

# Remove feature branch
git branch -D feat/issue-{N}-*

# Clean up plan file if exists
rm -f docs/plans/issue-{N}.md
```

**Report:**
```
WORKFLOW ABORTED

Branch deleted: feat/issue-{N}-{description}
Changes saved: git stash (stash@{0})

To recover work:
  git stash pop

To restart:
  /work-on-issue {N}
```

---

### `continue`

**Behavior:**
1. Verify current state passes validation
2. If manual changes exist, commit them
3. Resume workflow from current phase

**Validation Before Continuing:**
```bash
# Check for changes
git status

# Validate changes
pnpm type-check
pnpm lint
```

**If validation fails:**
```
Cannot continue - validation failed:

{error output}

Please fix the issues and type 'continue' again.
```

**If validation passes:**
```
Resuming workflow...

Manual changes committed: "fix: Manual fix for {finding}"
Continuing from: {phase description}
```

---

### `force-pr`

**Behavior:**
1. Skip remaining fix attempts
2. Add unresolved issues to PR body
3. Add `needs-attention` label
4. Create PR
5. Report with warning

**PR Body Addition:**
```markdown
## Known Issues

The following issues could not be auto-resolved:

| File | Issue | Status |
|------|-------|--------|
| src/foo.ts:42 | Missing null check | Unresolved after 3 attempts |
| src/bar.ts:89 | Empty catch block | Unresolved after 2 attempts |

**Please review these issues before merging.**
```

**Report:**
```
PR CREATED WITH WARNINGS

PR: https://github.com/.../pull/{N}
Labels: needs-attention

WARNING: {X} unresolved issues included in PR body.
Please address before merging.
```

---

### `reset`

**Behavior:**
1. Find last "good" commit (before fix attempts)
2. Hard reset to that commit
3. Clear retry counters
4. Resume auto-fix loop fresh

**Reset Procedure:**
```bash
# Find the implementation commit (before fixes)
LAST_GOOD=$(git log --oneline --grep="^feat\|^fix:" | head -1 | cut -d' ' -f1)

# Reset to it
git reset --hard $LAST_GOOD

# Report
echo "Reset to: $LAST_GOOD"
```

**Report:**
```
RESET COMPLETE

Reset to: abc1234 feat(api): implement photo description endpoint
Discarded: 3 fix commits

Retry counters cleared. Resuming review phase...
```

---

### `skip review`

**Behavior:**
1. Mark all pending reviews as skipped
2. Proceed directly to finalization
3. Add note to PR that review was skipped

**Report:**
```
SKIPPING REVIEW PHASE

Reviews skipped:
- code-reviewer
- pr-test-analyzer
- silent-failure-hunter

Proceeding to finalization...

Note: PR will include "Review skipped by user" notice.
```

---

## Command Detection

### How Commands Are Detected

The orchestrator checks for break-glass commands:
1. After each agent returns
2. Between workflow phases
3. During escalation waits

### Detection Pattern

```typescript
const BREAK_GLASS_COMMANDS = [
  'stop', 'pause', 'abort', 'continue',
  'force-pr', 'reset', 'skip review'
]

function detectBreakGlass(userMessage: string): string | null {
  const lower = userMessage.toLowerCase().trim()
  return BREAK_GLASS_COMMANDS.find(cmd => lower === cmd) || null
}
```

### Ambiguous Input

If user message contains a command but isn't exact:
```
"Maybe we should abort this?"

→ "Did you mean 'abort'? Type 'abort' to confirm, or continue with other instructions."
```

---

## Command Permissions

### Always Available

These commands work at any point:
- `stop` / `pause`
- `abort`

### Context-Specific

These commands only work in certain contexts:

| Command | Available When |
|---------|----------------|
| `continue` | During escalation, after pause |
| `force-pr` | During escalation, after review phase |
| `reset` | After at least one commit exists |
| `skip review` | Before or during review phase |

### Unavailable Command Response

```
Command 'reset' not available - no commits to reset to.

Available commands: stop, pause, abort
```

---

## Safety Considerations

### Destructive Commands

`abort` deletes the branch. Before executing:
```
This will delete branch feat/issue-{N}-{description} and all {M} commits.
Changes will be preserved in git stash.

Type 'abort' again to confirm, or any other response to cancel.
```

### Non-Destructive Commands

Other commands preserve work and can be reversed:
- `stop` → resume with `continue`
- `reset` → commits still in reflog
- `force-pr` → PR can be updated later

---

## Integration with Workflows

### /work-on-issue

Break-glass commands are checked between gates:
- After Gate 1 (issue review)
- After Gate 2 (plan review)
- After each Gate 3 (commit review)
- During finalization

### /auto-issue

Break-glass commands are checked between phases:
- After Phase 1 (research)
- After Phase 2 (implement)
- During Phase 3 (review loop)
- Before Phase 4 (finalize)

Commands like `stop` make `/auto-issue` behave more like `/work-on-issue` (human in loop).
