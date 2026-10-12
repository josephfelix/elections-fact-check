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
