# Gate Workflow Rules

**Applies to:** `/work-on-issue` command

These rules govern how gates work in the human-in-the-loop workflow.

---

## Core Principle

**Silence is NOT approval.**

At every gate, the orchestrator MUST:
1. Show complete information (not summarized)
2. Wait for explicit user response
3. Only proceed on clear approval signal

---

## Gate Definitions

### Gate 1: Issue Review

**Purpose:** Ensure user understands what they're about to implement.

**What to Show:**
```
GATE 1: Issue Review

Issue #{number}: {title}

{full issue body - verbatim, not summarized}

Labels: {labels}
Milestone: {milestone}

Type 'proceed' to continue, or provide feedback.
```

**Approval Signals:**
- `proceed`
- `yes`
- `continue`
- `let's go`
- `start`

**Non-Approval:**
- Questions ("What about...?")
- Feedback ("The issue should also...")
- Silence (no response)
- Any other text

**On Non-Approval:**
- Address the question or feedback
- Show updated information if relevant
- Wait again for approval

---

### Gate 2: Plan Review

**Purpose:** Ensure user agrees with implementation approach before coding.

**What to Show:**
```
GATE 2: Plan Review

Implementation Plan for Issue #{number}

{full plan content from docs/plans/issue-{N}.md}

Total: {N} commits
Files to modify: {list}
Testing: {strategy summary}

Type 'proceed' to start implementation, or provide feedback.
```

**Approval Signals:**
- `proceed`
- `looks good`
- `approved`
- `let's implement`
- `lgtm`

**Non-Approval:**
- Questions about approach
- Suggestions for changes
- Requests for modifications
- Any other text

**On Non-Approval:**
- Update the plan based on feedback
- Re-show the updated plan
- Wait again for approval

---

### Gate 3: Commit Review (Per Commit)

**Purpose:** Review each atomic change before committing.

**What to Show:**
```
GATE 3: Commit {N} of {M}

Commit: {conventional commit message}

Files Changed:
- {file} ({created|modified|deleted})

Summary:
{2-3 sentence description of changes}

Verification:
- Tests: {PASS|FAIL}
- Type-check: {PASS|FAIL}

Run 'git diff' to see full changes.

Type 'commit' to commit these changes, or provide feedback.
```

**For Frontend Changes - Additional Verification:**
Before showing gate, use Playwright to verify:
1. Navigate to affected pages
2. Check UI renders correctly
3. Test user flows

Include verification in gate:
```
Visual Verification:
- [x] Page loads without errors
- [x] UI renders correctly
- [x] Dark mode works
- [x] Mobile responsive
```

**Approval Signals:**
- `commit`
- `approve`
- `yes`
- `lgtm`

**Non-Approval:**
- Requests for changes
- Questions about implementation
- "Wait, what about..."

**On Non-Approval:**
- Make requested changes
- Re-run verification
- Show updated diff
- Wait for approval

---

### Gate 4: Pre-PR Review

**Purpose:** Final check before creating the pull request.

**What to Show:**
```
GATE 4: Pre-PR Review

Ready to create PR for Issue #{number}

Summary:
- {N} commits implemented
- {M} fix commits (auto-resolved issues)
- Tests: {PASS|FAIL}
- Type-check: {PASS|FAIL}
- Lint: {PASS|FAIL}

Review Results:
{summary from review-orchestrator}

Advisory Notes (non-blocking):
- {file}: {issue}

Type 'create pr' to create the pull request, or provide feedback.
```

**Approval Signals:**
- `create pr`
- `proceed`
- `let's go`
- `create the pr`

**Non-Approval:**
- Requests for additional changes
- Questions about findings
- Concerns about coverage

**On Non-Approval:**
- Address concerns
- Make additional changes if needed
- Re-run validation
- Wait for approval

---

## Gate Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Issue Fetched                                                  │
│       │                                                         │
│       ▼                                                         │
│  ╔═══════════════════╗                                         │
│  ║    GATE 1         ║──────► Show full issue                   │
│  ║    Issue Review   ║                                         │
│  ╚═════════╤═════════╝                                         │
│            │ "proceed"                                          │
│            ▼                                                    │
│  [Research + Planning]                                          │
│            │                                                    │
│            ▼                                                    │
│  ╔═══════════════════╗                                         │
│  ║    GATE 2         ║──────► Show full plan                    │
│  ║    Plan Review    ║                                         │
│  ╚═════════╤═════════╝                                         │
│            │ "proceed"                                          │
│            ▼                                                    │
│  ┌────────────────────────────────────────┐                    │
│  │  For each commit:                       │                    │
│  │            │                            │                    │
│  │            ▼                            │                    │
│  │  [Implement commit]                     │                    │
│  │            │                            │                    │
│  │            ▼                            │                    │
│  │  ╔═══════════════════╗                  │                    │
│  │  ║    GATE 3         ║──► Show diff     │                    │
│  │  ║    Commit Review  ║                  │                    │
│  │  ╚═════════╤═════════╝                  │                    │
│  │            │ "commit"                   │                    │
│  │            ▼                            │                    │
│  │  [Git commit]                           │                    │
│  └────────────────────────────────────────┘                    │
│            │                                                    │
│            ▼                                                    │
│  [Finalization Reviews]                                         │
│            │                                                    │
│            ▼                                                    │
│  ╔═══════════════════╗                                         │
│  ║    GATE 4         ║──────► Show review results               │
│  ║    Pre-PR Review  ║                                         │
│  ╚═════════╤═════════╝                                         │
│            │ "create pr"                                        │
│            ▼                                                    │
│  [Create PR]                                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Break-Glass Integration

At any gate, user can use break-glass commands:

| Command | Effect |
|---------|--------|
| `stop` | Halt and show status |
| `abort` | Clean up and exit |
| `skip to pr` | Skip remaining gates, create PR |

See `.claude/shared/break-glass-commands.md` for details.

---

## Anti-Patterns

### DON'T: Auto-approve on silence

```
# WRONG
if no_response_after_30_seconds:
    proceed()  # Never do this
```

### DON'T: Summarize critical information

```
# WRONG
"The issue is about adding a new feature..."

# RIGHT
{show complete issue body}
```

### DON'T: Combine approval signals

```
# WRONG
"proceed and create pr"  # Confusing

# RIGHT
Gate 3: "proceed"
Gate 4: "create pr"
```

### DON'T: Skip gates based on "simple" issues

```
# WRONG
if issue.labels.contains("simple"):
    skip_gate_2()  # Never skip gates

# RIGHT
# All issues go through all gates
```

---

## Configuration

Gates are not configurable. The human-in-the-loop workflow always has all gates.

For autonomous workflow, use `/auto-issue` instead.
