# SPDD Analysis: Automated Coverage for the ADK Runtime

## Original Business Requirement

### `openspec/changes/test-adk-runtime-coverage/.openspec.yaml` (verbatim)

```yaml
schema: spec-driven
created: 2026-10-12
skip_specs: true
```

### `openspec/changes/test-adk-runtime-coverage/proposal.md` (verbatim)

```markdown
# Proposal

## Why

The backend's ADK adapter and fact-check provider are the integration boundary to Gemini and Google Search Grounding, but the existing tests primarily exercise the previous provider abstraction with fakes. Automated tests for the ADK-specific request mapping, event handling, cleanup, and grounded two-call flow will make regressions reproducible without a real API key or network access.

## What Changes

- Add focused automated tests for `AdkGenerator` using deterministic doubles around the ADK boundary.
- Add focused automated tests for `AdkFactCheckProvider` using a fake generator, covering grounded citations, the research-to-verdict sequence, no-citation behavior, cache behavior, and failures/cancellation.
- Keep live Gemini/Google Search smoke tests separate and opt-in; do not require credentials in unit tests or CI.
- Preserve current runtime behavior and public HTTP/API contracts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change adds test coverage only and does not alter system behavior or requirements; `skip_specs: true` is set in `.openspec.yaml`.

## Impact

- Tests: add focused coverage under `tests/` for `server/src/adk-generator.ts` and `server/src/adk-fact-check-provider.ts`.
- Runtime code and HTTP contracts: unchanged.
- Dependencies and credentials: no new dependencies; unit tests must not use real credentials or external network access.
```

### `openspec/changes/test-adk-runtime-coverage/design.md` (verbatim)

```markdown
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
```

### `openspec/changes/test-adk-runtime-coverage/tasks.md` (verbatim)

```markdown
# Tasks

## 1. Testing the ADK generator

- [ ] 1.1 Add focused Vitest coverage for `AdkGenerator` using mocks of the ADK module; verify model/config mapping, conditional Google Search tool, text/audio inputs, and grounded citation mapping with `npm test -- tests/adk-generator.test.ts`.
- [ ] 1.2 Cover error events, empty output, timeout and caller abort handling, and session cleanup on success and failure; verify all generator cases pass without network access or credentials.

## 2. Testing the grounded fact-check provider

- [ ] 2.1 Add focused `AdkFactCheckProvider` tests with a stubbed `AdkGenerator.generate`; verify research then verdict calls, grounded URLs in the verdict input, and evidence reconciliation using `npm test -- tests/adk-fact-check-provider.test.ts`.
- [ ] 2.2 Cover no-citation `insufficient` behavior without a second call, cache hits, parse errors, provider failures, and cancellation; verify failures are observable and unsuccessful results are not cached.

## 3. Integration verification

- [ ] 3.1 Run `npm test`, `npm run typecheck`, and `npm run build`; verify all existing tests and the new ADK tests pass without requiring `GOOGLE_API_KEY`.
- [ ] 3.2 Confirm the test suite makes no external Gemini or Google Search requests and that no production behavior or HTTP contract changed; verify by reviewing the test setup and scoped diff.
```

## Domain Concept Identification

#### Existing Concepts (from codebase)

- **Fact-check result**: a claim assessment with a status, summary, evidence, limitations, provider identity, and timestamp; produced by `AdkFactCheckProvider` and exposed through the existing backend contract.
- **Grounded citation/evidence**: source material returned by Google Search Grounding that constrains which sources may substantiate a verdict; reconciled by existing provider logic.
- **Text generation**: backend capability shared by transcription, topic classification, claim extraction, and fact-checking, with `AdkGenerator` adapting it to Google ADK.
- **Runtime session**: temporary ADK execution state used for a generation and removed after completion; its lifecycle is owned by the generator.
- **Test double**: a controlled substitute for an external runtime boundary that allows tests to check application behavior without credentials or network calls.
- **Live integration smoke test**: a separately run check of the actual Google service integration; distinct from deterministic unit tests.

#### New Concepts Required

- **ADK runtime test coverage**: repeatable evidence that the adapter's mapping and lifecycle behavior remain compatible with the application's expected generator contract.
- **Grounded-flow test coverage**: repeatable evidence that fact-check orchestration uses grounded citations, does not invent a verdict in the absence of citations, and retains its cache/error policy.

#### Conceptual Relationships

The application uses the generator adapter to communicate with the external ADK/Gemini runtime. The fact-check provider combines generated research with grounded citations before producing a result. Deterministic tests control the external boundary and verify the application's contracts; the live smoke test provides complementary evidence about remote integration, not about the correctness of all application rules.

#### Key Business Rules

- Tests run in the default suite must not require Google credentials or call Gemini/Google Search.
- Fact-check evidence must remain limited to grounded citations; a lack of citations must not be treated as proof that a claim is false.
- Runtime/API behavior is explicitly out of scope for this test-only change.
- Automated doubles and a live smoke test provide different forms of confidence and must not be represented as interchangeable.

## Strategic Approach

#### Solution Direction

Add focused unit-level verification at the boundary between backend behavior and the ADK runtime, while preserving the existing provider and HTTP contracts. Use deterministic substitutes for remote execution in normal tests; retain real-service validation as a separate, opt-in activity.

#### Key Design Decisions

- **Separate adapter tests from provider-orchestration tests**: isolates runtime event mapping from grounded fact-check policy, making failures easier to diagnose.
- **Keep the external service out of unit tests**: favors determinism, safe CI operation, and no credential handling in tests; it does not prove remote availability or grounding quality.
- **Preserve the existing legacy-provider tests**: avoids deleting still-useful evidence for shared reconciliation behavior while adding coverage for the replacement runtime.
- **Avoid production changes unless testability is demonstrably blocked**: maintains the promised no-behavior-change scope and limits changes to the necessary test boundary.
- **Use full project checks after focused tests**: targeted tests provide quick feedback, while the project's existing test, typecheck, and build gates check integration with the broader codebase.

#### Alternatives Considered

- **Make unit tests call the live Google API**: rejected because it requires credentials and network access and produces nondeterministic results.
- **Treat the existing manual smoke test as sufficient**: rejected because it does not provide repeatable regression coverage for local ADK-specific behavior.
- **Refactor production interfaces preemptively for mocking**: rejected unless tests demonstrate an actual obstacle; otherwise it expands the scope of a tests-only change.

## Risk & Gap Analysis

#### Requirement Ambiguities

- **Meaning of “failures/cancellation”**: the proposal groups provider failures and cancellation, but does not define whether cancellation should be asserted as a particular typed error or only as observable rejection. Resolve the exact assertion from the existing runtime contract during detailed test design; do not silently change runtime behavior.
- **Meaning of “unsuccessful results are not cached”**: task 2.2 says to verify this behavior, but a no-citation response is an intentional `insufficient` result and is cached in the current provider. The intended distinction is unclear: likely errors are not cached, while a completed insufficient result is cached. Confirm before asserting this task as currently worded.
- **Live smoke-test ownership and cadence**: it is stated to be opt-in but no owner or invocation convention is specified. This can remain outside the unit-test change unless the project wants a formal smoke-test process.

#### Edge Cases

- A session may fail to initialize, the runner may throw, or cleanup may itself reject; tests should distinguish primary execution failures from cleanup outcomes without changing behavior implicitly.
- The ADK may emit multiple events, no final response, a final response without grounding metadata, or grounding entries without a usable URL.
- A caller abort and the configured timeout can occur close together; tests should verify the established precedence rather than assume cancellation outcomes.
- The cache treats a completed no-citation response as an `insufficient` result; this is distinct from a rejected/failed generation and should be covered as such.

#### Technical Risks

- **Mock fidelity**: tests can encode incorrect assumptions about ADK events. Keep fixtures based on the installed package's types and avoid claiming remote service behavior is verified.
- **Cleanup reliability**: a failure path could leave an in-memory session behind. The test boundary should observe session lifecycle on both successful and unsuccessful runs.
- **Vague cache acceptance wording**: interpreting all `insufficient` results as “unsuccessful” conflicts with current code, which caches no-citation results. Clarify this before implementation to prevent a test from codifying a behavior change accidentally.
- **No direct ADK tests found in the current test tree**: a targeted search for `AdkGenerator`, `AdkFactCheckProvider`, and `@google/adk` under `tests/` returned no matches, so the new suite will establish the first automated sensor for those paths.

#### Acceptance Criteria Coverage

| AC# | Description | Addressable? | Gaps/Notes |
|-----|-------------|--------------|------------|
| 1 | `AdkGenerator` maps model configuration, tools, text/audio inputs, and grounded citations correctly. | Yes | Mock adapter boundary; event fixtures must align with installed ADK types. |
| 2 | `AdkGenerator` reports runner errors, empty output, timeout, and caller abort while cleaning up sessions. | Partial | Cancellation/timeout precedence and cleanup failure behavior are not specified; preserve existing behavior. |
| 3 | `AdkFactCheckProvider` performs grounded research before verdict formatting and reconciles only grounded citations. | Yes | Provider orchestration can be deterministic with generator fixtures. |
| 4 | No-citation research returns `insufficient` without a verdict-generation call. | Yes | This is observable provider behavior and can be asserted without network access. |
| 5 | Cache hits, parsing failures, provider failures, and cancellation preserve current semantics. | Partial | The task's “unsuccessful results are not cached” wording conflicts with the current no-citation result cache; clarify whether “unsuccessful” means an exception only. |
| 6 | Full tests, typecheck, and build pass without a Google key or external calls. | Yes | Existing project scripts provide these gates; actual invocation belongs to implementation. |

## Analysis Summary

- **Project type**: Full-stack TypeScript project; the change is scoped to backend runtime tests.
- **Existing concepts identified**: 6.
- **New concepts required**: 2.
- **Key design decisions**: 5.
- **Acceptance-criteria coverage**: 4 fully addressable, 2 partial pending semantic clarification.
- **Open questions/risks**: clarify cache wording and cancellation semantics before test implementation.
