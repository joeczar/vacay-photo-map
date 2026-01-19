---
name: implementer-reminder
enabled: true
event: Edit|Write
pattern: .*/src/.*\.(ts|tsx|vue)$
action: warn
---

<workflow_reminder>
During `/auto-issue` or `/work-on-issue` workflows, spawn the `implementer`
agent using the Task tool. The implementer handles commit execution with
proper diff preparation and pattern adherence.

Example: Task(implementer) with commit_number, plan_file, and branch_name.
</workflow_reminder>
