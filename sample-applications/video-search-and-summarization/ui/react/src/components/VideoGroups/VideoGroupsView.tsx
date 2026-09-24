// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { FC, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { InlineLoading } from '@carbon/react';
import { useAppSelector } from '../../redux/store';
import { SearchResult } from '../../redux/search/search';
import { SearchSelector } from '../../redux/search/searchSlice';
import { VideoTile } from '../../redux/search/VideoTile';
import {
  getSearchResultTags,
  getSearchResultVideoId,
  groupSearchResultIndicesByTag,
} from '../../redux/search/searchResult';

const VideoGroupsContainer = styled.div`
  padding: 1rem;
  width: 100%;
  height: 100%;
  overflow-y: auto;
  background-color: var(--color-gray-0);
`;

const GroupHeader = styled.h2`
  margin-bottom: 1rem;
  color: var(--color-dark-7);
  font-size: 1.5rem;
  font-weight: 600;
`;

const TagGroup = styled.div<{ $backgroundColor: string }>`
  margin-bottom: 2rem;
  padding: 1.5rem;
  border-radius: 8px;
  background-color: ${({ $backgroundColor }) => $backgroundColor};
  border: 2px solid ${({ $backgroundColor }) => $backgroundColor};
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
`;

const TagHeader = styled.h3`
  margin-bottom: 1rem;
  color: var(--color-dark-7);
  font-size: 1.2rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const TagBadge = styled.span`
  background-color: rgba(255, 255, 255, 0.8);
  padding: 0.25rem 0.75rem;
  border-radius: 12px;
  font-size: 0.875rem;
  font-weight: 500;
`;

const VideoGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
`;

const VideoCard = styled.div`
  .video-tile {
    width: 100%;
    margin: 0;
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.3);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .video-tile:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .video-tile video,
  .video-tile .video-placeholder {
    height: 200px;
    object-fit: cover;
  }

  .video-tile .relevance {
    padding: 0.75rem 1rem 0.25rem;
  }
`;

const VideoTag = styled.span`
  background-color: var(--color-info);
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 400;
`;

const TimestampBadge = styled.span`
  background-color: var(--color-dark-7, #343a3f);
  color: white;
  padding: 0.125rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
`;

const VideoTags = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  padding: 0.25rem 1rem 1rem;
`;

const EmptyState = styled.div`
  text-align: center;
  padding: 3rem;
  color: var(--color-gray-7);
`;

// Predefined color palette for tag groups
const TAG_COLORS = [
  '#E3F2FD', // Light Blue
  '#F3E5F5', // Light Purple
  '#E8F5E8', // Light Green
  '#FFF3E0', // Light Orange
  '#FCE4EC', // Light Pink
  '#F1F8E9', // Light Lime
  '#E0F2F1', // Light Teal
  '#FFF8E1', // Light Yellow
  '#EFEBE9', // Light Brown
  '#F5F5F5', // Light Grey
];

const formatTimestamp = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getResultTimestamp = (result: SearchResult | undefined): number => {
  const timestamp = result?.metadata?.timestamp;
  return typeof timestamp === 'number' ? timestamp : 0;
};

/**
 * Stable, position-independent keys so refreshing a watched query does not remount
 * clips that are still in the result set. Identical video/timestamp pairs are rare
 * but get a suffix so React keys stay unique.
 */
const buildResultKeys = (results: SearchResult[]): string[] => {
  const seen = new Map<string, number>();
  return results.map((result, index) => {
    const videoId = getSearchResultVideoId(result) ?? `result-${index}`;
    const baseKey = `${videoId}-${getResultTimestamp(result)}`;
    const occurrence = seen.get(baseKey) ?? 0;
    seen.set(baseKey, occurrence + 1);
    return occurrence === 0 ? baseKey : `${baseKey}-${occurrence}`;
  });
};

export const VideoGroupsView: FC = () => {
  const { t } = useTranslation();
  const { selectedResults, isSelectedInitialLoading } = useAppSelector(SearchSelector);
  const tagGroups = useMemo(() => groupSearchResultIndicesByTag(selectedResults), [selectedResults]);
  const resultKeys = useMemo(() => buildResultKeys(selectedResults ?? []), [selectedResults]);

  // First run of the query: show placeholders rather than a misleading "no results" state.
  // A refresh keeps its existing groups mounted and relies on the QueryInfo chip instead.
  if (isSelectedInitialLoading) {
    return (
      <VideoGroupsContainer data-testid='video-groups-skeleton'>
        <GroupHeader>{t('VideoGroups', 'Video Groups by Tags')}</GroupHeader>
        <EmptyState>
          <InlineLoading status='active' description={t('searchRunning')} />
        </EmptyState>
      </VideoGroupsContainer>
    );
  }

  // If no search results, show a helpful empty state
  if (!selectedResults || selectedResults.length === 0) {
    return (
      <VideoGroupsContainer>
        <GroupHeader>{t('VideoGroups', 'Video Groups by Tags')}</GroupHeader>
        <EmptyState>
          <h3>{t('NoSearchResults', 'No Search Results')}</h3>
          <p>{t('NoSearchResultsDescription', 'Please run a search to see grouped results by tag.')}</p>
        </EmptyState>
      </VideoGroupsContainer>
    );
  }

  if (tagGroups.length === 0) {
    return (
      <VideoGroupsContainer>
        <GroupHeader>{t('VideoGroups', 'Video Groups by Tags')}</GroupHeader>
        <EmptyState>
          <h3>{t('NoTaggedVideos', 'No Tagged Videos')}</h3>
          <p>{t('NoTaggedVideosDescription', 'The search returned results but none have tags to group by.')}</p>
        </EmptyState>
      </VideoGroupsContainer>
    );
  }

  return (
    <VideoGroupsContainer>
      <GroupHeader>{t('VideoGroups', 'Video Groups by Tags')}</GroupHeader>

      {tagGroups.map((group, groupIndex) => (
        <TagGroup key={group.tag} $backgroundColor={TAG_COLORS[groupIndex % TAG_COLORS.length]}>
          <TagHeader>
            {group.tag}
            <TagBadge>{group.videoCount} videos</TagBadge>
            <TagBadge>{group.resultIndices.length} results</TagBadge>
          </TagHeader>

          <VideoGrid>
            {group.resultIndices.map((resultIndex) => {
              const result = selectedResults[resultIndex];
              const resultKey = resultKeys[resultIndex];
              const tags = getSearchResultTags(result);

              return (
                <VideoCard key={`${group.tag}-${resultKey}`}>
                  <VideoTile resultIndex={resultIndex}>
                    <VideoTags>
                      <TimestampBadge>{formatTimestamp(getResultTimestamp(result))}</TimestampBadge>
                      {tags.map((tag) => (
                        <VideoTag key={`${resultKey}-${tag}`}>{tag}</VideoTag>
                      ))}
                    </VideoTags>
                  </VideoTile>
                </VideoCard>
              );
            })}
          </VideoGrid>
        </TagGroup>
      ))}
    </VideoGroupsContainer>
  );
};

export default VideoGroupsView;
