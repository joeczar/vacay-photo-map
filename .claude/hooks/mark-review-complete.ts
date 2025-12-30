#!/usr/bin/env bun
/**
 * Mark PR Review as Complete
 *
 * Run this script after completing /pr-review-toolkit:review-pr
 * to allow `gh pr create` to proceed.
 *
 * Usage:
 *   bun .claude/hooks/mark-review-complete.ts
 *
 * The marker is branch-specific and includes a timestamp.
 */

import { mkdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { join } from "path";

// Get current branch
let currentBranch: string;
try {
  currentBranch = execSync("git branch --show-current", { encoding: "utf-8" }).trim();
} catch (error) {
  console.error("Error: Could not determine current git branch");
  process.exit(1);
}

if (!currentBranch) {
  console.error("Error: Not on a branch (detached HEAD?)");
  process.exit(1);
}

// Create state directory if needed
const projectDir = process.cwd();
const stateDir = join(projectDir, ".claude", "state");

try {
  mkdirSync(stateDir, { recursive: true });
} catch {
  // Directory already exists
}

// Write marker file
const markerFile = join(stateDir, "pr-review-completed");
const timestamp = new Date().toISOString();
const content = `${currentBranch}\n${timestamp}\n`;

writeFileSync(markerFile, content);

console.log(`PR review marked as complete for branch: ${currentBranch}`);
console.log(`Timestamp: ${timestamp}`);
console.log(`\nYou can now run: gh pr create`);
