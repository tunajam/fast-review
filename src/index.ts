import * as core from "@actions/core";
import * as github from "@actions/github";

interface ReviewComment {
  path: string;
  line: number;
  body: string;
  severity: "critical" | "warning" | "info";
}

interface ReviewResult {
  comments: ReviewComment[];
  summary: string;
  flowDiagram: string;
  uxAnalysis: string;
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
  "summary": "One sentence overall assessment",
  "flowDiagram": "Mermaid diagram showing the flow of changes (use graph TD or sequenceDiagram). Show how data/control flows through the new or modified code. Keep it focused on what THIS PR changes.",
  "uxAnalysis": "2-3 sentences analyzing how these changes impact user experience. Does it make things simpler? Faster? More intuitive? Any UX concerns?",
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

async function callOpenRouter(
  apiKey: string,
  model: string,
  prompt: string
): Promise<string> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/tunajam/fast-review",
      "X-Title": "Fast Review",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 4096,
      temperature: 0.3, // Lower temp for more consistent reviews
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${error}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error("No response from OpenRouter");
  }
  
  return content;
}

async function run(): Promise<void> {
  const startTime = Date.now();
  
  try {
    // Get inputs
    const githubToken = core.getInput("github-token", { required: true });
    const openrouterApiKey = core.getInput("openrouter-api-key", { required: true });
    const model = core.getInput("model") || "anthropic/claude-sonnet-4-20250514";
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
    
    core.info(`🔍 Reviewing PR #${prNumber} with ${model}...`);
    
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
    
    // Build prompt
    const prompt = REVIEW_PROMPT
      .replace("{focus_areas}", focusDescription)
      .replace("{diff}", filteredDiff.slice(0, 100000)); // Limit diff size
    
    core.info("🤖 Running AI analysis...");
    
    const responseText = await callOpenRouter(openrouterApiKey, model, prompt);
    
    // Parse response
    let result: ReviewResult;
    try {
      // Handle potential markdown code fences
      let jsonStr = responseText;
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1];
      }
      result = JSON.parse(jsonStr.trim());
    } catch (e) {
      core.warning(`Failed to parse AI response: ${responseText}`);
      result = { 
        summary: "Review completed but response parsing failed", 
        comments: [],
        flowDiagram: "",
        uxAnalysis: ""
      };
    }
    
    // Build review body with flow diagram and UX analysis
    const reviewBody = buildReviewBody(result, countFiles(filteredDiff), startTime, model);
    
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
        body: reviewBody,
        event: result.comments.some(c => c.severity === "critical") ? "REQUEST_CHANGES" : "COMMENT",
        comments: reviewComments,
      });
    } else {
      core.info("✅ No issues found");
      
      await octokit.rest.pulls.createReview({
        ...context.repo,
        pull_number: prNumber,
        body: reviewBody,
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

function buildReviewBody(
  result: ReviewResult, 
  fileCount: number, 
  startTime: number, 
  model: string
): string {
  const reviewTime = Math.round((Date.now() - startTime) / 1000);
  const modelName = model.split('/')[1] || model;
  
  let body = `## ⚡ Fast Review\n\n`;
  body += `${result.summary || "LGTM 👍"}\n\n`;
  
  // Add flow diagram if present
  if (result.flowDiagram && result.flowDiagram.trim()) {
    body += `### 📊 Change Flow\n\n`;
    body += `\`\`\`mermaid\n${result.flowDiagram.trim()}\n\`\`\`\n\n`;
  }
  
  // Add UX analysis if present
  if (result.uxAnalysis && result.uxAnalysis.trim()) {
    body += `### 🎯 UX Impact\n\n`;
    body += `${result.uxAnalysis.trim()}\n\n`;
  }
  
  // Add footer
  body += `---\n_Reviewed ${fileCount} files in ${reviewTime}s with ${modelName}_`;
  
  return body;
}

run();
