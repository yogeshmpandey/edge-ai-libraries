// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { FC, useRef } from 'react';
import type { ReactNode } from 'react';
import styled from 'styled-components';
import { ASSETS_ENDPOINT } from '../../config';
import { useAppSelector } from '../store';
import { SearchSelector } from './searchSlice';
import { getSearchResultVideoId } from './searchResult';
import { resolveSearchResultVideoUrl, resolveVideoUrl } from '../video/videoUrl';
import { videosSelector } from '../video/videoSlice';
import { ScoreDisplay } from '../../components/Search/ScoreDisplay';
import { useSeekToTimestamp } from '../../utils/useSeekToTimestamp';

export interface VideoTileProps {
  resultIndex: number; // Index in the selectedResults array
  children?: ReactNode;
  showScoreDetails?: boolean;
}

const VideoTileContainer = styled.div`
  position: relative;
  width: 20rem;
  margin: 1rem;
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 0.5rem;
  overflow: hidden;

  video {
    display: block;
    width: 100%;
  }

  .relevance {
    padding: 1rem;
  }
`;

const VideoPlaceholder = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 12rem;
  background-color: var(--color-gray-2);
  color: var(--color-gray-6);
  font-size: 0.875rem;
`;

export const VideoTile: FC<VideoTileProps> = ({ resultIndex, children, showScoreDetails = true }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Get the search result directly from Redux
  const { selectedResults } = useAppSelector(SearchSelector);
  const { getVideoUrl } = useAppSelector(videosSelector);
  const searchResult = selectedResults[resultIndex];

  const { metadata, video } = searchResult || {};

  const videoId = getSearchResultVideoId(searchResult);
  const videoUrl =
    (videoId ? getVideoUrl(videoId) : null) ??
    resolveVideoUrl(video, ASSETS_ENDPOINT) ??
    resolveSearchResultVideoUrl(metadata, ASSETS_ENDPOINT);

  useSeekToTimestamp(videoRef, videoUrl, metadata?.timestamp);

  // If no search result at this index, don't render
  if (!searchResult) {
    return null;
  }

  return (
    <VideoTileContainer className='video-tile'>
      {videoUrl ? (
        <video ref={videoRef} controls preload='metadata'>
          <source src={videoUrl} type='video/mp4' />
        </video>
      ) : (
        <VideoPlaceholder className='video-placeholder'>Video not available</VideoPlaceholder>
      )}
      <div className='relevance'>
        <ScoreDisplay
          relevanceScore={metadata?.relevance_score}
          scoreBreakdown={metadata?.score_breakdown}
          showDetails={showScoreDetails}
        />
      </div>
      {children}
    </VideoTileContainer>
  );
};
