/**
 * @license
 * Copyright 2025 Chris Ochsenreither
 * SPDX-License-Identifier: Apache-2.0
 */

export enum ModelStrength {
  WEAK = 'weak',
  STRONG = 'strong'
}

export enum TaskType {
  EXPLORATION = 'exploration',
  PLANNING = 'planning',
  TROUBLESHOOTING = 'troubleshooting',
  REVIEW = 'review',
  DOCUMENTATION = 'documentation',
  IMPLEMENTATION = 'implementation'
}

export interface ModelConfig {
  weak: string;
  strong: string;
}