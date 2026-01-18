# Finding Classification

Standardized rules for classifying review findings as CRITICAL vs NON-CRITICAL.

## Classification Purpose

Classification determines:
1. **Auto-fix priority** - CRITICAL findings must be fixed before PR creation
2. **Escalation triggers** - Unresolved CRITICAL findings trigger escalation
3. **PR blocking** - CRITICAL findings block PR, NON-CRITICAL are advisory

---

## Per-Agent Classification Rules

### code-reviewer (pr-review-toolkit)

| Condition | Classification |
|-----------|----------------|
| `confidence >= 91` | CRITICAL |
| `label = "Critical"` | CRITICAL |
| `confidence < 91 AND label != "Critical"` | NON-CRITICAL |

**Example findings:**
```yaml
# CRITICAL (confidence 95)
- file: src/auth.ts:42
  issue: "Missing null check before property access"
  confidence: 95
  classification: CRITICAL

# NON-CRITICAL (confidence 75)
- file: src/utils.ts:18
  issue: "Could use optional chaining"
  confidence: 75
  classification: NON-CRITICAL
```

### silent-failure-hunter (pr-review-toolkit)

| Condition | Classification |
|-----------|----------------|
| `severity = "CRITICAL"` | CRITICAL |
| `severity = "HIGH"` | NON-CRITICAL |
| `severity = "MEDIUM"` | NON-CRITICAL |
| `severity = "LOW"` | NON-CRITICAL |

**Example findings:**
```yaml
# CRITICAL (severity CRITICAL)
- file: src/api/upload.ts:89
  issue: "Empty catch block silently swallows upload error"
  severity: CRITICAL
  classification: CRITICAL

# NON-CRITICAL (severity HIGH)
- file: src/api/trips.ts:45
  issue: "Error logged but not handled"
  severity: HIGH
  classification: NON-CRITICAL
```

### pr-test-analyzer (pr-review-toolkit)

| Condition | Classification |
|-----------|----------------|
| `gap_rating >= 8` | CRITICAL |
| `gap_rating >= 5 AND gap_rating < 8` | NON-CRITICAL |
| `gap_rating < 5` | NON-CRITICAL |

Gap ratings are 1-10, where:
- 10 = No tests for critical auth/security code
- 8-9 = Missing tests for important business logic
- 5-7 = Could use more edge case coverage
- 1-4 = Minor nice-to-have tests

**Example findings:**
```yaml
# CRITICAL (gap rating 9)
- file: src/routes/auth.ts
  gap: "No tests for password reset flow"
  gap_rating: 9
  classification: CRITICAL

# NON-CRITICAL (gap rating 6)
- file: src/utils/format.ts
  gap: "Missing edge case for empty strings"
  gap_rating: 6
  classification: NON-CRITICAL
```

### Custom reviewer Agent

Uses severity labels:

| Severity | Classification |
|----------|----------------|
| `critical` | CRITICAL |
| `high` | CRITICAL |
| `medium` | NON-CRITICAL |
| `low` | NON-CRITICAL |

---

## Aggregated Classification

When multiple agents report findings:

1. **Collect all findings** from all agents
2. **Apply per-agent rules** to classify each finding
3. **Group by classification** - CRITICAL list, NON-CRITICAL list
4. **Deduplicate** - Same file:line from multiple agents = one finding

### Aggregated Output Format

```yaml
critical_findings:
  - id: 1
    source: code-reviewer
    file: src/auth.ts:42
    issue: "Missing null check"
    confidence: 95
    fix_attempts: 0

  - id: 2
    source: silent-failure-hunter
    file: src/api/upload.ts:89
    issue: "Empty catch block"
    severity: CRITICAL
    fix_attempts: 0

non_critical_findings:
  - source: pr-test-analyzer
    file: src/utils/format.ts
    issue: "Missing edge case coverage"
    gap_rating: 6

  - source: code-reviewer
    file: src/components/Button.vue
    issue: "Could use computed property"
    confidence: 65

summary:
  total_findings: 15
  critical: 2
  non_critical: 13
  blocking_pr: true  # if critical > 0
```

---

## Classification in Auto-Fix Loop

During the auto-fix loop:

1. **Only CRITICAL findings** enter the fix queue
2. **After each fix attempt**, re-run classification
3. **Finding transitions**:
   - CRITICAL → resolved = removed from list
   - CRITICAL → still failing = increment `fix_attempts`
   - CRITICAL → NON-CRITICAL = move to non-critical list (rare)

### Fix Attempt Tracking

```yaml
critical_findings:
  - id: 1
    source: code-reviewer
    file: src/auth.ts:42
    issue: "Missing null check"
    fix_attempts: 2
    last_attempt: "Added optional chaining"
    last_result: "FAILED - Type error"
```

---

## Edge Cases

### Conflicting Classifications

If same finding classified differently by multiple agents, use **highest severity**:
- CRITICAL from any agent = CRITICAL overall

### Ambiguous Findings

When classification is unclear:
1. **Default to CRITICAL** for safety-related code (auth, data, money)
2. **Default to NON-CRITICAL** for style/performance issues

### Manual Override

Orchestrator can override classification with user confirmation:
- "Should I treat this as CRITICAL or proceed?"
- User response determines final classification
