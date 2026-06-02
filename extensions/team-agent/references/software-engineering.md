# Software Engineering Reference

## When To Read

Read this reference when the task involves:
- Non-mechanical cross-component code changes
- Architecture, migration, or refactor
- High-risk behavior changes
- Gated delivery chains (>200 lines across multiple subsystems)

## Verification Triggers

Always require independent verification when:
- Code changes behavior, data flow, permissions, or security boundaries
- Implementation contains external facts, numbers, or citations
- Business logic, calculations, or formulas are involved
- Changes affect API contracts or data models

## Plan Patterns

### Simple Feature
```yaml
tasks:
  - id: implement
    title: "Implement feature"
    prompt: "Implement [specific feature] in [location]. Use [specific approach]."
    assigned_to: worker
    verified_by: verifier
    verify_prompt: "Re-run tests and verify the feature works as specified."
    timeout_ms: 1800000
```

### Multi-File Change
```yaml
tasks:
  - id: backend
    title: "Implement backend"
    prompt: "Implement [feature] in [backend location]. Update models, API endpoints."
    assigned_to: backend-expert
    verified_by: verifier
    verify_prompt: "Re-run backend tests. Verify API contracts unchanged."
  - id: frontend
    title: "Implement frontend"
    prompt: "Implement [feature] in [frontend location]. Wire to existing API."
    assigned_to: frontend-expert
    depends_on: [backend]
    verified_by: verifier
    verify_prompt: "Test UI flow end-to-end. Verify frontend calls backend correctly."
  - id: integration
    title: "Integration test"
    prompt: "Run full integration test. Verify [end-to-end scenario]."
    assigned_to: tester
    depends_on: [backend, frontend]
    verified_by: verifier
    verify_prompt: "Verify full flow works. Check logs for errors."
```

### Architecture/Migration
```yaml
tasks:
  - id: analyze
    title: "Analyze current architecture"
    prompt: "Analyze current [subsystem]. Document dependencies and migration risks."
    assigned_to: architect
    verified_by: verifier
    verify_prompt: "Review analysis against actual code. Check for missed dependencies."
  - id: implement
    title: "Implement migration"
    prompt: "Migrate [old approach] to [new approach]. Update all call sites."
    assigned_to: worker
    depends_on: [analyze]
    verified_by: verifier
    verify_prompt: "Re-run tests. Verify no behavior changes. Check migration completeness."
```

### High-Risk Change
```yaml
tasks:
  - id: implement
    title: "Implement risky change"
    prompt: "[Specific high-risk change]"
    assigned_to: worker
    verified_by: verifier
    verify_prompt: "Verify [specific safety properties]. Re-run [critical test suite]."
    max_retries: 3
  - id: review
    title: "Security review"
    prompt: "Review for [specific security concerns]. Check [auth/permissions/data handling]."
    assigned_to: security-reviewer
    depends_on: [implement]
    verified_by: verifier
    verify_prompt: "Verify security findings addressed. No new vulnerabilities introduced."
```

## Anti-Patterns

### ❌ Ceremony Split
```yaml
# BAD - ritual split for obvious work
tasks:
  - id: research
    title: "Research the task"
    prompt: "The user wants a login feature"
  - id: implement
    title: "Implement login"
    prompt: "Implement login feature"
```

### ❌ Keystroke Split
```yaml
# BAD - splitting by file instead of deliverable
tasks:
  - id: file1
    title: "Edit file1.ts"
  - id: file2
    title: "Edit file2.ts"
```

### ✓ Deliverable Split
```yaml
# GOOD - split by deliverable boundary
tasks:
  - id: auth-backend
    title: "Auth backend API"
    prompt: "Implement auth API with JWT tokens. Include login, logout, refresh."
  - id: auth-frontend
    title: "Auth UI flow"
    prompt: "Implement login/logout UI with session management."
```

## Verification Rules

### Must Verify
1. **Tests pass** — Re-run the test suite
2. **No regressions** — Verify related functionality still works
3. **Behavior unchanged** — For refactors, ensure output identical
4. **Edge cases** — Empty inputs, max loads, timeouts
5. **Error handling** — What happens on failure?

### For Security Changes
1. **Auth still works** — Verify authentication flow
2. **Permissions enforced** — Check authorization checks
3. **No injection vectors** — Validate input sanitization
4. **Secrets not exposed** — Verify no logging of sensitive data

### For Data Changes
1. **Schema migration** — Check forward/backward compatibility
2. **Data integrity** — Verify no data loss
3. **Index updates** — Ensure queries still performant

## Example Complete Plan

```yaml
version: 1
plan:
  name: "Add user profile feature"
  max_concurrency: 3
  max_consecutive_failures: 2
  max_cycles: 10
tasks:
  - id: backend-api
    title: "User profile API"
    prompt: |
      Implement user profile CRUD API:
      - GET /users/:id/profile - return profile data
      - PUT /users/:id/profile - update profile
      - Include validation for profile fields
      
      Return JSON. Follow existing API patterns.
    assigned_to: worker
    verified_by: verifier
    verify_prompt: |
      Re-run API tests. Verify:
      - GET returns correct profile shape
      - PUT validates input correctly
      - Auth enforced (401 without token)
    timeout_ms: 1800000

  - id: frontend-form
    title: "Profile edit form"
    prompt: |
      Add profile edit form component:
      - Read profile data from API
      - Form with validation
      - Save updates via PUT endpoint
      
      Follow existing component patterns.
    assigned_to: worker
    depends_on: [backend-api]
    verified_by: verifier
    verify_prompt: |
      Test UI flow:
      - Form loads existing data
      - Validation messages appear
      - Save updates profile correctly
    timeout_ms: 1800000

  - id: integration-test
    title: "End-to-end test"
    prompt: |
      Create e2e test for profile feature:
      - Login as test user
      - Navigate to profile
      - Edit and save changes
      - Verify changes persist
    assigned_to: tester
    depends_on: [frontend-form]
    verified_by: verifier
    verify_prompt: |
      Run the e2e test. Verify full flow works without errors.
```
