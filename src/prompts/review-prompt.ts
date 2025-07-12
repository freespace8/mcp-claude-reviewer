import { ReviewRequest, ReviewResult } from '../types.js';
import { readFileSync, existsSync } from 'fs';

// Enums for better type safety
export enum Severity {
  Critical = 'critical',
  Major = 'major',
  Minor = 'minor',
  Suggestion = 'suggestion'
}

export enum Category {
  Architecture = 'architecture',
  Design = 'design',
  Bug = 'bug',
  Performance = 'performance',
  Style = 'style',
  Security = 'security',
  MissingFeature = 'missing_feature'
}

export enum AssessmentResult {
  NeedsChanges = 'needs_changes',
  LgtmWithSuggestions = 'lgtm_with_suggestions',
  Lgtm = 'lgtm'
}

// Constants
const MAX_DOC_LENGTH = 5000;
const TRUNCATION_SUFFIX = '\n... (truncated)';

const REVIEW_PRIORITIES = `## Review Priorities
1. **Design Compliance** - Architecture alignment with docs
2. **Missing Requirements** - Required features/fields  
3. **Structural Issues** - Interfaces, patterns, dependencies
4. **Implementation Quality** - Bugs, security, performance`;

const JSON_OUTPUT_INSTRUCTIONS = `Output ONLY a valid JSON object with the review structure. No other text before or after.`;

// Helper functions
function readDocumentContent(docPath: string, maxLength: number = MAX_DOC_LENGTH): string {
  try {
    if (!existsSync(docPath)) return `(File not found: ${docPath})`;
    const content = readFileSync(docPath, 'utf-8');
    return smartTruncate(content, maxLength);
  } catch (error) {
    return `(Error reading file: ${error instanceof Error ? error.message : 'Unknown error'})`;
  }
}

function smartTruncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  
  // Try to truncate at sensible boundaries
  const truncatePoints = ['\n\n', '\n}', '\n]', '\n'];
  for (const point of truncatePoints) {
    const lastIndex = content.lastIndexOf(point, maxLength);
    if (lastIndex > maxLength * 0.8) {
      return content.substring(0, lastIndex) + TRUNCATION_SUFFIX;
    }
  }
  return content.substring(0, maxLength) + TRUNCATION_SUFFIX;
}

export function generateReviewPrompt(
  request: ReviewRequest,
  changedFiles: string[],
  previousRounds?: ReviewResult[],
  isResume: boolean = false
): string {
  const relevantDocs = request.relevant_docs || [];
  const focusAreas = request.focus_areas || [];
  
  // For resume mode, send minimal prompt with context from previous round
  if (isResume && previousRounds && previousRounds.length > 0) {
    const lastRound = previousRounds[previousRounds.length - 1];
    const unresolvedCritical = lastRound.comments.filter(c => c.severity === 'critical').length;
    
    return `## Follow-up Review Request

Previous Assessment: ${lastRound.overall_assessment}
Unresolved Critical Issues: ${unresolvedCritical}

${request.summary}

## Changes Since Last Review
${changedFiles.join('\n')}

${focusAreas.length > 0 ? `## Focus Areas\n${focusAreas.join('\n')}` : ''}

${request.test_command ? `## Test Command\n\`${request.test_command}\`` : ''}

Focus on whether previous issues were addressed. ${JSON_OUTPUT_INSTRUCTIONS}`;
  }
  
  // Build test instructions
  const testInstructions = request.test_command 
    ? `Run tests with: \`${request.test_command}\` and include results.`
    : 'No test command provided - set test_results.passed to null.';

  // Original full prompt for initial reviews
  let prompt = `You are a senior software engineer conducting a code review. Ensure the implementation follows design documents and architectural decisions.

## Review Request
${request.summary}

## Relevant Documentation
${relevantDocs.length > 0 ? relevantDocs.join(', ') : 'None'}

## Changed Files
${changedFiles.join('\n')}

## Focus Areas
${focusAreas.length > 0 ? focusAreas.join('\n') : 'General review'}

## Test Command
${testInstructions}

${REVIEW_PRIORITIES}

## Previous Review Rounds
${previousRounds ? formatPreviousRounds(previousRounds) : 'First review.'}

## Instructions
Focus on architectural issues over minor style issues. ${JSON_OUTPUT_INSTRUCTIONS}

JSON Structure:
{
  "design_compliance": {
    "follows_architecture": boolean,
    "major_violations": [{
      "issue": string,
      "description": string,
      "impact": "critical|major|minor",
      "recommendation": string
    }]
  },
  "comments": [{
    "type": "specific|general",
    "file": string (optional),
    "line": number (optional),
    "severity": "${Object.values(Severity).join('|')}",
    "category": "${Object.values(Category).join('|')}",
    "comment": string,
    "suggested_fix": string (optional)
  }],
  "missing_requirements": [{
    "requirement": string,
    "design_doc_reference": string (optional),
    "severity": "critical|major|minor"
  }],
  "test_results": {
    "passed": boolean | null,
    "summary": string,
    "failing_tests": string[],
    "coverage": string (optional)
  },
  "overall_assessment": "${Object.values(AssessmentResult).join('|')}"
}`;

  // Include relevant documentation content if files exist
  if (relevantDocs.length > 0) {
    prompt += '\n\n## Referenced Documentation Content\n';
    for (const doc of relevantDocs) {
      const content = readDocumentContent(doc);
      prompt += `\n### ${doc}\n\`\`\`\n${content}\n\`\`\`\n`;
    }
  }

  return prompt;
}

function formatPreviousRounds(rounds: ReviewResult[]): string {
  return rounds.map((round, index) => {
    const criticalCount = round.comments.filter(c => c.severity === 'critical').length;
    const majorCount = round.comments.filter(c => c.severity === 'major').length;
    
    return `Round ${index + 1}: ${round.overall_assessment} (${criticalCount} critical, ${majorCount} major issues)`;
  }).join('\n');
}