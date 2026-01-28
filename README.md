# ⚡ Fast Review

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
          anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token for API access | ✅ | - |
| `anthropic-api-key` | Anthropic API key for Claude | ✅ | - |
| `model` | Claude model to use | ❌ | `claude-sonnet-4-20250514` |
| `focus` | Focus areas (comma-separated) | ❌ | `security,logic,a11y` |
| `max-files` | Max files to review (0 = no limit) | ❌ | `20` |
| `ignore-patterns` | Glob patterns to ignore | ❌ | `*.lock,*.min.js,...` |

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
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    focus: security
```

### Full review for React projects

```yaml
- uses: tunajam/fast-review@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
    focus: security,logic,a11y,react
```

## License

MIT
