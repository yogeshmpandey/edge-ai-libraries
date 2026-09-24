// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
export interface PromptEditing {
  open: string;
  heading: string;
  prompt: string;
  submitValue: string | null;
  vars: string[];
}

export enum MuxFeatures {
  SEARCH,
  SUMMARY,
}

export enum ResultsView {
  LIST = 'list',
  GROUPS = 'groups',
  MAP = 'map',
}

export interface UISliceState {
  promptEditing: PromptEditing | null;
  selectedMux: MuxFeatures;
  resultsView: ResultsView;
}
export interface OpenPromptModal {
  heading: string;
  prompt: string;
  openToken: string;
}
