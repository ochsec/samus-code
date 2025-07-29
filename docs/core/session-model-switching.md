# Session Model Switching Implementation Plan

## Overview

This document outlines the implementation plan for adding **runtime model switching within a single CLI session** while preserving conversation context. The feature supports **Ollama**, **LM Studio**, and **OpenRouter** (or any OpenAI-compatible provider) and automatically discovers each model's context length to avoid token-limit errors.

Additionally, this implementation includes support for **weak and strong models**, where:
- **Strong models** are used for repository exploration, planning, and troubleshooting
- **Weak models** are used for implementation tasks

---

## Goals

1. Allow users to switch models **without restarting** the CLI.
2. **Preserve** the full conversation history, tool calls, and state.
3. **Discover** the exact context length of the new model before continuing.
4. **Compress** the conversation if necessary to fit the new limit.
5. Support **Ollama**, **LM Studio**, and **OpenRouter** out of the box.
6. Enable **automatic model selection** based on task type (strong for exploration/planning, weak for implementation).
7. Support manual switching between weak/strong model variants.

---

## High-Level Flow

```
User runs /model <name>
        │
        ├─► Serialize current conversation
        ├─► Fetch new model’s context length
        ├─► Compress conversation if needed
        ├─► Re-initialize provider with new model
        └─► Re-hydrate conversation & continue
```

---

## 1. Core Changes

### 1.1 New Auth Types

```ts
// packages/core/src/core/contentGenerator.ts
export enum AuthType {
  …
  USE_OLLAMA     = 'ollama',
  USE_LM_STUDIO  = 'lm-studio',
  USE_OPENROUTER   = 'openrouter'
}
```

### 1.2 Context-Length Discovery

| Provider   | Endpoint                        | Field to read     |
|------------|----------------------------------|-------------------|
| **Ollama** | `GET /api/show`                  | `context_length`  |
| **LM Studio** | `GET /v1/models`               | `max_tokens`      |
| **OpenRouter** | `GET https://openrouter.ai/api/v1/models` | `context_length` |

```ts
// packages/core/src/core/contextDiscovery.ts
export async function fetchContextLength(
  provider: AuthType,
  model: string,
  baseUrl?: string
): Promise<number> {
  switch (provider) {
    case AuthType.USE_OLLAMA: {
      const res = await fetch(`${baseUrl}/api/show`);
      const data = await res.json();
      return data.context_length ?? 32_768;
    }
    case AuthType.USE_LM_STUDIO: {
      const res = await fetch(`${baseUrl}/v1/models`);
      const data = await res.json();
      return data.data.find((m: any) => m.id === model)?.context_length ?? 32_768;
    }
    case AuthType.USE_OPENROUTER: {
      const res = await fetch('https://openrouter.ai/api/v1/models');
      const data = await res.json();
      return data.data.find((m: any) => m.id === model)?.context_length ?? 32_768;
    }
    default:
      return 32_768;
  }
}
```

### 1.3 Model Strength Types

```ts
// packages/core/src/core/types.ts
export enum ModelStrength {
  WEAK = 'weak',
  STRONG = 'strong'
}

export enum TaskType {
  EXPLORATION = 'exploration',
  PLANNING = 'planning',
  TROUBLESHOOTING = 'troubleshooting',
  IMPLEMENTATION = 'implementation'
}

export interface ModelConfig {
  weak: string;
  strong: string;
}
```

### 1.4 Task Evaluation Service

```ts
// packages/core/src/core/taskEvaluationService.ts
export class TaskEvaluationService {
  async evaluateTaskType(
    userPrompt: string,
    conversationHistory: Message[],
    evaluatorModel: ContentGenerator
  ): Promise<TaskType> {
    const evaluationPrompt = `
      Given the following user request and conversation history, classify the task type.
      
      Task Types:
      - EXPLORATION: Understanding codebase structure, finding files, discovering patterns
      - PLANNING: Designing features, architectural decisions, breaking down complex tasks
      - TROUBLESHOOTING: Debugging, fixing errors, investigating issues
      - IMPLEMENTATION: Writing code, making edits, executing planned changes
      
      User Request: "${userPrompt}"
      
      Respond with only the task type, nothing else.
    `;
    
    const response = await evaluatorModel.generate({
      messages: [
        ...conversationHistory.slice(-5), // Last 5 messages for context
        { role: 'user', content: evaluationPrompt }
      ],
      temperature: 0.1 // Low temperature for consistent classification
    });
    
    const taskType = response.content.trim().toUpperCase();
    return TaskType[taskType as keyof typeof TaskType] || TaskType.IMPLEMENTATION;
  }
}
```

### 1.5 Model Switching Service

```ts
// packages/core/src/core/modelSwitchingService.ts
export class ModelSwitchingService {
  private modelConfigs: Map<AuthType, ModelConfig> = new Map();
  private taskEvaluator: TaskEvaluationService;
  private currentStrength: ModelStrength = ModelStrength.WEAK;

  constructor(taskEvaluator: TaskEvaluationService) {
    this.taskEvaluator = taskEvaluator;
    this.loadModelConfigs();
  }

  private loadModelConfigs() {
    // Load from environment variables
    this.modelConfigs.set(AuthType.USE_OLLAMA, {
      weak: process.env.OLLAMA_MODEL_WEAK || 'llama3.2',
      strong: process.env.OLLAMA_MODEL_STRONG || 'llama3.1:70b'
    });
    
    this.modelConfigs.set(AuthType.USE_LM_STUDIO, {
      weak: process.env.LM_STUDIO_MODEL_WEAK || 'phi-3-mini',
      strong: process.env.LM_STUDIO_MODEL_STRONG || 'mixtral-8x7b'
    });
    
    this.modelConfigs.set(AuthType.USE_OPENROUTER, {
      weak: process.env.OPENROUTER_MODEL_WEAK || 'mistralai/Mistral-7B-Instruct-v0.2',
      strong: process.env.OPENROUTER_MODEL_STRONG || 'anthropic/claude-3.5-sonnet'
    });
  }

  getModelForTask(taskType: TaskType, provider: AuthType): string {
    const config = this.modelConfigs.get(provider);
    if (!config) throw new Error(`No model config for provider ${provider}`);
    
    switch (taskType) {
      case TaskType.EXPLORATION:
      case TaskType.PLANNING:
      case TaskType.TROUBLESHOOTING:
        return config.strong;
      case TaskType.IMPLEMENTATION:
        return config.weak;
      default:
        return config.weak;
    }
  }

  async switchModel(
    newModel: string,
    newProvider: AuthType,
    config: ContentGeneratorConfig
  ): Promise<void> {
    // 1. Snapshot current state
    const snapshot = this.serializeSession();

    // 2. Get new context length
    const limit = await fetchContextLength(newProvider, newModel, config.baseUrl);

    // 3. Compress if needed
    const compressed = await this.compress(snapshot, limit);

    // 4. Re-initialize provider
    const newGenerator = await createContentGenerator(
      { ...config, model: newModel, authType: newProvider },
      this.gcConfig
    );

    // 5. Re-hydrate conversation
    await this.rehydrate(newGenerator, compressed);
  }

  async switchToStrength(
    strength: ModelStrength,
    provider: AuthType,
    config: ContentGeneratorConfig
  ): Promise<void> {
    const modelConfig = this.modelConfigs.get(provider);
    if (!modelConfig) throw new Error(`No model config for provider ${provider}`);
    
    const model = strength === ModelStrength.WEAK ? modelConfig.weak : modelConfig.strong;
    this.currentStrength = strength;
    await this.switchModel(model, provider, config);
  }

  async autoSwitchBasedOnTask(
    userPrompt: string,
    conversationHistory: Message[],
    provider: AuthType,
    config: ContentGeneratorConfig,
    currentGenerator: ContentGenerator
  ): Promise<boolean> {
    // Always use weak model for task evaluation (more efficient)
    let evaluatorGenerator = currentGenerator;
    
    // If we're currently on strong model, temporarily switch to weak for evaluation
    if (this.currentStrength === ModelStrength.STRONG) {
      const modelConfig = this.modelConfigs.get(provider);
      if (!modelConfig) throw new Error(`No model config for provider ${provider}`);
      
      evaluatorGenerator = await createContentGenerator(
        { ...config, model: modelConfig.weak, authType: provider },
        this.gcConfig
      );
    }
    
    // Use weak model to evaluate the task
    const taskType = await this.taskEvaluator.evaluateTaskType(
      userPrompt,
      conversationHistory,
      evaluatorGenerator
    );
    
    const requiredStrength = this.getStrengthForTask(taskType);
    
    // Only switch if we need a different strength
    if (requiredStrength !== this.currentStrength) {
      await this.switchToStrength(requiredStrength, provider, config);
      return true; // Switched
    }
    
    return false; // No switch needed
  }

  private getStrengthForTask(taskType: TaskType): ModelStrength {
    switch (taskType) {
      case TaskType.EXPLORATION:
      case TaskType.PLANNING:
      case TaskType.TROUBLESHOOTING:
        return ModelStrength.STRONG;
      case TaskType.IMPLEMENTATION:
      default:
        return ModelStrength.WEAK;
    }
  }
}
```

---

## 2. CLI Integration

### 2.1 New Slash Commands

```bash
# Switch to a specific model
> /model llama3
✓ Switched to llama3 (context: 4096 tokens)

# Switch to weak model for current provider
> /model weak
✓ Switched to weak model: llama3.2 (context: 4096 tokens)

# Switch to strong model for current provider
> /model strong
✓ Switched to strong model: llama3.1:70b (context: 128000 tokens)

# Auto-switching based on task detection (weak model evaluates the task)
> Let me explore your codebase structure...
✓ Task evaluated as: EXPLORATION (by weak model)
✓ Auto-switched to strong model: llama3.1:70b

# Disable auto-switching
> /auto-switch off
✓ Auto-switching disabled

# Enable auto-switching
> /auto-switch on
✓ Auto-switching enabled
```

### 2.2 Environment Variables

```bash
# Ollama
export OLLAMA_BASE_URL="http://localhost:11434"
export OLLAMA_MODEL_WEAK="llama3.2"
export OLLAMA_MODEL_STRONG="llama3.1:70b"

# LM Studio
export LM_STUDIO_BASE_URL="http://localhost:1234"
export LM_STUDIO_MODEL_WEAK="phi-3-mini"
export LM_STUDIO_MODEL_STRONG="mixtral-8x7b"

# OpenRouter
export OPENROUTER_API_KEY="sk-..."
export OPENROUTER_MODEL_WEAK="mistralai/Mistral-7B-Instruct-v0.2"
export OPENROUTER_MODEL_STRONG="anthropic/claude-3.5-sonnet"
```

---

## 3. Context Preservation

- **Conversation array** – user / assistant / tool turns
- **Tool registry** – re-register tools for new provider
- **Memory state** – loaded `GEMINI.md` files
- **Abort controllers** – cancel any in-flight requests
- **Current model strength** – track whether using weak or strong model
- **Task context** – maintain understanding of current task type

### 3.1 UI Updates

The CLI already displays the current model in the Footer component (`packages/cli/src/ui/components/Footer.tsx`). When switching models:

```ts
// Update the model display in Footer
// The Footer component receives the model prop (line 21, 35)
// Update this whenever model switches occur

// In the session context or model switching handler:
setCurrentModel(newModelName);

// Footer will automatically reflect the change:
<Footer
  model={currentModel}  // This needs to be updated on switch
  // ... other props
/>
```

---

## 4. Compression Strategy

Reuse the existing `/compress` logic (or call it internally) to shrink the conversation **before** switching providers. The compressor will receive the new context length as a hard ceiling.

---

## 5. Testing Plan

| Test Type | Scope |
|-----------|-------|
| **Unit** | `fetchContextLength`, `switchModel`, compression, `getModelForTask`, `switchToStrength` |
| **Integration** | Full round-trip against real Ollama/LM Studio/OpenRouter with weak/strong models |
| **Edge Cases** | Unreachable endpoints, missing fields, oversized history, missing env vars |
| **Task Detection** | Verify correct model selection for different task types |

---

## 6. Security & Performance

- **Caching** – store fetched limits keyed by `provider+model`.
- **Timeouts** – 5 s for discovery calls, 3 s for task evaluation.
- **Secrets** – never log API keys; use existing secure storage.
- **Evaluation Efficiency** – Always use weak model for task evaluation to minimize cost and latency.
- **Temporary Generator** – Create ephemeral weak model instance only when needed for evaluation.
- **Fallback** – If task evaluation fails, default to current model strength.

---

## 7. Implementation Timeline

| Phase | Days | Deliverables |
|-------|------|--------------|
| **Core plumbing** | 2 | `fetchContextLength`, `switchModel`, model strength types |
| **Weak/Strong support** | 1 | `getModelForTask`, `switchToStrength`, env var loading |
| **CLI glue** | 1 | `/model` command variants, Footer updates, auto-switching |
| **Testing** | 1 | Unit + integration tests including task detection |
| **Docs & polish** | 1 | README, examples, migration guide |

**Total: ~6 days** for a production-ready MVP with weak/strong model support.

---

## 8. Future Work

- Auto-detect running local servers (`ollama ps`).
- Interactive model picker (`/model` with fuzzy search).
- Load-balancing across multiple local servers.
- More granular model strength categories (e.g., `tiny`, `medium`, `large`).
- Task-specific model recommendations based on performance metrics.
- Automatic fallback from strong to weak models on errors or timeouts.
- Model performance tracking and adaptive selection.