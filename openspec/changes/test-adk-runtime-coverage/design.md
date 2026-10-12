# Design

## Context

See `proposal.md - Why`. `AdkGenerator` currently constructs `Gemini`, `LlmAgent`, `Runner`, and `InMemorySessionService` internally and maps ADK response events into `LlmOutput`. `AdkFactCheckProvider` consumes that generator for a grounded research call followed by a verdict-formatting call, reusing `reconcileVerdict` and `TtlCache`. Existing tests exercise the legacy `WebSearchProvider` and shared backend behavior, not these ADK-specific paths.

## Goals / Non-Goals

**Goals:**
- Verify ADK request mapping and response handling deterministically without network access.
- Verify the fact-check provider's grounded workflow and its existing error/cache semantics.
- Keep tests compatible with the project's Vitest and TypeScript setup, without new dependencies or real credentials.

**Non-Goals:**
- Change runtime behavior, prompts, HTTP contracts, or provider policy.
- Treat mocked SDK tests as a substitute for a live integration smoke test.
- Add live credentials or external service calls to CI.

## Decisions

### Use Vitest module mocks at the ADK boundary

Mock `@google/adk` in focused `AdkGenerator` tests so constructors, runner events, final-response detection, and session service calls are controlled by fixtures. Assert that generation options map to model configuration, that `GOOGLE_SEARCH` is only supplied when requested, that text/audio parts map correctly, and that grounding chunks become citations. Exercise error events, timeout/abort behavior, empty responses, and session deletion, including failures during execution.

**Alternative considered:** Call Gemini from tests. This would make the suite credential- and network-dependent, less deterministic, and unsuitable as a normal unit-test gate.

### Test `AdkFactCheckProvider` through its existing generator interface

Construct an `AdkGenerator` and replace its `generate` method with a Vitest spy that returns ordered fixtures or rejects. This tests the provider's real call options and inputs without invoking the SDK. Cover the two-call sequence and ensure the second call receives research plus grounded URLs; no citations returns `insufficient` without a second call; verdict evidence is reconciled against research citations; cache hits avoid repeat generation; failures and aborts propagate as provider errors.

**Alternative considered:** Mock the entire ADK package for provider tests as well. That adds unrelated runtime setup to tests of provider orchestration; a mocked generator is the narrower boundary.

### Keep focused test files separate from existing legacy-provider tests

Add dedicated test files for the ADK generator and provider under `tests/`, following the existing Vitest style. Do not remove or rewrite `provider.test.ts`, which still covers shared reconciliation rules and the legacy provider.

**Alternative considered:** Append all cases to `provider.test.ts`. Separate files make it clear which tests protect the new runtime integration and keep unrelated provider coverage easier to navigate.

## Risks / Trade-offs

- SDK implementation changes can invalidate mocked event assumptions without a live API call → Keep event fixtures aligned with the types exposed by the installed ADK package; retain a separately run, opt-in smoke test for external integration.
- Mock-heavy tests may verify wiring but not Gemini service behavior → State that boundary clearly; do not claim they prove grounding quality, remote availability, or model correctness.
- Global module mocks can leak between tests → Keep mocks scoped to dedicated files and reset spies/fixtures between cases.

## Migration Plan

1. Add deterministic unit tests for `AdkGenerator` and verify them with the targeted test runner.
2. Add provider orchestration tests using a stubbed `AdkGenerator.generate`.
3. Run `npm test`, `npm run typecheck`, and `npm run build`.
4. Keep the live smoke test opt-in and outside the default automated suite.

Rollback consists of removing the new tests; production behavior and persisted data are unchanged.
