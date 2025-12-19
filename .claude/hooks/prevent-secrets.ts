#!/usr/bin/env bun
/**
 * Claude Code Hook: Prevent Hardcoded Secrets in Test Files
 *
 * This hook runs before Write/Edit tool calls and blocks attempts
 * to add hardcoded environment variables to test files.
 *
 * Uses hookSpecificOutput.permissionDecision to control behavior:
 * - "allow": Permit the write
 * - "deny": Block the write with permissionDecisionReason
 */

interface HookInput {
  tool_name: string;
  tool_input: {
    file_path?: string;
    content?: string;
    new_string?: string;
  };
}

// Read input from stdin
const input: HookInput = await Bun.stdin.json();

const filePath = input.tool_input?.file_path || "";
const content = input.tool_input?.content || input.tool_input?.new_string || "";

// Only check test files
if (!filePath.match(/\.test\.ts$/)) {
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

// Check for hardcoded env var assignments
// Pattern: process.env.ANYTHING = 'value' or "value"
const pattern = /process\.env\.[A-Z0-9_]+ *= *['"][^'"]+['"]/g;
const violations = content.match(pattern);

if (violations && violations.length > 0) {
  // Block the write
  console.log(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Hardcoded environment variables detected in test file.\n\n` +
          `Violations:\n${violations.map((v) => `  - ${v}`).join("\n")}\n\n` +
          `Fix: Remove process.env assignments. Environment is loaded automatically from .env.test.\n` +
          `See: .claude/rules/testing.md`,
      },
    })
  );
  process.exit(0);
}

// Allow the write
console.log(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  })
);
process.exit(0);
