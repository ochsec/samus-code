# Session Model Switching Implementation Plan

## Overview

This document outlines the implementation plan for adding **runtime model switching within a single CLI session** while preserving conversation context. The feature supports **Ollama**, **LM Studio**, and **OpenRouter** (or any OpenAI-compatible provider) and automatically discovers each model’s context length to avoid token-limit errors.

---

## Goals

1. Allow users to switch models **without restarting** the CLI.
2. **Preserve** the full conversation history, tool calls, and state.
3. **Discover** the exact context length of the new model before continuing.
4. **Compress** the conversation if necessary to fit the new limit.
5. Support **Ollama**, **LM Studio**, and **OpenRouter** out of the box.

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

### 1.3 Model Switching Service

```ts
// packages/core/src/core/modelSwitchingService.ts
export class ModelSwitchingService {
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
}
```

---

## 2. CLI Integration

### 2.1 New Slash Command

```bash
# Inside the running CLI
> /model llama3
✓ Switched to llama3 (context: 4096 tokens)
```

### 2.2 Environment Variables

```bash
# Ollama
export OLLAMA_BASE_URL="http://localhost:11434"
export OLLAMA_MODEL="llama3"

# LM Studio
export LM_STUDIO_BASE_URL="http://localhost:1234"
export LM_STUDIO_MODEL="local-model"

# OpenRouter
export OPENROUTER_API_KEY="sk-..."
export OPENROUTER_MODEL="mistralai/Mistral-7B-Instruct-v0.2"
```

---

## 3. Context Preservation

- **Conversation array** – user / assistant / tool turns
- **Tool registry** – re-register tools for new provider
- **Memory state** – loaded `GEMINI.md` files
- **Abort controllers** – cancel any in-flight requests

---

## 4. Compression Strategy

Reuse the existing `/compress` logic (or call it internally) to shrink the conversation **before** switching providers. The compressor will receive the new context length as a hard ceiling.

---

## 5. Testing Plan

| Test Type | Scope |
|-----------|-------|
| **Unit** | `fetchContextLength`, `switchModel`, compression |
| **Integration** | Full round-trip against real Ollama/LM Studio/OpenRouter |
| **Edge Cases** | Unreachable endpoints, missing fields, oversized history |

---

## 6. Security & Performance

- **Caching** – store fetched limits keyed by `provider+model`.
- **Timeouts** – 5 s for discovery calls.
- **Secrets** – never log API keys; use existing secure storage.

---

## 7. Implementation Timeline

| Phase | Days | Deliverables |
|-------|------|--------------|
| **Core plumbing** | 2 | `fetchContextLength`, `switchModel` |
| **CLI glue** | 1 | `/model` command, Ink UI |
| **Testing** | 1 | Unit + integration tests |
| **Docs & polish** | 1 | README, examples |

**Total: ~5 days** for a production-ready MVP.

---

## 8. Future Work

- Auto-detect running local servers (`ollama ps`).
- Interactive model picker (`/model` with fuzzy search).
- Load-balancing across multiple local servers.