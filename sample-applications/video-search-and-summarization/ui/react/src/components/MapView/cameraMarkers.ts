// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { SearchResult } from '../../redux/search/search';
import {
  compareSearchResultsByRelevance,
  getSearchResultTags,
  getSearchResultVideoId,
} from '../../redux/search/searchResult';
import { CameraLocation } from '../../redux/mapConfig/mapConfig';

export interface CameraMarker {
  tag: string;
  label: string;
  lat: number;
  lon: number;
  /** Indices into `selectedResults`, best score first. `[0]` is the card's displayed result. */
  resultIndices: number[];
}

/**
 * Bucket result indices by resolved tag, keeping only tags that have a
 * configured location, de-duplicating by `video_id` within a camera, and
 * sorting each bucket by `relevance_score` descending (same ordering rule as
 * VideoGroupsView).
 */
export const buildCameraMarkers = (
  results: SearchResult[] | null | undefined,
  locations: Record<string, CameraLocation>,
): CameraMarker[] => {
  if (!results || results.length === 0 || Object.keys(locations).length === 0) {
    return [];
  }

  const buckets = new Map<string, { indices: number[]; seenVideoIds: Set<string> }>();

  results.forEach((result, index) => {
    const tags = getSearchResultTags(result);
    const videoId = getSearchResultVideoId(result);

    tags.forEach((tag) => {
      if (!locations[tag]) return;

      let bucket = buckets.get(tag);
      if (!bucket) {
        bucket = { indices: [], seenVideoIds: new Set() };
        buckets.set(tag, bucket);
      }

      if (videoId) {
        if (bucket.seenVideoIds.has(videoId)) return;
        bucket.seenVideoIds.add(videoId);
      }

      bucket.indices.push(index);
    });
  });

  const markers: CameraMarker[] = [];

  buckets.forEach((bucket, tag) => {
    const location = locations[tag];
    const resultIndices = [...bucket.indices].sort((a, b) => compareSearchResultsByRelevance(results[a], results[b]));

    markers.push({
      tag,
      label: location.label ?? tag,
      lat: location.lat,
      lon: location.lon,
      resultIndices,
    });
  });

  return markers;
};

/** Count of results whose tags resolve to no configured location, so they are never silently dropped. */
export const unmappedResultCount = (
  results: SearchResult[] | null | undefined,
  locations: Record<string, CameraLocation>,
): number => {
  if (!results || results.length === 0) return 0;

  return results.filter((result) => {
    const tags = getSearchResultTags(result);
    return !tags.some((tag) => Boolean(locations[tag]));
  }).length;
};
