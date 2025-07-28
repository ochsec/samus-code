# Adding Local LLM Providers (Ollama & LM Studio)

This guide explains how to add support for local LLM servers like Ollama and LM Studio to the Samus Code core package.

## Overview

Local LLM servers provide a way to run language models on your own hardware, offering privacy, cost savings, and offline capabilities. Both Ollama and LM Studio expose OpenAI-compatible APIs, making integration straightforward.

## Current Architecture

The codebase currently supports the following LLM providers:
- Google Gemini API (`USE_GEMINI`)
- Google Vertex AI (`USE_VERTEX_AI`)
- OpenAI API (`USE_OPENAI`)
- OAuth/Cloud Shell authentication

The provider abstraction is handled through:
- `ContentGenerator` interface (packages/core/src/core/contentGenerator.ts)
- `ContentGeneratorConfig` for configuration
- Provider-specific implementations (e.g., `OpenAIContentGenerator`)

## Implementation Plan

### 1. Add New Authentication Types

Update `packages/core/src/core/contentGenerator.ts` to include new auth types:

```typescript
export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
  USE_OPENAI = 'openai',
  USE_OLLAMA = 'ollama',        // New
  USE_LM_STUDIO = 'lm-studio',  // New
}
```

### 2. Update Configuration Handling

Extend the `createContentGeneratorConfig` function to handle local servers:

```typescript
// In createContentGeneratorConfig function

// Handle Ollama
if (authType === AuthType.USE_OLLAMA) {
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || model || 'llama3';
  
  return {
    model: ollamaModel,
    apiKey: '', // Not required for local servers
    baseUrl: ollamaBaseUrl,
    authType,
  };
}

// Handle LM Studio
if (authType === AuthType.USE_LM_STUDIO) {
  const lmStudioBaseUrl = process.env.LM_STUDIO_BASE_URL || 'http://localhost:1234';
  const lmStudioModel = process.env.LM_STUDIO_MODEL || model || 'local-model';
  
  return {
    model: lmStudioModel,
    apiKey: '', // Not required for local servers
    baseUrl: lmStudioBaseUrl,
    authType,
  };
}
```

### 3. Create Content Generator Implementations

Since both Ollama and LM Studio provide OpenAI-compatible APIs, we can extend the existing OpenAI implementation:

#### OllamaContentGenerator (packages/core/src/core/ollamaContentGenerator.ts)

```typescript
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { Config } from '../config/config.js';

export class OllamaContentGenerator extends OpenAIContentGenerator {
  constructor(baseUrl: string, model: string, config: Config) {
    // Ollama doesn't require an API key
    super('not-required', model, config);
    
    // Override the OpenAI client configuration
    this.client = new OpenAI({
      apiKey: 'not-required',
      baseURL: `${baseUrl}/v1`, // Ollama serves OpenAI-compatible API at /v1
      timeout: 120000,
      maxRetries: 3,
    });
  }
  
  // Override methods if Ollama has specific differences
  async listModels(): Promise<string[]> {
    // Implement Ollama-specific model listing
    const response = await fetch(`${this.baseUrl}/api/tags`);
    const data = await response.json();
    return data.models.map((m: any) => m.name);
  }
}
```

#### LMStudioContentGenerator (packages/core/src/core/lmStudioContentGenerator.ts)

```typescript
import { OpenAIContentGenerator } from './openaiContentGenerator.js';
import { Config } from '../config/config.js';

export class LMStudioContentGenerator extends OpenAIContentGenerator {
  constructor(baseUrl: string, model: string, config: Config) {
    // LM Studio doesn't require an API key
    super('not-required', model, config);
    
    // Override the OpenAI client configuration
    this.client = new OpenAI({
      apiKey: 'not-required',
      baseURL: baseUrl, // LM Studio serves at root
      timeout: 120000,
      maxRetries: 3,
    });
  }
  
  // LM Studio specific overrides if needed
}
```

### 4. Update Content Generator Factory

Modify `createContentGenerator` in `contentGenerator.ts`:

```typescript
export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  // ... existing code ...
  
  if (config.authType === AuthType.USE_OLLAMA) {
    const { OllamaContentGenerator } = await import('./ollamaContentGenerator.js');
    return new OllamaContentGenerator(config.baseUrl!, config.model, gcConfig);
  }

  if (config.authType === AuthType.USE_LM_STUDIO) {
    const { LMStudioContentGenerator } = await import('./lmStudioContentGenerator.js');
    return new LMStudioContentGenerator(config.baseUrl!, config.model, gcConfig);
  }
  
  // ... rest of existing code ...
}
```

### 5. Environment Variables

Add support for the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server URL |
| `OLLAMA_MODEL` | `llama3` | Default Ollama model |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234` | LM Studio server URL |
| `LM_STUDIO_MODEL` | `local-model` | Default LM Studio model |

### 6. Additional Features

#### Health Check Implementation

```typescript
async function checkLocalServerHealth(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/health`, { 
      method: 'GET',
      timeout: 5000 
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

#### Model Discovery

```typescript
// For Ollama
async function getOllamaModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/api/tags`);
  const data = await response.json();
  return data.models.map((model: any) => model.name);
}

// For LM Studio
async function getLMStudioModels(baseUrl: string): Promise<string[]> {
  const response = await fetch(`${baseUrl}/v1/models`);
  const data = await response.json();
  return data.data.map((model: any) => model.id);
}
```

## Usage Examples

### Using Ollama

```bash
# Start Ollama server
ollama serve

# Set environment variables
export OLLAMA_BASE_URL="http://localhost:11434"
export OLLAMA_MODEL="llama3"

# Run with Ollama
samus-code --auth ollama
```

### Using LM Studio

```bash
# Start LM Studio server (from LM Studio GUI)

# Set environment variables
export LM_STUDIO_BASE_URL="http://localhost:1234"
export LM_STUDIO_MODEL="TheBloke/Mistral-7B-Instruct-v0.2-GGUF"

# Run with LM Studio
samus-code --auth lm-studio
```

## Benefits of This Approach

1. **Minimal Code Duplication**: By extending the OpenAI implementation, we reuse existing logic
2. **Consistent Interface**: The rest of the application doesn't need to know about provider differences
3. **Easy Testing**: Can test against OpenAI API and expect similar behavior
4. **Maintainability**: Changes to the OpenAI implementation automatically benefit local providers

## Considerations

### Performance
- Local models may have different response times
- Token limits vary by model and available hardware
- Streaming behavior might differ slightly

### Error Handling
- Connection refused errors when servers aren't running
- Model not found errors
- Out of memory errors for large models

### Security
- Local servers typically don't require authentication
- Consider network security if exposing local servers

## Testing Strategy

1. **Unit Tests**: Mock the OpenAI client for both providers
2. **Integration Tests**: Test against actual local servers when available
3. **Fallback Testing**: Verify graceful degradation when servers are unavailable

## Future Enhancements

1. **Auto-discovery**: Automatically detect running local servers
2. **Model Management**: Download and manage models through the CLI
3. **Performance Monitoring**: Track local model performance metrics
4. **Multi-server Support**: Load balance across multiple local servers