/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

import { ContentGenerator } from './contentGenerator.js';
import { TaskType } from './modelTypes.js';
import { Turn } from './turn.js';
import { Content } from '@google/genai';

export class TaskEvaluationService {
  async evaluateTaskType(
    userPrompt: string,
    conversationHistory: Turn[],
    evaluatorModel: ContentGenerator
  ): Promise<TaskType> {
    const evaluationPrompt = `Given the following user request and conversation history, classify the task type.
      
Task Types:
- EXPLORATION: Understanding codebase structure, finding files, discovering patterns
- PLANNING: Designing features, architectural decisions, breaking down complex tasks  
- TROUBLESHOOTING: Debugging, fixing errors, investigating issues
- REVIEW: Code review, analysis, security audits, performance evaluation
- DOCUMENTATION: Writing docs, README files, comments, API documentation
- IMPLEMENTATION: Writing code, making edits, executing planned changes

User Request: "${userPrompt}"

Respond with only the task type, nothing else.`;
    
    try {
      // Convert Turn[] to Content[] for the API
      const contents: Content[] = [{
        role: 'user',
        parts: [{ text: evaluationPrompt }]
      }];
      
      const response = await evaluatorModel.generateContent({
        model: 'default', // Will use the model configured in the content generator
        contents,
        config: {
          temperature: 0.1 // Low temperature for consistent classification
        }
      });
      
      const responseText = response.text?.trim() || '';
      const taskType = responseText.toUpperCase();
      const result = TaskType[taskType as keyof typeof TaskType] || TaskType.IMPLEMENTATION;
      
      return result;
    } catch (error) {
      console.warn('Failed to evaluate task type, defaulting to IMPLEMENTATION:', error);
      return TaskType.IMPLEMENTATION;
    }
  }
}