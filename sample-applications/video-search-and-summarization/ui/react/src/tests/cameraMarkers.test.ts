// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { buildCameraMarkers, unmappedResultCount } from '../components/MapView/cameraMarkers';
import { CameraLocation } from '../redux/mapConfig/mapConfig';
import { SearchResult } from '../redux/search/search';
import { getSearchResultTags } from '../redux/search/searchResult';
import { createSearchResult } from './testUtils';

const makeResult = (overrides: {
  id?: string;
  videoId: string;
  relevanceScore?: number;
  metadataTags?: string;
  videoMetadataTags?: string[];
  videoTags?: string[];
}): SearchResult =>
  createSearchResult({
    id: overrides.id ?? overrides.videoId,
    metadata: {
      id: overrides.id ?? overrides.videoId,
      video_id: overrides.videoId,
      relevance_score: overrides.relevanceScore ?? 0,
      tags: overrides.metadataTags ?? '',
      ...(overrides.videoMetadataTags ? { video_metadata: { tags: overrides.videoMetadataTags } } : {}),
    },
    video: {
      videoId: overrides.videoId,
      name: overrides.videoId,
      url: `${overrides.videoId}.mp4`,
      tags: overrides.videoTags ?? [],
    },
  });

const locations: Record<string, CameraLocation> = {
  'lobby-cam': { lat: 37.3875, lon: -121.9636, label: 'Lobby' },
  'dock-cam': { lat: 47.6062, lon: -122.3321, label: 'Loading Dock' },
};

describe('getSearchResultTags', () => {
  it('returns an empty array for a null/undefined result', () => {
    expect(getSearchResultTags(null)).toEqual([]);
    expect(getSearchResultTags(undefined)).toEqual([]);
  });

  it('parses a CSV tags string from metadata.tags, trimming whitespace', () => {
    const result = makeResult({ videoId: 'v1', metadataTags: 'lobby-cam, dock-cam ,  ' });
    expect(getSearchResultTags(result).sort()).toEqual(['dock-cam', 'lobby-cam']);
  });

  it('reads an array of tags from metadata.video_metadata.tags', () => {
    const result = makeResult({ videoId: 'v1', videoMetadataTags: ['lobby-cam', 'dock-cam'] });
    expect(getSearchResultTags(result).sort()).toEqual(['dock-cam', 'lobby-cam']);
  });

  it('reads an array of tags from result.video.tags', () => {
    const result = makeResult({ videoId: 'v1', videoTags: ['lobby-cam'] });
    expect(getSearchResultTags(result)).toEqual(['lobby-cam']);
  });

  it('de-duplicates tags found across all three shapes', () => {
    const result = makeResult({
      videoId: 'v1',
      metadataTags: 'lobby-cam',
      videoMetadataTags: ['lobby-cam', 'dock-cam'],
      videoTags: ['dock-cam'],
    });
    expect(getSearchResultTags(result).sort()).toEqual(['dock-cam', 'lobby-cam']);
  });

  it('ignores blank/whitespace-only tag entries', () => {
    const result = makeResult({ videoId: 'v1', metadataTags: ' , ,' });
    expect(getSearchResultTags(result)).toEqual([]);
  });
});

describe('buildCameraMarkers', () => {
  it('returns no markers when there are no results or no configured locations', () => {
    expect(buildCameraMarkers([], locations)).toEqual([]);
    expect(buildCameraMarkers(null, locations)).toEqual([]);
    expect(buildCameraMarkers([makeResult({ videoId: 'v1', metadataTags: 'lobby-cam' })], {})).toEqual([]);
  });

  it('buckets results by tag and attaches the configured lat/lon/label', () => {
    const results = [
      makeResult({ videoId: 'v1', metadataTags: 'lobby-cam', relevanceScore: 0.5 }),
      makeResult({ videoId: 'v2', metadataTags: 'dock-cam', relevanceScore: 0.9 }),
    ];

    const markers = buildCameraMarkers(results, locations);
    expect(markers).toHaveLength(2);

    const lobby = markers.find((m) => m.tag === 'lobby-cam');
    expect(lobby).toMatchObject({ label: 'Lobby', lat: 37.3875, lon: -121.9636, resultIndices: [0] });
  });

  it('drops tags with no configured location', () => {
    const results = [makeResult({ videoId: 'v1', metadataTags: 'unmapped-cam' })];
    expect(buildCameraMarkers(results, locations)).toEqual([]);
  });

  it('de-duplicates by video_id within the same camera bucket', () => {
    const results = [
      makeResult({ id: 'r1', videoId: 'v1', metadataTags: 'lobby-cam', relevanceScore: 0.4 }),
      makeResult({ id: 'r2', videoId: 'v1', metadataTags: 'lobby-cam', relevanceScore: 0.9 }),
    ];

    const markers = buildCameraMarkers(results, locations);
    expect(markers).toHaveLength(1);
    expect(markers[0].resultIndices).toEqual([0]);
  });

  it('sorts result indices within a bucket by relevance_score descending', () => {
    const results = [
      makeResult({ videoId: 'v1', metadataTags: 'lobby-cam', relevanceScore: 0.2 }),
      makeResult({ videoId: 'v2', metadataTags: 'lobby-cam', relevanceScore: 0.9 }),
      makeResult({ videoId: 'v3', metadataTags: 'lobby-cam', relevanceScore: 0.5 }),
    ];

    const markers = buildCameraMarkers(results, locations);
    expect(markers[0].resultIndices).toEqual([1, 2, 0]);
  });

  it('falls back to the tag itself as the label when none is configured', () => {
    const results = [makeResult({ videoId: 'v1', metadataTags: 'lobby-cam' })];
    const noLabelLocations: Record<string, CameraLocation> = { 'lobby-cam': { lat: 1, lon: 2 } };

    const markers = buildCameraMarkers(results, noLabelLocations);
    expect(markers[0].label).toBe('lobby-cam');
  });
});

describe('unmappedResultCount', () => {
  it('returns 0 for an empty result list', () => {
    expect(unmappedResultCount([], locations)).toBe(0);
    expect(unmappedResultCount(null, locations)).toBe(0);
  });

  it('counts results whose tags all resolve to no configured location', () => {
    const results = [
      makeResult({ videoId: 'v1', metadataTags: 'lobby-cam' }),
      makeResult({ videoId: 'v2', metadataTags: 'unmapped-cam' }),
      makeResult({ videoId: 'v3', metadataTags: '' }),
    ];

    expect(unmappedResultCount(results, locations)).toBe(2);
  });

  it('does not count a result that has at least one mapped tag among several', () => {
    const results = [makeResult({ videoId: 'v1', metadataTags: 'unmapped-cam,lobby-cam' })];
    expect(unmappedResultCount(results, locations)).toBe(0);
  });
});
