// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { SearchResult, SearchResultTag, SearchResultTags } from './search';

export interface TagResultGroup {
  tag: string;
  resultIndices: number[];
  /** Number of distinct videos among the group's results. */
  videoCount: number;
}

const addTag = (tags: Set<string>, value: SearchResultTag): void => {
  if (!value || (typeof value !== 'string' && typeof value !== 'object')) return;

  const candidate =
    typeof value === 'string'
      ? value
      : typeof value.tag === 'string'
        ? value.tag
        : typeof value.name === 'string'
          ? value.name
          : typeof value.label === 'string'
            ? value.label
            : '';
  const normalized = candidate.trim();
  if (normalized) tags.add(normalized);
};

const addTags = (tags: Set<string>, values: SearchResultTags | undefined): void => {
  if (typeof values === 'string') {
    values.split(',').forEach((tag) => addTag(tags, tag));
    return;
  }
  values?.forEach((tag) => addTag(tags, tag));
};

/** Return every supported search-result tag shape as trimmed, de-duplicated strings. */
export const getSearchResultTags = (result: SearchResult | null | undefined): string[] => {
  if (!result) return [];

  const tags = new Set<string>();
  addTags(tags, result.metadata?.tags);
  addTags(tags, result.metadata?.video_metadata?.tags);
  addTags(tags, result.video?.tags);
  return Array.from(tags);
};

/** Resolve the stable video identity used to de-duplicate grouped results. */
export const getSearchResultVideoId = (result: SearchResult | null | undefined): string | null => {
  const candidate = result?.metadata?.video_id || result?.metadata?.id || result?.video?.videoId;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : null;
};

const relevanceScore = (result: SearchResult): number => {
  const score = result.metadata?.relevance_score;
  return typeof score === 'number' && Number.isFinite(score) ? score : 0;
};

/** Sort highest relevance first while treating a missing or invalid score as zero. */
export const compareSearchResultsByRelevance = (left: SearchResult, right: SearchResult): number =>
  relevanceScore(right) - relevanceScore(left);

/**
 * Group result indices by normalized tag and sort each group by relevance.
 *
 * Grouping is per search hit rather than per video: a query can return several
 * hits from the same video at different timestamps, and every one of them stays
 * visible. Results with a video identity but no tags are retained in the
 * supplied untagged group.
 */
export const groupSearchResultIndicesByTag = (
  results: SearchResult[] | null | undefined,
  untaggedLabel = 'Untagged',
): TagResultGroup[] => {
  if (!results?.length) return [];

  const groups = new Map<string, { resultIndices: number[]; videoIds: Set<string> }>();

  results.forEach((result, resultIndex) => {
    const videoId = getSearchResultVideoId(result);
    if (!videoId) return;

    const resultTags = getSearchResultTags(result);
    const tags = resultTags.length ? resultTags : [untaggedLabel];

    tags.forEach((tag) => {
      let group = groups.get(tag);
      if (!group) {
        group = { resultIndices: [], videoIds: new Set<string>() };
        groups.set(tag, group);
      }
      group.videoIds.add(videoId);
      group.resultIndices.push(resultIndex);
    });
  });

  return Array.from(groups, ([tag, group]) => ({
    tag,
    resultIndices: group.resultIndices.sort((left, right) =>
      compareSearchResultsByRelevance(results[left], results[right]),
    ),
    videoCount: group.videoIds.size,
  }));
};
