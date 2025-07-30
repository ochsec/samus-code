/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  SlashCommand,
  CommandContext,
  SlashCommandActionReturn,
} from './types.js';
import { 
  ModelSwitchingService, 
  TaskEvaluationService,
  ModelStrength
} from '@samus-code/samus-code-core';

let modelSwitchingService: ModelSwitchingService | null = null;
let autoSwitchEnabled = true;

function getModelSwitchingService(context: CommandContext): ModelSwitchingService {
  if (!modelSwitchingService && context.services.config) {
    const taskEvaluator = new TaskEvaluationService();
    modelSwitchingService = new ModelSwitchingService(
      taskEvaluator,
      context.services.config,
      context.services.config.getSessionId()
    );
  }
  
  if (!modelSwitchingService) {
    throw new Error('Model switching service not available');
  }
  
  return modelSwitchingService;
}

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Switch between models or model strengths',
  
  action: async (
    context: CommandContext,
    args: string
  ): Promise<SlashCommandActionReturn | void> => {
    const { config } = context.services;
    
    if (!config) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Configuration not loaded',
      };
    }

    if (!args || args.trim() === '') {
      return {
        type: 'message',
        messageType: 'info',
        content: 'Usage: /model <model-name> or /model weak|strong',
      };
    }

    const modelArg = args.trim().toLowerCase();
    
    try {
      const service = getModelSwitchingService(context);
      const currentConfig = config.getContentGeneratorConfig();
      const currentProvider = currentConfig?.authType;
      
      if (!currentProvider || !currentConfig) {
        return {
          type: 'message',
          messageType: 'error',
          content: 'Unable to determine current provider configuration',
        };
      }

      // Handle weak/strong switching
      if (modelArg === 'weak' || modelArg === 'strong') {
        const strength = modelArg === 'weak' ? ModelStrength.WEAK : ModelStrength.STRONG;
        await service.switchToStrength(strength, currentProvider, currentConfig);
        
        // Update the config with the new model
        const modelConfig = service.getModelConfig(currentProvider);
        if (modelConfig) {
          const newModel = strength === ModelStrength.WEAK ? modelConfig.weak : modelConfig.strong;
          config.setModel(newModel);
        }
        
        return {
          type: 'message',
          messageType: 'info',
          content: `✓ Switched to ${modelArg} model`,
        };
      }
      
      // Handle specific model switching
      await service.switchModel(modelArg, currentProvider, currentConfig);
      
      // Update the config with the new model
      config.setModel(modelArg);
      
      return {
        type: 'message',
        messageType: 'info',
        content: `✓ Switched to ${modelArg}`,
      };
      
    } catch (error) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to switch model: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },
  
  completion: async (
    context: CommandContext,
    partialArg: string
  ): Promise<string[]> => {
    const suggestions = ['weak', 'strong'];
    
    // Add model-specific suggestions based on provider
    const { config } = context.services;
    if (config) {
      const provider = config.getContentGeneratorConfig()?.authType;
      
      // Add common model names based on provider
      switch (provider) {
        case 'ollama':
          suggestions.push('llama3.2', 'llama3.1:70b', 'mistral', 'phi');
          break;
        case 'lm-studio':
          suggestions.push('phi-3-mini', 'mixtral-8x7b');
          break;
        case 'openai':
          suggestions.push('gpt-4', 'gpt-3.5-turbo');
          break;
        default:
          // No additional suggestions for unknown providers
          break;
      }
    }
    
    return suggestions.filter(s => s.startsWith(partialArg.toLowerCase()));
  }
};

export const autoSwitchCommand: SlashCommand = {
  name: 'auto-switch',
  description: 'Enable or disable automatic model switching based on task type',
  
  action: async (
    context: CommandContext,
    args: string
  ): Promise<SlashCommandActionReturn | void> => {
    const arg = args.trim().toLowerCase();
    
    if (arg === 'on') {
      autoSwitchEnabled = true;
      return {
        type: 'message',
        messageType: 'info',
        content: '✓ Auto-switching enabled',
      };
    } else if (arg === 'off') {
      autoSwitchEnabled = false;
      return {
        type: 'message',
        messageType: 'info',
        content: '✓ Auto-switching disabled',
      };
    } else {
      return {
        type: 'message',
        messageType: 'info',
        content: `Auto-switching is currently ${autoSwitchEnabled ? 'enabled' : 'disabled'}. Use /auto-switch on|off to change.`,
      };
    }
  },
  
  completion: async (): Promise<string[]> => ['on', 'off']
};

export function isAutoSwitchEnabled(): boolean {
  return autoSwitchEnabled;
}

export function getModelService(): ModelSwitchingService | null {
  return modelSwitchingService;
}