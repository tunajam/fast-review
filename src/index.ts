import * as core from "@actions/core";
import * as github from "@actions/github";
import Anthropic from "@anthropic-ai/sdk";

interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "info";
}

interface ReviewResult {
  comments: ReviewComment[];
  summary: string;
}

const REVIEW_PROMPT = `You are a senior engineer doing a fast, focused code review.

## Your Focus Areas
{focus_areas}

## Rules
1. Only comment on real issues that could cause bugs, security holes, or accessibility barriers
2. Be specific — include the exact line and what's wrong
3. Be brief — one sentence for the issue, one for the fix
4. Skip: style preferences, formatting, "consider doing X", minor optimizations
5. If the code is fine, return an empty comments array

## Output Format (JSON only, no markdown)
{
  "summary": "One sentence overall assessment or 'LGTM' if no issues",
  "comments": [
    {
      "path": "src/file.ts",
      "line": 42,
      "severity": "critical|warning|info",
      "body": "**Issue**: What's wrong. **Fix**: How to fix it."
    }
  ]
}

## Severity Guide
- critical: Security vulnerability, will definitely cause bugs/crashes, data loss
- warning: Likely to cause issues, missing error handling, race conditions
- info: Accessibility issues, potential edge cases

## The Diff to Review
\`\`\`diff
{diff}
\`\`\`

Review this diff now. Be fast, be accurate, don't waste the developer's time.`;

const FOCUS_AREA_DESCRIPTIONS: Record<string, string> = {
  security: `- Security: SQL injection, XSS, SSRF, auth bypasses, exposed secrets, insecure crypto
  - Check: user input handling, URL validation, authentication/authorization gaps`,
  
  logic: `- Logic bugs: null/undefined access, off-by-one errors, race conditions, infinite loops
  - Check: error handling, edge cases, async/await issues, state management bugs`,
  
  a11y: `- Accessibility: missing alt text, no keyboard navigation, missing ARIA labels
  - Check: form labels, focus management, color contrast issues, screen reader compatibility`,
  
  react: `- React: hooks rules violations, missing deps in useEffect, missing keys in lists
  - Check: stale closures, unnecessary re-renders, improper state updates`,
};

async function run(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Get inputs
    const githubToken = core.getInput("github-token", { required: true });
    const anthropicApiKey = core.getInput("anthropic-api-key", { required: true });
    const model = core.getInput("model") || "claude-sonnet-4-20250514";
    const focusAreas = (core.getInput("focus") || "security,logic,a11y").split(",").map(s => s.trim());
    const maxFiles = parseInt(core.getInput("max-files") || "20", 10);
    const ignorePatterns = (core.getInput("ignore-patterns") || "").split(",").map(s => s.trim()).filter(Boolean);
    
    // Get context
    const context = github.context;
    if (!context.payload.pull_request) {
      core.setFailed("This action only works on pull requests");
      return;
    }
    
    const prNumber = context.payload.pull_request.number;
    const octokit = github.getOctokit(githubToken);
    
    core.info(`🔍 Reviewing PR #${prNumber}...`);
    
    // Get the diff
    const { data: diff } = await octokit.rest.pulls.get({
      ...context.repo,
      pull_number: prNumber,
      mediaType: { format: "diff" },
    });
    
    // Filter the diff
    const filteredDiff = filterDiff(diff as unknown as string, ignorePatterns, maxFiles);
    
    if (!filteredDiff.trim()) {
      core.info("No reviewable files in this PR");
      core.setOutput("issues-found", 0);
      core.setOutput("review-time", Math.round((Date.now() - startTime) / 1000));
      return;
    }
    
    core.info(`📄 Reviewing ${countFiles(filteredDiff)} files...`);
    
    // Build focus areas description
    const focusDescription = focusAreas
      .filter(area => FOCUS_AREA_DESCRIPTIONS[area])
      .map(area => FOCUS_AREA_DESCRIPTIONS[area])
      .join("\n");
    
    // Call Claude
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });
    
    const prompt = REVIEW_PROMPT
      .replace("{focus_areas}", focusDescription)
      .replace("{diff}", filteredDiff.slice(0, 100000)); // Limit diff size
    
    core.info("🤖 Running AI analysis...");
    
    const response = await anthropic.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });
    
    // Parse response
    const content = response.content[0];
    if (content.type !== "text") {
      throw new Error("Unexpected response type from Claude");
    }
    
    let result: ReviewResult;
    try {
      // Handle potential markdown code fences
      let jsonStr = content.text;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      result = JSON.parse(jsonStr.trim());
    } catch (e) {
      core.warning(`Failed to parse AI response: ${content.text}`);
      result = { summary: "Review completed but response parsing failed", comments: [] };
    }
    
    // Post review
    if (result.comments.length > 0) {
      core.info(`📝 Found ${result.comments.length} issues, posting review...`);
      
      const reviewComments = result.comments.map(c => ({
        path: c.path,
        line: c.line,
        body: formatComment(c),
      }));
      
      await octokit.rest.pulls.createReview({
        ...context.repo,
        pull_number: prNumber,
        body: `## Fast Review\n\n${result.summary}\n\n_Reviewed in ${Math.round((Date.now() - startTime) / 1000)}s_`,
        event: result.comments.some(c => c.severity === "critical") ? "REQUEST_CHANGES" : "COMMENT",
        comments: reviewComments,
      });
    } else {
      core.info("✅ No issues found");
      
      await octokit.rest.pulls.createReview({
        ...context.repo,
        pull_number: prNumber,
        body: `## Fast Review\n\n${result.summary || "LGTM 👍"}\n\n_Reviewed in ${Math.round((Date.now() - startTime) / 1000)}s_`,
        event: "APPROVE",
      });
    }
    
    // Set outputs
    const reviewTime = Math.round((Date.now() - startTime) / 1000);
    core.setOutput("issues-found", result.comments.length);
    core.setOutput("review-time", reviewTime);
    
    core.info(`⚡ Review complete in ${reviewTime}s`);
    
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed("An unexpected error occurred");
    }
  }
}

function filterDiff(diff: string, ignorePatterns: string[], maxFiles: number): string {
  const files = diff.split(/(?=^diff --git)/m);
  
  const filtered = files.filter(file => {
    const match = file.match(/^diff --git a\/(.+?) b\//);
    if (!match) return false;
    
    const path = match[1];
    
    // Check ignore patterns (simple glob matching)
    for (const pattern of ignorePatterns) {
      if (matchGlob(path, pattern)) {
        return false;
      }
    }
    
    return true;
  });
  
  // Apply max files limit
  const limited = maxFiles > 0 ? filtered.slice(0, maxFiles) : filtered;
  
  return limited.join("");
}

function matchGlob(path: string, pattern: string): boolean {
  // Simple glob matching: * matches anything except /, ** matches anything
  const regex = pattern
    .replace(/\*\*/g, "{{GLOBSTAR}}")
    .replace(/\*/g, "[^/]*")
    .replace(/{{GLOBSTAR}}/g, ".*")
    .replace(/\?/g, ".");
  
  return new RegExp(`^${regex}$`).test(path);
}

function countFiles(diff: string): number {
  return (diff.match(/^diff --git/gm) || []).length;
}

function formatComment(comment: ReviewComment): string {
  const emoji = comment.severity === "critical" ? "🚨" : 
                comment.severity === "warning" ? "⚠️" : "💡";
  return `${emoji} ${comment.body}`;
}

run();
