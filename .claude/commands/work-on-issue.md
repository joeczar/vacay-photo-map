# Work on Issue $ARGUMENTS

Execute the gated workflow for issue #$ARGUMENTS.

**Mode:** Human-in-the-loop with 4 approval gates
**Rules:** See `.claude/rules/gate-workflow.md`
**Break-glass:** See `.claude/shared/break-glass-commands.md`

---

## Quick Reference

| Gate | Purpose | Approval Signal |
|------|---------|-----------------|
| Gate 1 | Issue Review | "proceed" |
| Gate 2 | Plan Review | "proceed" |
| Gate 3 | Commit Review (per commit) | "commit" |
| Gate 4 | Pre-PR Review | "create pr" |

---

## Phase 1: Setup

1. **Spawn `setup-agent`** with issue number $ARGUMENTS:
   ```yaml
   INPUT:
     issue_number: $ARGUMENTS
   ```

2. **Handle setup result:**
   - If `status: "ready"` → proceed to Gate 1
   - If `status: "blocked"` → show blockers, ask user how to proceed
   - If `status: "error"` → show error, stop

---

## GATE 1: Issue Review

**Rule: Silence is NOT approval.**

3. **Show COMPLETE issue to user:**
   ```
   GATE 1: Issue Review

   Issue #{number}: {title}

   {full issue body - verbatim}

   Labels: {labels}
   Milestone: {milestone}
   Branch: {branch_name}

   Type 'proceed' to continue, or provide feedback.
   ```

4. **Check for break-glass commands** (`stop`, `abort`, etc.)

5. **Wait for explicit approval:**
   - "proceed", "yes", "continue" → proceed
   - Any other response → address feedback, re-show, wait again

---

## Phase 2: Research & Planning

6. **Spawn `researcher` agent:**
   ```yaml
   INPUT:
     issue_number: $ARGUMENTS
     issue_title: {from setup}
     issue_body: {from setup}
     labels: {from setup}
   ```

7. **Spawn `planner` agent** with research findings:
   ```yaml
   INPUT:
     issue_number: $ARGUMENTS
     issue_title: {from setup}
     research_findings: {from researcher}
   ```

---

## GATE 2: Plan Review

8. **Read the plan file** from `docs/plans/issue-$ARGUMENTS.md`

9. **Show COMPLETE plan to user:**
   ```
   GATE 2: Plan Review

   Implementation Plan for Issue #$ARGUMENTS

   {full plan content - every line}

   Summary:
   - {N} commits planned
   - Complexity: {simple|medium|complex}
   - Key files: {list}

   Type 'proceed' to start implementation, or provide feedback.
   ```

10. **Check for break-glass commands**

11. **Wait for explicit approval:**
    - "proceed", "looks good", "lgtm" → proceed
    - Feedback → update plan, re-show, wait again

---

## Phase 3: Implementation

12. **For each commit in the plan:**

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

    b. **For frontend changes:** Use Playwright to verify:
       - Navigate to affected pages
       - Check UI renders correctly
       - Test user flows
       - Verify dark mode

    c. **GATE 3: Show diff to user:**
       ```
       GATE 3: Commit {N} of {M}

       Commit: {message}

       Files Changed:
       - {file} ({action})

       Summary: {description}

       Verification:
       - Tests: {PASS|FAIL}
       - Type-check: {PASS|FAIL}
       - Visual: {verification results}

       Type 'commit' to commit, or provide feedback.
       ```

    d. **Wait for approval:**
       - "commit", "approve" → `git commit`
       - Feedback → make changes, re-show diff

    e. **Repeat for next commit**

---

## Phase 4: Finalization

13. **Spawn `tester` agent** in review mode:
    ```yaml
    INPUT:
      issue_number: $ARGUMENTS
      changed_files: {all changed files}
      mode: "review"
    ```

14. **Spawn `reviewer` agent:**
    ```yaml
    INPUT:
      issue_number: $ARGUMENTS
      changed_files: {all changed files}
      auto_fix: true
    ```

15. **Run `/pr-review-toolkit:review-pr`** for comprehensive review

---

## GATE 4: Pre-PR Review

16. **Show review results:**
    ```
    GATE 4: Pre-PR Review

    Ready to create PR for Issue #$ARGUMENTS

    Summary:
    - {N} commits implemented
    - Tests: {PASS|FAIL}
    - Type-check: {PASS|FAIL}
    - Lint: {PASS|FAIL}

    Review Results:
    - Tester: {summary}
    - Reviewer: {summary}
    - PR-Review-Toolkit: {summary}

    Advisory Notes:
    - {non-critical findings}

    Type 'create pr' to create the pull request.
    ```

17. **Wait for approval:**
    - "create pr", "proceed" → spawn finalize-agent
    - Feedback → address concerns, re-show

---

## Phase 5: PR Creation

18. **Spawn `finalize-agent`:**
    ```yaml
    INPUT:
      issue_number: $ARGUMENTS
      branch_name: {from setup}
      issue_title: {from setup}
      findings_summary: {from reviews}
      advisory: {non-critical findings}
      commit_count: {total commits}
    ```

19. **Report completion:**
    ```
    WORKFLOW COMPLETE

    Issue: #$ARGUMENTS - {title}
    Branch: {branch_name}
    PR: {pr_url}

    {N} commits implemented
    {M} issues auto-fixed

    Check PR for review comments.
    ```

---

## Break-Glass Commands

At any point, user can type:

| Command | Effect |
|---------|--------|
| `stop` | Halt, show status |
| `abort` | Clean up, delete branch |
| `skip to pr` | Skip remaining gates |

See `.claude/shared/break-glass-commands.md` for full list.

---

## Error Handling

### Agent Failure
- Show error message
- Suggest recovery options
- Wait for user guidance

### Git Conflict
- Stop immediately
- Show conflict details
- Do NOT auto-resolve

### Validation Failure
- Show failing check output
- Ask user how to proceed
- Options: fix, skip, abort

---

## Critical Rules

1. **Never proceed without explicit approval**
2. **Show complete information, not summaries**
3. **Check for break-glass commands between phases**
4. **Use Playwright for frontend verification**
5. **Follow finalization checklist (tester → reviewer → toolkit → PR)**
