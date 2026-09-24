// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { fireEvent, render, screen } from '@testing-library/react';
import type { PointerEventHandler } from 'react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { CameraCard } from '../components/MapView/CameraCard';
import { CameraMarker } from '../components/MapView/cameraMarkers';
import { SearchResult } from '../redux/search/search';
import { createSearchQuery, createSearchResult, createSearchState, createTestStore } from './testUtils';

vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({
    t: (key: string, defaultValue?: string, options?: { count?: number }) =>
      options?.count !== undefined ? `${key}:${options.count}` : (defaultValue ?? key),
  }),
}));

const makeResult = (videoId: string, relevanceScore: number): SearchResult =>
  createSearchResult({
    id: videoId,
    metadata: {
      tags: 'lobby-cam',
      id: videoId,
      timestamp: 12,
      video_id: videoId,
      video_rel_url: `/videos/${videoId}.mp4`,
      video_url: `http://localhost/${videoId}.mp4`,
      relevance_score: relevanceScore,
      score_breakdown: {
        score: relevanceScore,
        raw_score: 0.533605,
        raw_score_min: 0.155595,
        raw_score_max: 0.533605,
        max_frame_score: 0.3893,
      },
    },
    video: {
      videoId,
      name: videoId,
      url: `${videoId}.mp4`,
      tags: ['lobby-cam'],
    },
  });

const makeStore = (results: SearchResult[]) =>
  createTestStore({
    search: createSearchState({
      searchQueries: [createSearchQuery({ queryId: 'q1', results, topK: results.length })],
      selectedQuery: 'q1',
    }),
  });

const makeMarker = (overrides: Partial<CameraMarker> = {}): CameraMarker => ({
  tag: 'lobby-cam',
  label: 'Lobby',
  lat: 37.3875,
  lon: -121.9636,
  resultIndices: [0],
  ...overrides,
});

interface RenderCardOptions {
  onMapPointerDown?: PointerEventHandler<HTMLDivElement>;
  onActivate?: (tag: string) => void;
  onOpenPanel?: (tag: string) => void;
}

const renderCard = (marker: CameraMarker, results: SearchResult[], options: RenderCardOptions = {}) => {
  const onActivate = options.onActivate ?? vi.fn();
  const onOpenPanel = options.onOpenPanel ?? vi.fn();

  return {
    onActivate,
    onOpenPanel,
    ...render(
      <Provider store={makeStore(results)}>
        <div onPointerDown={options.onMapPointerDown}>
          <CameraCard
            marker={marker}
            left={100}
            top={200}
            isActive={false}
            onActivate={onActivate}
            onOpenPanel={onOpenPanel}
          />
        </div>
      </Provider>,
    ),
  };
};

describe('CameraCard', () => {
  it('reuses the Search View video tile with native controls', () => {
    renderCard(makeMarker(), [makeResult('v1', 0.9)]);
    const video = document.querySelector('video') as HTMLVideoElement;

    expect(document.querySelector('.video-tile')).not.toBeNull();
    expect(video).not.toBeNull();
    expect(video.hasAttribute('controls')).toBe(true);
  });

  it('keeps only the relevance score on the map card', () => {
    renderCard(makeMarker(), [makeResult('v1', 0.9)]);

    expect(screen.getByText('Relevance Score: 0.900')).toBeInTheDocument();
    expect(screen.queryByText(/^raw /)).not.toBeInTheDocument();
    expect(screen.queryByText(/^peak /)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Score breakdown' })).not.toBeInTheDocument();
  });

  it('isolates video pointer presses from the map interaction layer', () => {
    const onMapPointerDown = vi.fn();
    renderCard(makeMarker(), [makeResult('v1', 0.9)], { onMapPointerDown });

    fireEvent.pointerDown(document.querySelector('video') as HTMLVideoElement);

    expect(onMapPointerDown).not.toHaveBeenCalled();
  });

  it('shows the camera latitude and longitude on the video card', () => {
    renderCard(makeMarker({ lat: 37.3875, lon: -121.9636 }), [makeResult('v1', 0.9)]);

    expect(screen.getByText('Lat: 37.38750')).toBeInTheDocument();
    expect(screen.getByText('Lon: -121.96360')).toBeInTheDocument();
  });

  it('activates the marker when the card is clicked', () => {
    const { onActivate } = renderCard(makeMarker(), [makeResult('v1', 0.9)]);

    fireEvent.click(screen.getByTestId('camera-card-lobby-cam').querySelector('video') as Element);

    expect(onActivate).toHaveBeenCalledWith('lobby-cam');
  });

  it('renders the configured camera label', () => {
    renderCard(makeMarker({ label: 'Loading Dock' }), [makeResult('v1', 0.9)]);
    expect(screen.getByText('Loading Dock')).toBeInTheDocument();
  });

  it('shows the passive +N badge only when the camera has more results', () => {
    const { rerender } = renderCard(makeMarker(), [makeResult('v1', 0.9)]);
    expect(screen.queryByText(/MoreResults/)).toBeNull();

    rerender(
      <Provider store={makeStore([makeResult('v1', 0.9), makeResult('v2', 0.7), makeResult('v3', 0.5)])}>
        <CameraCard
          marker={makeMarker({ resultIndices: [0, 1, 2] })}
          left={100}
          top={200}
          isActive={false}
          onActivate={vi.fn()}
          onOpenPanel={vi.fn()}
        />
      </Provider>,
    );

    expect(screen.getByText('MoreResults:2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'MoreResults:2' })).toBeNull();
  });

  it('opens the panel from the label without activating the card again', () => {
    const { onActivate, onOpenPanel } = renderCard(makeMarker(), [makeResult('v1', 0.9)]);

    fireEvent.click(screen.getByText('Lobby'));

    expect(onOpenPanel).toHaveBeenCalledWith('lobby-cam');
    expect(onActivate).not.toHaveBeenCalled();
  });
});
