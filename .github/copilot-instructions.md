<!-- openspdd:start -->
---
name: copilot-instructions
id: copilot-instructions
category: Configuration
description: GitHub Copilot instruction file with SPDD workflow references
---

# SPDD and SDLC instructions for GitHub Copilot

Read `AGENTS.md` as the canonical source for the repository's required OpenSpec + OpenSPDD SDLC. Follow its Setup → OpenSpec Explore → OpenSpec Propose → SPDD Analysis → REASONS Canvas → alignment review → SPDD implementation sequence. This process is guidance, not a technical write gate.

This project uses the SPDD (Structured Prompt-Driven Development) methodology for AI-assisted development.

## Available Workflows

When asked to use SPDD workflows, invoke the corresponding skills in `.github/skills/`:

### 1. REASONS-Canvas
For structured requirement analysis and prompt generation.
- **Skill**: `.github/skills/spdd-reasons-canvas.md`
- **Usage**: "Use REASONS-Canvas to design [feature description]"
- **Output**: Structured prompt file in `spdd/prompt/` directory

### 2. SPDD Generate
For code generation from structured prompt files.
- **Skill**: `.github/skills/spdd-generate.md`
- **Usage**: "Generate code from @spdd/prompt/[filename].md"
- **Output**: Implementation code following Operations sequence

### 3. SPDD Sync
For syncing code changes back to prompt files.
- **Skill**: `.github/skills/spdd-sync.md`
- **Usage**: "Sync changes to @spdd/prompt/[filename].md"
- **Output**: Updated prompt file reflecting code changes

## How to Use

1. **Read the relevant template file** when I mention an SPDD workflow
2. **Follow the steps** defined in the template
3. **Apply the guardrails** specified in each template

## Quick Reference

| Workflow | When to Use | Template Location |
|----------|-------------|-------------------|
| SPDD Analysis | After OpenSpec Propose | `.github/skills/spdd-analysis.md` |
| REASONS Canvas | After SPDD Analysis | `.github/skills/spdd-reasons-canvas.md` |
| SDLC Alignment | Before implementation | `.github/skills/sdlc-alignment.md` |
| SPDD Generate | After alignment and explicit approval | `.github/skills/spdd-generate.md` |
| SPDD Sync | After approved implementation changes | `.github/skills/spdd-sync.md` |

<!-- openspdd:end -->