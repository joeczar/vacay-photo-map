# Fetch PR Review Comments $ARGUMENTS

Fetch and display review comments for a pull request.

## Usage

- `/pr-comments 176` - Fetch comments for PR #176
- `/pr-comments` - Fetch comments for the current branch's PR

## Steps

1. **Determine PR number**:
   - If `$ARGUMENTS` is provided, use that as the PR number
   - Otherwise, get the PR for the current branch: `gh pr view --json number -q '.number'`

2. **Fetch review comments**:
   ```bash
   gh api repos/{owner}/{repo}/pulls/{pr_number}/comments
   ```

3. **Display comments in a readable format**:
   - For each comment, show:
     - File and line number
     - Priority level (if indicated)
     - The comment body
     - Any suggested code changes

4. **Summarize actionable items**:
   - List high priority issues that need fixing
   - List medium priority suggestions
   - Note any low priority/informational comments

## Example Output

```
## PR #176 Review Comments

### High Priority
1. **cleanup-dev.sh:7-8** - Incorrect pkill pattern for API server

### Medium Priority
1. **start-dev.sh:11** - Use pg_isready instead of sleep

### Summary
- 2 issues to fix
- 1 suggestion to consider
```
