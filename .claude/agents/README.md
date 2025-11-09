# Agent Architecture

This project uses a hybrid multi-agent system optimized for both simplicity and performance.

## Architecture Overview

```
Planning/Implementation (Sequential - Keep Simple)
├── feature-planner       → Analyze issues, create implementation plans
└── feature-implementer   → Research, design, build, verify
    ├── Can delegate to: test-writer, doc-writer, ui-polisher

PR Review (Parallel - Optimize for Speed)
├── pr-manager (orchestrator)  → Coordinates parallel validation
    ├── schema-validator       → Database schema alignment
    ├── unused-code-detector   → Find unused code
    ├── doc-syncer            → Documentation sync
    ├── test-verifier         → Test coverage & execution
    └── code-reviewer         → Readability & best practices

Utility Agents (Specialized - Use for Focused Tasks)
├── test-writer           → Comprehensive Playwright test creation
├── doc-writer           → Technical documentation (deployment, API, architecture)
└── ui-polisher          → UI polish (responsive, animations, loading states)
```

## Design Principles

This architecture follows **research-backed best practices** from Microsoft Azure, Google Cloud, and Anthropic:

### 1. Start Simple (Planning & Implementation)

**feature-planner** and **feature-implementer** remain **monolithic** because:
- Planning requires sequential thinking (can't parallelize strategic decisions)
- Implementation has high context dependencies (each step builds on previous)
- Research shows: "Don't create unnecessary coordination complexity" (Microsoft)
- Limited parallelizable components in coding tasks (Anthropic)

### 2. Parallelize When It Matters (PR Review)

**pr-manager** uses **multi-agent pattern** because:
- 5+ independent validation checks (schema, unused code, docs, tests, quality)
- Meets the "3+ rule": state + branching + parallelism + multiple tools
- 40-60% faster reviews through parallel execution
- Each validator is focused and maintainable

### 3. Specialized Over Generalist (Where Proven)

Each validator agent:
- Has **single responsibility** (easier to maintain, debug, test)
- Provides **meaningful specialization** (different expertise)
- Can run **independently** (useful for quick checks)
- Returns **structured output** (easy for pr-manager to synthesize)

## Agent Descriptions

### Planning Phase

**feature-planner** (Monolithic)
- Analyzes open issues and recommends next feature
- Creates detailed implementation plans in `/docs`
- Verifies database schema requirements
- Plans testing strategy

**feature-implementer** (Monolithic)
- Researches solutions using context7
- Designs full-stack implementation
- Builds features following TDD when appropriate
- Verifies with tests before completion

### Review Phase

**pr-manager** (Orchestrator)
- Fetches PR and AI review comments
- Spawns 5 validators **in parallel** (single message)
- Synthesizes findings by severity
- Makes atomic commits to fix issues
- Provides comprehensive production-readiness report

**schema-validator** (Worker)
- Single task: Verify interfaces match `database.types.ts`
- Checks field names, types, nullability
- Fast execution: < 30 seconds

**unused-code-detector** (Worker)
- Single task: Find unused interfaces, types, functions
- Uses grep for speed
- Prevents false positives (precision over recall)

**doc-syncer** (Worker)
- Single task: Verify documentation matches code
- Checks code examples in markdown files
- Validates error messages, field names, response formats

**test-verifier** (Worker)
- Single task: Ensure tests exist and pass
- Runs `pnpm test` and `pnpm type-check`
- Identifies missing tests for new features

**code-reviewer** (Worker)
- Single task: Evaluate code quality and readability
- Focus: Self-documenting code, simplicity, conventions
- Checks compliance with CLAUDE.md patterns
- Validates import maps populated (for Edge Functions)
- Evaluates external AI review comments (from Copilot/Gemini)

### Utility Agents

**test-writer** (Specialized Utility)
- Writes comprehensive Playwright tests for UI features
- Perfect for test-heavy issues like #35 (Playwright tests)
- Includes test templates, best practices, reliability patterns
- Can be used standalone or for specific test needs

**doc-writer** (Specialized Utility)
- Creates technical documentation (deployment, API, architecture)
- Perfect for doc-heavy issues like #43 (deployment docs)
- Includes templates for deployment guides, API docs, feature guides
- Ensures docs are clear, accurate, and maintainable

**ui-polisher** (Specialized Utility)
- Handles UI polish tasks (responsive, animations, loading states)
- Perfect for polish-heavy issues like #21 (UI improvements)
- Uses shadcn-vue components, tests with Playwright
- Focuses on user experience and visual refinement

## Usage Examples

### Planning a Feature

```
User: "What should I work on next?"
→ Use feature-planner agent
→ Gets issue analysis, priority recommendation, detailed plan
```

### Implementing a Feature

```
User: "Implement issue #42"
→ Use feature-implementer agent
→ Gets research → design → implementation → verification
```

### Reviewing a PR (Fast Parallel)

```
User: "Review PR #45"
→ Use pr-manager agent
→ Spawns 5 validators in parallel
→ Gets comprehensive review in < 5 minutes
```

### Quick Validation Check

```
User: "Check if my types match the database"
→ Use schema-validator agent directly
→ Gets focused validation in < 30 seconds
```

### Writing Tests (Utility Agent)

```
User: "Write Playwright tests for issue #35"
→ Use test-writer agent
→ Gets comprehensive E2E tests with best practices
```

### Creating Documentation (Utility Agent)

```
User: "Write deployment docs for issue #43"
→ Use doc-writer agent
→ Gets structured docs with examples and troubleshooting
```

### UI Polish (Utility Agent)

```
User: "Fix responsive issues for issue #21"
→ Use ui-polisher agent
→ Gets mobile/tablet/desktop improvements + tests
```

## Performance Characteristics

| Agent | Type | Latency | Token Usage | When to Use |
|-------|------|---------|-------------|-------------|
| feature-planner | Monolithic | 2-5 min | Baseline | Planning |
| feature-implementer | Monolithic | 5-15 min | High | Implementation |
| pr-manager | Orchestrator | 2-4 min | +50% vs monolithic | PR review (comprehensive) |
| schema-validator | Worker | 20-30 sec | Low | Quick schema check |
| unused-code-detector | Worker | 20-30 sec | Low | Find unused code |
| doc-syncer | Worker | 30-45 sec | Low | Verify docs |
| test-verifier | Worker | 45-60 sec | Medium | Check tests |
| code-reviewer | Worker | 30-45 sec | Medium | Code quality |
| test-writer | Utility | 3-7 min | Medium | Test-heavy issues (#35) |
| doc-writer | Utility | 3-6 min | Medium | Doc-heavy issues (#43) |
| ui-polisher | Utility | 4-8 min | Medium-High | UI polish issues (#21) |

## Why This Architecture?

### Research Findings Applied

**From Anthropic:**
> "Most coding tasks have limited parallelizable components"
→ Keep implementer monolithic

> "Valuable tasks with heavy parallelization... 15× token usage but 90.2% better results"
→ Use multi-agent for PR reviews (high value, parallelizable)

**From Microsoft Azure:**
> "Don't create unnecessary coordination complexity"
→ Only parallelize where it helps (PR reviews, not implementation)

**From Google Cloud:**
> "If a single agent can reliably solve your scenario, use that approach"
→ Keep planning and implementation simple

### Lessons from PR #45

This architecture addresses issues found in PR #45:
- Schema validator would catch type mismatches (name vs title) ✓
- Unused code detector would find TripWithPhotos ✓
- Doc syncer would flag outdated examples ✓
- Import map checks would catch empty deno.json ✓
- All happening in **parallel** for faster reviews ✓

## Trade-offs Made

**Why not break down everything?**
- Cognitive overhead: Remembering 10+ agents vs 7
- Orchestration complexity: More agents = more coordination
- Context loss: Feature implementation needs full context
- Token efficiency: Only worth it where parallelism helps

**Why not keep everything monolithic?**
- PR reviews have 5+ independent checks (meets "3+ rule")
- Parallel execution significantly faster (40-60%)
- Validators are reusable (can run standalone)
- Easier to maintain (single responsibility)

## Utility Agents

Based on analysis of 24 open issues, we identified that ~29% of work is parallelizable (test-writing, documentation, UI polish). Rather than parallelize the implementer (which would duplicate planning research), we created specialized utility agents:

**test-writer** - Writes comprehensive Playwright tests
- Use for: Test-heavy issues like #35 (Playwright tests for all views)
- Provides: Test templates, best practices, reliability patterns
- Can run: Standalone or called by implementer after feature completion

**doc-writer** - Creates technical documentation
- Use for: Doc-heavy issues like #43 (deployment documentation)
- Provides: Deployment guides, API docs, architecture docs with templates
- Can run: Standalone or called by implementer for feature docs

**ui-polisher** - Handles UI polish and refinement
- Use for: Polish-heavy issues like #21 (UI improvements)
- Provides: Responsive fixes, animations, loading states, accessibility
- Can run: Standalone for focused polish work

**Why Utility Agents Work:**
- Focused expertise (testing, docs, UI polish)
- Don't duplicate planning research (implementer already has context)
- Parallelizable within their domain (test-writer can test multiple views in parallel)
- Reusable across issues
- Lower coordination complexity than breaking down implementer

## Future Expansion

**Easy to add:**
- New validators to pr-manager (security-checker, performance-analyzer)
- New utility agents (migration-helper, refactoring-assistant)
- Specialized planning agents (milestone-strategist)

**Architecture supports:**
- Parallel execution (already implemented in pr-manager)
- Standalone utility agents (all can run directly)
- Clear responsibilities (single-purpose agents)

## Success Metrics

**Planning/Implementation:**
- Clear plans that developers can execute immediately
- Features built correctly first time
- Tests pass before commit

**PR Review:**
- All production-critical issues caught
- Reviews complete in < 5 minutes
- Specific, actionable feedback
- High confidence in merge safety

---

**Version**: 1.0
**Last Updated**: November 9, 2025
**Based on**: Research from Microsoft Azure, Google Cloud, Anthropic (2025)
