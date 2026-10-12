---
name: /sdlc-alignment
id: sdlc-alignment
category: Development
description: Review alignment between an OpenSpec change and its OpenSPDD analysis and REASONS Canvas before implementation
---

# SDLC Alignment Gate

Run phase 5 of this repository's OpenSpec + OpenSPDD workflow. This is a read-only review and a process gate; it does not edit artifacts or enforce writes through hooks.

## Inputs

Require paths for:

1. The OpenSpec change directory, such as `@openspec/changes/<change-name>/`.
2. The matching SPDD analysis under `spdd/analysis/`.
3. The matching REASONS Canvas prompt under `spdd/prompt/`.

If any input is missing or the change/prompt relationship is unclear, ask the user for the specific path. Do not guess based on a filename alone.

## Review

Read the OpenSpec proposal, design, tasks, `.openspec.yaml`, and all applicable delta specs, plus the complete SPDD analysis and prompt. Check:

1. The user outcome and scope in the proposal are preserved in Requirements.
2. Domain concepts, architecture direction, risks, and constraints in the analysis are reflected consistently in Entities, Approach, Structure, Norms, and Safeguards.
3. Every OpenSpec requirement and task has corresponding prompt coverage, especially in Operations; Operations must not add unapproved scope.
4. Every material risk or open question is either resolved, represented as an explicit constraint, or blocks the gate.
5. Quality gates, compatibility expectations, secrets handling, and out-of-scope behavior are consistent.
6. `skip_specs` is used only when the change does not alter externally observable requirements.

## Outcome

Return a concise mapping of the artifacts and a definite result:

- **BLOCKED** if there is a material mismatch, missing artifact, unresolved decision, or uncovered task. Identify the exact artifact/section to revisit and stop; do not silently edit it.
- **READY FOR APPROVAL** only when the review passes. Explain that this result is not permission to implement.

When ready, ask the user whether to authorize phase 6. Do not start `/spdd-generate` until the user explicitly says to implement. After approval, the user or agent may invoke `/spdd-generate` with the reviewed prompt. If artifacts change after this review, rerun phase 5.
