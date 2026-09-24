// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';
import {
  getSearchResultTags,
  getSearchResultVideoId,
  groupSearchResultIndicesByTag,
} from '../redux/search/searchResult';
import { createSearchResult } from './testUtils';

describe('search result presentation helpers', () => {
  it('normalizes CSV, array, object, nested metadata, and video tags once', () => {
    const result = createSearchResult({
      metadata: {
        tags: [' lobby ', { name: 'dock' }, { label: 'gate' }, { tag: 'lobby' }],
        video_metadata: { tags: ['parking'] },
      },
      video: { tags: ['dock', 'office'] },
    });

    expect(getSearchResultTags(result)).toEqual(['lobby', 'dock', 'gate', 'parking', 'office']);
  });

  it('uses metadata id and then the enriched video id when video_id is absent', () => {
    const metadataFallback = createSearchResult({ metadata: { video_id: '', id: 'metadata-id' } });
    const videoFallback = createSearchResult({
      metadata: { video_id: '', id: '' },
      video: { videoId: 'enriched-id' },
    });

    expect(getSearchResultVideoId(metadataFallback)).toBe('metadata-id');
    expect(getSearchResultVideoId(videoFallback)).toBe('enriched-id');
  });

  it('groups indices by tag, keeps every hit per video, and sorts by relevance', () => {
    const results = [
      createSearchResult({ metadata: { video_id: 'low', tags: 'shared', relevance_score: 0.2 } }),
      createSearchResult({ metadata: { video_id: 'high', tags: 'shared,other', relevance_score: 0.9 } }),
      createSearchResult({ metadata: { video_id: 'high', tags: 'shared', relevance_score: 0.7 } }),
    ];

    expect(groupSearchResultIndicesByTag(results)).toEqual([
      { tag: 'shared', resultIndices: [1, 2, 0], videoCount: 2 },
      { tag: 'other', resultIndices: [1], videoCount: 1 },
    ]);
  });

  it('retains identified results without tags in the Untagged group', () => {
    const results = [createSearchResult({ metadata: { video_id: 'untagged', tags: '' }, video: { tags: [] } })];

    expect(groupSearchResultIndicesByTag(results)).toEqual([{ tag: 'Untagged', resultIndices: [0], videoCount: 1 }]);
  });
});
