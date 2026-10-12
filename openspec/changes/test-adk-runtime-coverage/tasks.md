# Tasks

## 1. Testing the ADK generator

- [x] 1.1 Add focused Vitest coverage for `AdkGenerator` using mocks of the ADK module; verify model/config mapping, conditional Google Search tool, text/audio inputs, and grounded citation mapping with `npm test -- tests/adk-generator.test.ts`.
- [x] 1.2 Cover error events, empty output, timeout and caller abort handling, and session cleanup on success and failure; verify all generator cases pass without network access or credentials.

## 2. Testing the grounded fact-check provider

- [x] 2.1 Add focused `AdkFactCheckProvider` tests with a stubbed `AdkGenerator.generate`; verify research then verdict calls, grounded URLs in the verdict input, and evidence reconciliation using `npm test -- tests/adk-fact-check-provider.test.ts`.
- [x] 2.2 Cover no-citation `insufficient` behavior without a second call, cache hits, parse errors, provider failures, and cancellation; verify failures are observable and unsuccessful results are not cached.

## 3. Integration verification

- [x] 3.1 Run `npm test`, `npm run typecheck`, and `npm run build`; verify all existing tests and the new ADK tests pass without requiring `GOOGLE_API_KEY`.
- [x] 3.2 Confirm the test suite makes no external Gemini or Google Search requests and that no production behavior or HTTP contract changed; verify by reviewing the test setup and scoped diff.
