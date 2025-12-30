#!/usr/bin/env bun
/**
 * Claude Code Hook: Require PR Review Toolkit Before PR Creation
 *
 * This hook runs before Bash tool calls and blocks `gh pr create` commands
 * unless the PR review toolkit has been run for the current branch.
 *
 * State is tracked via a marker file in .claude/state/ directory.
 * The marker contains the branch name and timestamp.
 *
 * Usage:
 *   1. Run `/pr-review-toolkit:review-pr`
 *   2. After review completes, run `bun .claude/hooks/mark-review-complete.ts`
 *   3. Then `gh pr create` will be allowed
 *
 * The marker is branch-specific to ensure each PR gets reviewed.
 */

import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

interface HookInput {
  tool_name: string;
  tool_input: {
    command?: string;
  };
}

// Read input from stdin
const input: HookInput = await Bun.stdin.json();

const command = input.tool_input?.command || "";

// Only check Bash commands that create PRs
if (!command.includes("gh pr create")) {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    })
  );
  process.exit(0);
}

// Get current branch name
let currentBranch: string;
try {
  currentBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
} catch {
  // If we can't get branch, allow the command (might be in detached HEAD)
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    })
  );
  process.exit(0);
}

// Don't check for main/master branches (direct pushes shouldn't need review)
if (currentBranch === "main" || currentBranch === "master") {
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
      },
    })
  );
  process.exit(0);
}

// Check for review marker
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const stateDir = join(projectDir, ".claude", "state");
const markerFile = join(stateDir, "pr-review-completed");

let reviewComplete = false;
let markerBranch = "";

if (existsSync(markerFile)) {
  try {
    const content = readFileSync(markerFile, "utf-8").trim();
    const [branch] = content.split("\n");
    markerBranch = branch;
    reviewComplete = branch === currentBranch;
  } catch {
    reviewComplete = false;
  }
}

if (!reviewComplete) {
  const reason = markerBranch
    ? `PR review was completed for branch "${markerBranch}" but current branch is "${currentBranch}".`
    : `No PR review marker found for branch "${currentBranch}".`;

  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `BLOCKED: PR Review Toolkit Not Run\n\n` +
          `${reason}\n\n` +
          `Before creating a PR, you MUST:\n` +
          `1. Run /pr-review-toolkit:review-pr to analyze the changes\n` +
          `2. Address any critical issues found\n` +
          `3. Run: bun .claude/hooks/mark-review-complete.ts\n` +
          `4. Then retry gh pr create\n\n` +
          `See: .claude/rules/pr-workflow.md`,
      },
    })
  );
  process.exit(0);
}

// Review was completed for this branch, allow PR creation
console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  })
);
process.exit(0);
