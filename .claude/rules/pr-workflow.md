# PR Creation Workflow Gate

**Applies to:** `gh pr create`, creating pull requests

## STOP - Before Creating a PR

You MUST complete these finalization steps IN ORDER before running `gh pr create`:

### Checklist (ALL required)

1. [ ] **Tester Agent** - Spawn `tester` agent to:
   - Review test coverage for changes
   - Verify tests use shared infrastructure (`test-factories.ts`, `test-helpers.ts`, `test-types.ts`)
   - Check for hardcoded values that should be dynamic
   - Run all tests and verify they pass

2. [ ] **Reviewer Agent** - Spawn `reviewer` agent to:
   - Validate schema alignment
   - Check API integration patterns
   - Verify auth flows if applicable
   - Detect unused code

3. [ ] **PR Review Toolkit** - Run `/pr-review-toolkit:review-pr` for:
   - Code quality analysis
   - Comment accuracy
   - Type design review
   - Silent failure detection

### How to Use

When you're about to create a PR, STOP and ask yourself:
- Did I spawn the `tester` agent?
- Did I spawn the `reviewer` agent?
- Did I run the PR review toolkit?

If NO to any of these, do them BEFORE creating the PR.

### Why This Matters

Skipping finalization agents leads to:
- Test quality issues caught by external reviewers (Gemini, etc.)
- Hardcoded values in tests causing flaky parallel runs
- Missing test coverage for new code paths
- Schema/API misalignment caught after PR creation

### Example

```
# WRONG - Skip straight to PR
git push && gh pr create

# CORRECT - Follow finalization workflow
1. Task(tester) → "Review tests for issue #227 changes"
2. Task(reviewer) → "Review code quality for issue #227"
3. /pr-review-toolkit:review-pr
4. gh pr create
```
