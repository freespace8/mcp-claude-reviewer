# MCP Claude Reviewer 提示词优化指南

## 概述

本文档详细阐述了 MCP Claude Reviewer 项目中提示词系统的优化建议，旨在提升代码审查的效率、准确性和用户体验。

## 1. 核心提示词结构优化

### 1.1 当前问题分析

现有提示词存在以下问题：
- **冗余度高**：JSON 格式说明占用大量 token（约 40% 的提示词内容）
- **结构松散**：信息分散，缺乏层次感
- **缺乏动态性**：无法根据项目特征调整审查策略

### 1.2 优化方案

#### 简化主提示词结构

```typescript
// src/prompts/review-prompt.ts 优化版本
export function generateOptimizedReviewPrompt(
  request: ReviewRequest,
  changedFiles: string[],
  projectContext?: ProjectContext
): string {
  const basePrompt = `You are an expert code reviewer specializing in ${projectContext?.type || 'software'} architecture.

## Review Context
${request.summary}

## Changes Scope
- Files: ${changedFiles.length}
- Focus: ${request.focus_areas?.join(', ') || 'General review'}
${request.test_command ? `- Tests: \`${request.test_command}\`` : ''}

## Review Standards
1. Architecture alignment with design docs
2. Missing requirements identification  
3. Security and performance implications

${getProjectSpecificGuidelines(projectContext)}

Output: Structured JSON review per standard format.`;

  return basePrompt;
}
```

#### 动态上下文注入

```typescript
interface ProjectContext {
  type: 'frontend' | 'backend' | 'fullstack' | 'library';
  language: string;
  framework?: string;
  customRules?: string[];
}

function getProjectSpecificGuidelines(context?: ProjectContext): string {
  if (!context) return '';
  
  const guidelines = {
    frontend: `- Component reusability and composition
- State management patterns
- Accessibility compliance
- Bundle size impact`,
    
    backend: `- API contract consistency
- Database query optimization
- Authentication/authorization
- Error handling patterns`,
    
    fullstack: `- Frontend/backend contract alignment
- Data flow consistency
- End-to-end type safety
- Deployment considerations`,
    
    library: `- Public API design
- Breaking changes detection
- Documentation completeness
- Backward compatibility`
  };
  
  return `## ${context.type} Specific Guidelines
${guidelines[context.type] || ''}
${context.customRules ? `\n## Project Rules\n${context.customRules.join('\n')}` : ''}`;
}
```

## 2. Resume 功能增强

### 2.1 智能增量审查

```typescript
export function generateIncrementalReviewPrompt(
  request: ReviewRequest,
  changesSinceLastReview: string[],
  previousIssues: ReviewIssue[]
): string {
  return `## Incremental Review Session

### Previous Issues Status
${previousIssues.map(issue => 
  `- [${issue.resolved ? '✓' : '○'}] ${issue.description}`
).join('\n')}

### New Changes
${changesSinceLastReview.map(file => `- ${file}`).join('\n')}

### Review Focus
1. Verify previous issues are properly addressed
2. Ensure no regression in fixed areas
3. Review new changes for consistency

${request.focus_areas?.length ? `\nSpecial attention: ${request.focus_areas.join(', ')}` : ''}

Continue with standard JSON review format.`;
}
```

### 2.2 会话管理优化

```typescript
interface ReviewSession {
  id: string;
  claudeSessionId: string;
  model: string;
  context: {
    projectType: string;
    reviewedFiles: Set<string>;
    knownIssues: Map<string, ReviewIssue>;
    designDocDigest: string;
  };
}
```

## 3. 智能文档处理

### 3.1 设计文档摘要生成

```typescript
class DocumentProcessor {
  async processDesignDocs(docs: string[]): Promise<DocumentSummary> {
    const summaries = await Promise.all(
      docs.map(doc => this.extractKeyPoints(doc))
    );
    
    return {
      architectureRules: this.mergeArchitectureRules(summaries),
      dataModels: this.mergeDataModels(summaries),
      constraints: this.mergeConstraints(summaries)
    };
  }
  
  private async extractKeyPoints(docPath: string): Promise<DocSummary> {
    const content = await readFile(docPath);
    
    // 使用正则或 AST 解析提取关键信息
    return {
      entities: this.extractEntities(content),
      rules: this.extractRules(content),
      examples: this.extractCodeExamples(content)
    };
  }
}
```

### 3.2 相关性评分系统

```typescript
function calculateRelevanceScore(
  changedFile: string,
  designDoc: DocumentSummary
): number {
  let score = 0;
  
  // 文件路径匹配
  if (designDoc.coveredPaths.some(path => changedFile.includes(path))) {
    score += 0.4;
  }
  
  // 实体引用匹配
  const fileContent = readFileSync(changedFile);
  const referencedEntities = extractReferencedEntities(fileContent);
  const matchingEntities = referencedEntities.filter(
    e => designDoc.entities.includes(e)
  );
  score += (matchingEntities.length / referencedEntities.length) * 0.6;
  
  return score;
}
```

## 4. 审查配置系统

### 4.1 项目级配置文件

```yaml
# .claude-reviewer.yaml
version: 1.0
projectType: fullstack
language: typescript

reviewProfiles:
  default:
    severity: balanced
    focusAreas:
      - architecture
      - security
      - performance
    
  strict:
    severity: high
    focusAreas:
      - architecture
      - security
      - testCoverage
    requireTests: true
    blockOnCritical: true
    
  quick:
    severity: low
    focusAreas:
      - criticalBugs
    maxFiles: 10
    skipPatterns:
      - "*.test.ts"
      - "*.spec.ts"
      - "*.mock.ts"

customRules:
  - "All API endpoints must have OpenAPI documentation"
  - "Database queries must use parameterized statements"
  - "React components must be typed with TypeScript"
  
fileTypeRules:
  "*.controller.ts":
    - "Validate all input parameters"
    - "Include error handling for all endpoints"
  "*.component.tsx":
    - "Include accessibility attributes"
    - "Memoize expensive computations"
```

### 4.2 动态配置加载

```typescript
class ReviewConfigManager {
  private cache = new Map<string, ReviewConfig>();
  
  async loadProjectConfig(projectPath: string): Promise<ReviewConfig> {
    const cached = this.cache.get(projectPath);
    if (cached && !this.isStale(cached)) {
      return cached;
    }
    
    const config = await this.parseConfigFile(projectPath);
    const enrichedConfig = await this.enrichWithAutoDetection(
      config,
      projectPath
    );
    
    this.cache.set(projectPath, enrichedConfig);
    return enrichedConfig;
  }
  
  private async enrichWithAutoDetection(
    config: ReviewConfig,
    projectPath: string
  ): Promise<ReviewConfig> {
    // 自动检测项目类型
    if (!config.projectType) {
      config.projectType = await this.detectProjectType(projectPath);
    }
    
    // 自动检测测试命令
    if (!config.testCommand) {
      config.testCommand = await this.detectTestCommand(projectPath);
    }
    
    return config;
  }
}
```

## 5. 输出格式优化

### 5.1 分级输出结构

```typescript
interface OptimizedReviewOutput {
  // 快速摘要
  summary: {
    status: 'approved' | 'needs_changes' | 'blocked';
    criticalCount: number;
    testsPassed: boolean | null;
    estimatedFixTime: 'minutes' | 'hours' | 'days';
  };
  
  // 关键问题（仅包含必须修复的）
  blockers: Array<{
    file: string;
    issue: string;
    suggestedFix: string;
  }>;
  
  // 改进建议（可选修复）
  suggestions?: Array<{
    category: 'performance' | 'style' | 'maintainability';
    description: string;
    impact: 'low' | 'medium' | 'high';
  }>;
  
  // 详细信息（按需展开）
  details?: {
    fileReviews: Map<string, FileReview>;
    metricsAnalysis: MetricsReport;
    dependencyImpact: DependencyAnalysis;
  };
}
```

### 5.2 渐进式详情展示

```typescript
class ReviewFormatter {
  formatProgressive(
    review: ReviewResult,
    detailLevel: 'summary' | 'standard' | 'detailed'
  ): string {
    switch (detailLevel) {
      case 'summary':
        return this.formatSummaryOnly(review);
      case 'standard':
        return this.formatStandardView(review);
      case 'detailed':
        return this.formatDetailedView(review);
    }
  }
  
  private formatSummaryOnly(review: ReviewResult): string {
    return `
## Review Summary
- Status: ${review.summary.status}
- Critical Issues: ${review.summary.criticalCount}
- Tests: ${review.summary.testsPassed ? '✓ Passed' : '✗ Failed'}

${review.summary.criticalCount > 0 ? 
  `\n### Must Fix\n${review.blockers.map(b => `- ${b.issue}`).join('\n')}` : 
  'No blocking issues found.'}
`;
  }
}
```

## 6. 性能优化策略

### 6.1 批处理优化

```typescript
class BatchReviewProcessor {
  async processBatch(files: string[], batchSize: number = 5): Promise<ReviewResult[]> {
    const batches = this.createBatches(files, batchSize);
    const results = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(file => this.reviewFile(file))
      );
      results.push(...batchResults);
      
      // 提供进度更新
      this.emitProgress({
        processed: results.length,
        total: files.length,
        currentBatch: batches.indexOf(batch) + 1,
        totalBatches: batches.length
      });
    }
    
    return results;
  }
}
```

### 6.2 缓存策略

```typescript
class ReviewCache {
  private fileHashCache = new Map<string, string>();
  private reviewCache = new LRUCache<string, ReviewResult>({
    maxSize: 100,
    ttl: 3600000 // 1 hour
  });
  
  async getCachedOrReview(
    file: string,
    reviewer: Reviewer
  ): Promise<ReviewResult> {
    const currentHash = await this.calculateFileHash(file);
    const cacheKey = `${file}:${currentHash}`;
    
    const cached = this.reviewCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    
    const result = await reviewer.reviewFile(file);
    this.reviewCache.set(cacheKey, result);
    
    return result;
  }
}
```

## 7. 错误处理与恢复

### 7.1 容错提示词

```typescript
const ERROR_HANDLING_PROMPT = `
If you encounter any issues during review:
1. Partial failures: Continue with available information
2. File access errors: Mark as "requires_manual_review"
3. Parse errors: Provide best-effort analysis
4. Missing context: Request additional information

Always return valid JSON even in error scenarios:
{
  "status": "partial_review",
  "completed_sections": [...],
  "errors": [{
    "type": "file_access|parse|context",
    "file": "path/to/file",
    "message": "Description of issue"
  }],
  "recommendations": "Next steps for complete review"
}
`;
```

### 7.2 自动恢复机制

```typescript
class ReviewRecovery {
  async reviewWithRetry(
    request: ReviewRequest,
    maxAttempts: number = 3
  ): Promise<ReviewResult> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.performReview(request);
      } catch (error) {
        lastError = error as Error;
        
        if (this.isRecoverable(error)) {
          await this.applyRecoveryStrategy(error, attempt);
          continue;
        }
        
        throw error;
      }
    }
    
    throw new Error(`Review failed after ${maxAttempts} attempts: ${lastError?.message}`);
  }
  
  private isRecoverable(error: unknown): boolean {
    const recoverableErrors = [
      'TIMEOUT',
      'RATE_LIMIT',
      'SESSION_EXPIRED',
      'PARTIAL_RESPONSE'
    ];
    
    return recoverableErrors.some(
      type => (error as Error).message?.includes(type)
    );
  }
}
```

## 8. 集成测试验证

### 8.1 提示词测试框架

```typescript
describe('Review Prompt Optimization', () => {
  it('should generate concise prompts', async () => {
    const prompt = generateOptimizedReviewPrompt(mockRequest, mockFiles);
    
    expect(prompt.length).toBeLessThan(1000); // Token limit
    expect(prompt).toContain('Review Context');
    expect(prompt).not.toContain('JSON format explanation');
  });
  
  it('should adapt to project type', async () => {
    const frontendPrompt = generateOptimizedReviewPrompt(
      mockRequest,
      mockFiles,
      { type: 'frontend' }
    );
    
    expect(frontendPrompt).toContain('Component reusability');
    expect(frontendPrompt).toContain('State management');
  });
});
```

## 9. 迁移计划

### 9.1 分阶段实施

1. **第一阶段**（1-2周）
   - 实现简化的提示词结构
   - 添加项目类型检测
   - 优化 Resume 功能

2. **第二阶段**（2-3周）
   - 实现配置系统
   - 添加缓存机制
   - 优化批处理

3. **第三阶段**（3-4周）
   - 完善错误处理
   - 添加性能监控
   - 用户反馈收集

### 9.2 向后兼容性

```typescript
class PromptMigration {
  async generatePrompt(
    request: ReviewRequest,
    options: { useOptimized?: boolean } = {}
  ): Promise<string> {
    if (options.useOptimized || this.isOptInEnabled()) {
      return this.generateOptimizedPrompt(request);
    }
    
    // 降级到原始提示词
    return this.generateLegacyPrompt(request);
  }
}
```

## 10. 监控与指标

### 10.1 性能指标

```typescript
interface ReviewMetrics {
  promptTokens: number;
  responseTokens: number;
  reviewDuration: number;
  cacheHitRate: number;
  errorRate: number;
  userSatisfaction: number;
}

class MetricsCollector {
  async trackReview(review: ReviewResult, metrics: ReviewMetrics): Promise<void> {
    await this.storage.saveMetrics({
      timestamp: new Date(),
      reviewId: review.review_id,
      ...metrics,
      efficiency: this.calculateEfficiency(metrics)
    });
  }
  
  private calculateEfficiency(metrics: ReviewMetrics): number {
    const tokenEfficiency = 1 - (metrics.promptTokens / 4000); // Assuming 4k baseline
    const timeEfficiency = 1 - (metrics.reviewDuration / 60000); // 60s baseline
    const qualityScore = 1 - metrics.errorRate;
    
    return (tokenEfficiency + timeEfficiency + qualityScore) / 3;
  }
}
```

## 总结

这些优化建议旨在：

1. **减少 Token 使用**：通过简化提示词结构，预计可减少 40-50% 的 token 使用
2. **提高审查质量**：通过项目特定规则和智能上下文，提升审查的相关性
3. **改善用户体验**：通过分级输出和进度反馈，让用户更好地理解审查结果
4. **增强可维护性**：通过配置系统和模块化设计，简化未来的扩展和维护

实施这些优化后，预期将显著提升 MCP Claude Reviewer 的效率和用户满意度。