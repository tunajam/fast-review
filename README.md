# ⚡ Fast Review

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-Fast%20Review-yellow?logo=github)](https://github.com/marketplace/actions/fast-review)
[![GitHub release](https://img.shields.io/github/v/release/tunajam/fast-review)](https://github.com/tunajam/fast-review/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

AI code review in under 60 seconds. Security, logic, a11y — no fluff.

## Why?

Other AI reviewers are slow and noisy. Fast Review is:
- **Fast**: Reviews complete in <60 seconds
- **Focused**: Only flags real issues (security, bugs, a11y)
- **Quiet**: No style nitpicks, no "consider doing X"

## Usage

```yaml
name: Code Review

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    
    steps:
      - uses: tunajam/fast-review@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | ✅ | - |
| `openrouter-api-key` | OpenRouter API key | ✅ | - |
| `model` | Any OpenRouter model | ❌ | `anthropic/claude-sonnet-4-20250514` |
| `focus` | Focus areas (comma-separated) | ❌ | `security,logic,a11y` |
| `max-files` | Max files to review (0 = no limit) | ❌ | `20` |
| `ignore-patterns` | Glob patterns to ignore | ❌ | `*.lock,*.min.js,...` |
| `context7` | Enable Context7 for library docs | ❌ | `false` |
| `context7-api-key` | Context7 API key (if using API) | ❌ | - |
| `skills` | URLs to skill files loaded as review context | ❌ | - |
| `system-prompt` | Custom text appended to the review prompt | ❌ | - |
| `posthog-api-key` | PostHog key for review analytics | ❌ | - |

## Focus Areas

- **security**: Injection, XSS, SSRF, auth issues, exposed secrets
- **logic**: Null access, race conditions, error handling, edge cases
- **a11y**: Alt text, ARIA labels, keyboard navigation, focus management
- **react**: Hooks rules, missing deps, keys, stale closures

## Outputs

| Output | Description |
|--------|-------------|
| `issues-found` | Number of issues found |
| `review-time` | Time taken in seconds |

## Examples

### Security-focused review

```yaml
- uses: tunajam/fast-review@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
    focus: security
```

### Full review with Gemini Flash (fast & cheap)

```yaml
- uses: tunajam/fast-review@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
    model: google/gemini-2.0-flash-001
    focus: security,logic,a11y,react
```

### With Context7 for latest library docs

```yaml
- uses: tunajam/fast-review@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    openrouter-api-key: ${{ secrets.OPENROUTER_API_KEY }}
    context7: true
    context7-api-key: ${{ secrets.CONTEXT7_API_KEY }}  # Optional if ctx7 CLI is in PATH
```

Context7 automatically detects libraries in your code (React, Next.js, Convex, etc.) and fetches the latest docs to catch deprecated APIs and incorrect usage patterns.

## License

MIT
