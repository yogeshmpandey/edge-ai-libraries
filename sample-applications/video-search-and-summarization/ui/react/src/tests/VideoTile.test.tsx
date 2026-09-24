// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { describe, expect, it } from 'vitest';
import { VideoTile, VideoTileProps } from '../redux/search/VideoTile';
import { SearchResult } from '../redux/search/search';
import { Video } from '../redux/video/video';
import i18n from '../utils/i18n';
import { createSearchQuery, createSearchResult, createSearchState, createTestStore } from './testUtils';

const makeStore = (results: SearchResult[], videos: Video[] = []) =>
  createTestStore({
    search: createSearchState({
      searchQueries: [createSearchQuery({ results, topK: Math.max(results.length, 1) })],
      selectedQuery: 'query-1',
    }),
    videos: { videos },
  });

const renderTile = (props: VideoTileProps, results: SearchResult[], videos: Video[] = []) =>
  render(
    <Provider store={makeStore(results, videos)}>
      <I18nextProvider i18n={i18n}>
        <VideoTile {...props} />
      </I18nextProvider>
    </Provider>,
  );

describe('VideoTile', () => {
  it('renders native playback, score details, and composed children', () => {
    const result = createSearchResult({ metadata: { relevance_score: 0.95 } });
    const { container } = renderTile({ resultIndex: 0, children: <span>extra content</span> }, [result]);

    expect(container.querySelector('.video-tile')).not.toBeNull();
    expect(container.querySelector('video[controls]')).not.toBeNull();
    expect(screen.getByText('Relevance Score: 0.950')).toBeInTheDocument();
    expect(screen.getByText('extra content')).toBeInTheDocument();
  });

  it('can hide the raw, peak, and score breakdown controls', () => {
    const result = createSearchResult({
      metadata: {
        score_breakdown: { score: 0.9, raw_score: 0.5, max_frame_score: 0.4 },
      },
    });

    renderTile({ resultIndex: 0, showScoreDetails: false }, [result]);

    expect(screen.queryByText(/^raw /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^peak /)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Score breakdown' })).not.toBeInTheDocument();
  });

  it('prefers the Redux video catalog over result and metadata URLs', () => {
    const result = createSearchResult({
      metadata: { video_id: 'video-1', video_rel_url: '/metadata/video.mp4' },
      video: { videoId: 'video-1', url: '/result/video.mp4', dataStore: undefined },
    });
    const catalogVideo: Video = {
      videoId: 'video-1',
      name: 'Catalog video',
      url: '/catalog/video.mp4',
      tags: [],
      createdAt: '',
      updatedAt: '',
    };

    const { container } = renderTile({ resultIndex: 0 }, [result], [catalogVideo]);

    expect(container.querySelector('source')).toHaveAttribute('src', '/catalog/video.mp4');
  });

  it('uses the metadata URL when neither catalog nor enriched video resolves', () => {
    const result = createSearchResult({
      metadata: { video_rel_url: '/datastore/video-1/source.mp4' },
      video: { url: '', dataStore: undefined },
    });

    const { container } = renderTile({ resultIndex: 0 }, [result]);

    expect(container.querySelector('source')?.getAttribute('src')).toContain('/datastore/video-1/source.mp4');
  });

  it('shows a placeholder when no playable URL can be resolved', () => {
    const result = createSearchResult({
      metadata: { bucket_name: '', video_id: '', id: '', video_rel_url: '', video_url: '' },
      video: { videoId: '', url: '', dataStore: undefined },
    });

    const { container } = renderTile({ resultIndex: 0 }, [result]);

    expect(container.querySelector('video')).toBeNull();
    expect(screen.getByText('Video not available')).toBeInTheDocument();
  });

  it('seeks to the result timestamp after video metadata loads', () => {
    const result = createSearchResult({ metadata: { timestamp: 120 } });
    const { container } = renderTile({ resultIndex: 0 }, [result]);
    const video = container.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { configurable: true, value: 200 });

    fireEvent.loadedMetadata(video);

    expect(video.currentTime).toBe(120);
  });

  it('renders nothing when the requested result index does not exist', () => {
    const { container } = renderTile({ resultIndex: 4 }, [createSearchResult()]);
    expect(container).toBeEmptyDOMElement();
  });
});
