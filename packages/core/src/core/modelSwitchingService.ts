/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  ContentGenerator, 
  ContentGeneratorConfig, 
  AuthType,
  createContentGenerator
} from './contentGenerator.js';
import { TaskEvaluationService } from './taskEvaluationService.js';
import { ModelStrength, TaskType, ModelConfig } from './modelTypes.js';
import { fetchContextLength } from './contextDiscovery.js';
import { Turn } from './turn.js';
import { GeminiChat } from './geminiChat.js';
import { Config } from '../config/config.js';
import { Content } from '@google/genai';

export interface SessionSnapshot {
  history: Content[];
  config: ContentGeneratorConfig;
  currentModel: string;
  currentProvider: AuthType;
  timestamp: Date;
}

export class ModelSwitchingService {
  private modelConfigs: Map<AuthType, ModelConfig> = new Map();
  private taskEvaluator: TaskEvaluationService;
  private currentStrength: ModelStrength = ModelStrength.WEAK;
  private currentGenerator: ContentGenerator | null = null;
  private currentChat: GeminiChat | null = null;
  private gcConfig: Config;
  private sessionId?: string;

  constructor(
    taskEvaluator: TaskEvaluationService, 
    gcConfig: Config,
    sessionId?: string
  ) {
    this.taskEvaluator = taskEvaluator;
    this.gcConfig = gcConfig;
    this.sessionId = sessionId;
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
    
    // OpenRouter uses OpenAI auth type
    this.modelConfigs.set(AuthType.USE_OPENAI, {
      weak: process.env.OPENAI_MODEL_WEAK || 
            'mistralai/Mistral-7B-Instruct-v0.2',
      strong: process.env.OPENAI_MODEL_STRONG || 
              'anthropic/claude-3.5-sonnet'
    });
  }

  getCurrentStrength(): ModelStrength {
    return this.currentStrength;
  }

  getModelConfig(provider: AuthType): ModelConfig | undefined {
    return this.modelConfigs.get(provider);
  }

  getModelForTask(taskType: TaskType, provider: AuthType): string {
    const config = this.modelConfigs.get(provider);
    if (!config) throw new Error(`No model config for provider ${provider}`);
    
    switch (taskType) {
      case TaskType.EXPLORATION:
      case TaskType.PLANNING:
      case TaskType.TROUBLESHOOTING:
      case TaskType.REVIEW:
        return config.strong;
      case TaskType.DOCUMENTATION:
      case TaskType.IMPLEMENTATION:
      default:
        return config.weak;
    }
  }

  private serializeSession(): SessionSnapshot | null {
    if (!this.currentChat || !this.currentGenerator) {
      return null;
    }

    // Get current config from gcConfig
    const currentConfig = this.gcConfig.getContentGeneratorConfig();

    return {
      history: this.currentChat.getHistory(),
      config: currentConfig || {} as ContentGeneratorConfig,
      currentModel: currentConfig?.model || '',
      currentProvider: currentConfig?.authType || AuthType.USE_GEMINI,
      timestamp: new Date()
    };
  }

  private async compress(
    snapshot: SessionSnapshot, 
    _contextLimit: number
  ): Promise<SessionSnapshot> {
    // TODO: Implement conversation compression logic
    // For now, return the snapshot as-is
    // This should integrate with the existing /compress logic
    return snapshot;
  }

  private async rehydrate(
    generator: ContentGenerator, 
    snapshot: SessionSnapshot
  ): Promise<void> {
    // Create new chat with the preserved history
    this.currentChat = new GeminiChat(this.gcConfig, generator, {}, snapshot.history);
    this.currentGenerator = generator;
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
    const compressed = snapshot ? await this.compress(snapshot, limit) : null;

    // 4. Re-initialize provider
    const newConfig = { ...config, model: newModel, authType: newProvider };
    const newGenerator = await createContentGenerator(
      newConfig,
      this.gcConfig,
      this.sessionId
    );

    // 5. Re-hydrate conversation
    if (compressed) {
      await this.rehydrate(newGenerator, compressed);
    } else {
      // Fresh start
      this.currentChat = new GeminiChat(this.gcConfig, newGenerator);
      this.currentGenerator = newGenerator;
    }
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
    conversationHistory: Turn[],
    provider: AuthType,
    config: ContentGeneratorConfig,
    currentGenerator: ContentGenerator
  ): Promise<boolean> {
    // Always use weak model for task evaluation (more efficient)
    let evaluatorGenerator = currentGenerator;
    
    // If we're currently on strong model, temporarily create weak for evaluation
    if (this.currentStrength === ModelStrength.STRONG) {
      const modelConfig = this.modelConfigs.get(provider);
      if (!modelConfig) throw new Error(`No model config for provider ${provider}`);
      
      const weakConfig = { ...config, model: modelConfig.weak, authType: provider };
      evaluatorGenerator = await createContentGenerator(
        weakConfig,
        this.gcConfig,
        this.sessionId
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
      case TaskType.REVIEW:
        return ModelStrength.STRONG;
      case TaskType.DOCUMENTATION:
      case TaskType.IMPLEMENTATION:
      default:
        return ModelStrength.WEAK;
    }
  }

  getCurrentGenerator(): ContentGenerator | null {
    return this.currentGenerator;
  }

  getCurrentChat(): GeminiChat | null {
    return this.currentChat;
  }

  async evaluateTaskType(userPrompt: string): Promise<TaskType> {
    // Use simple keyword-based classification
    const prompt = userPrompt.toLowerCase();
    
    // Check for exploration keywords
    if (prompt.includes('understand') || prompt.includes('explore') || prompt.includes('find') || 
        prompt.includes('discover') || prompt.includes('show me') || prompt.includes('what is') ||
        prompt.includes('how does') || prompt.includes('explain')) {
      return TaskType.EXPLORATION;
    }
    
    // Check for planning keywords  
    if (prompt.includes('plan') || prompt.includes('design') || prompt.includes('architect') ||
        prompt.includes('approach') || prompt.includes('strategy') || prompt.includes('break down')) {
      return TaskType.PLANNING;
    }
    
    // Check for troubleshooting keywords
    if (prompt.includes('debug') || prompt.includes('fix') || prompt.includes('error') ||
        prompt.includes('issue') || prompt.includes('problem') || prompt.includes('troubleshoot')) {
      return TaskType.TROUBLESHOOTING;
    }
    
    // Check for review keywords
    if (prompt.includes('review') || prompt.includes('analyze') || prompt.includes('audit') ||
        prompt.includes('suggestions') || prompt.includes('improve') || prompt.includes('optimize')) {
      return TaskType.REVIEW;
    }
    
    // Check for documentation keywords
    if (prompt.includes('document') || prompt.includes('readme') || prompt.includes('comment') ||
        prompt.includes('docs') || prompt.includes('api doc')) {
      return TaskType.DOCUMENTATION;
    }
    
    // Default to implementation
    return TaskType.IMPLEMENTATION;
  }
}