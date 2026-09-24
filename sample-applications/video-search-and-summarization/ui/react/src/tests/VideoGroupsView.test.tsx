// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0

import { act, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import VideoGroupsView from '../components/VideoGroups/VideoGroupsView';
import { SearchResult, SearchResultTags } from '../redux/search/search';
import { SearchActions } from '../redux/search/searchSlice';
import { Video } from '../redux/video/video';
import i18n from '../utils/i18n';
import { createSearchQuery, createSearchResult, createSearchState, createTestStore, TestStore } from './testUtils';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, defaultValue?: string) => defaultValue ?? key,
    }),
  };
});

const makeResult = (
  videoId: string,
  tags: SearchResultTags,
  relevanceScore = 0.9,
  overrides: Parameters<typeof createSearchResult>[0] = {},
): SearchResult =>
  createSearchResult({
    id: `result-${videoId}`,
    ...overrides,
    metadata: {
      video_id: videoId,
      id: videoId,
      tags,
      relevance_score: relevanceScore,
      ...overrides.metadata,
    },
    video: {
      videoId,
      name: videoId,
      url: `${videoId}/source.mp4`,
      tags: [],
      ...overrides.video,
    },
  });

const makeStore = (results: SearchResult[] = [], videos: Video[] = []): TestStore => {
  const query = createSearchQuery({ queryId: 'query-1', results, topK: Math.max(results.length, 4) });
  return createTestStore({
    search: createSearchState({
      searchQueries: results.length ? [query] : [],
      selectedQuery: results.length ? query.queryId : null,
    }),
    videos: { videos },
  });
};

const renderView = (store: TestStore) =>
  render(
    <Provider store={store}>
      <I18nextProvider i18n={i18n}>
        <VideoGroupsView />
      </I18nextProvider>
    </Provider>,
  );

describe('VideoGroupsView', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the empty state when no query results are selected', () => {
    renderView(makeStore());

    expect(screen.getByText('Video Groups by Tags')).toBeInTheDocument();
    expect(screen.getByText('No Search Results')).toBeInTheDocument();
  });

  it('keeps hook order stable when results arrive after an empty render', () => {
    const store = makeStore();
    renderView(store);

    act(() => {
      store.dispatch(
        SearchActions.updateSearchQuery(
          createSearchQuery({ queryId: 'query-1', results: [makeResult('video-1', 'action')], topK: 4 }),
        ),
      );
    });

    expect(screen.getByRole('heading', { name: /action.*1.*videos/ })).toBeInTheDocument();
  });

  it('groups normalized tags from every supported response shape', () => {
    const results = [
      makeResult('video-1', 'action, adventure'),
      makeResult('video-2', [{ name: 'action' }, { label: 'comedy' }]),
      makeResult('video-3', '', 0.7, {
        metadata: { video_metadata: { tags: ['documentary'] } },
        video: { tags: ['archive'] },
      }),
    ];

    renderView(makeStore(results));

    expect(screen.getByRole('heading', { name: /action.*2.*videos/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /adventure.*1.*videos/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /comedy.*1.*videos/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /documentary.*1.*videos/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /archive.*1.*videos/ })).toBeInTheDocument();
  });

  it('puts identified results without tags in the Untagged group', () => {
    renderView(makeStore([makeResult('video-1', '')]));

    expect(screen.getByRole('heading', { name: /Untagged.*1.*videos/ })).toBeInTheDocument();
  });

  it('sorts each group by relevance and keeps every hit of the same video', () => {
    const results = [
      makeResult('low', 'action', 0.2),
      makeResult('high', 'action', 0.9),
      makeResult('high', 'action', 0.7),
    ];

    renderView(makeStore(results));

    const relevanceScores = screen.getAllByText(/Relevance Score:/);
    expect(relevanceScores).toHaveLength(3);
    expect(relevanceScores[0]).toHaveTextContent('Relevance Score: 0.900');
    expect(relevanceScores[1]).toHaveTextContent('Relevance Score: 0.700');
    expect(relevanceScores[2]).toHaveTextContent('Relevance Score: 0.200');
  });

  it('renders the shared VideoTile template and normalized tag chips', () => {
    const { container } = renderView(makeStore([makeResult('video-1', 'action,adventure')]));

    expect(container.querySelector('.video-tile')).not.toBeNull();
    expect(container.querySelector('video[controls]')).not.toBeNull();
    expect(screen.getAllByText('action')).not.toHaveLength(0);
    expect(screen.getAllByText('adventure')).not.toHaveLength(0);
  });

  it('uses the shared URL precedence, including the Redux video catalog', () => {
    const result = makeResult('video-1', 'action', 0.9, {
      metadata: { video_rel_url: '/metadata/video-1.mp4' },
      video: { url: '/result/video-1.mp4', dataStore: undefined },
    });
    const catalogVideo: Video = {
      videoId: 'video-1',
      name: 'Catalog video',
      url: '/catalog/video-1.mp4',
      tags: [],
      createdAt: '',
      updatedAt: '',
    };

    const { container } = renderView(makeStore([result], [catalogVideo]));

    expect(container.querySelector('video source')).toHaveAttribute('src', '/catalog/video-1.mp4');
  });

  it('uses the metadata URL fallback and shows a placeholder when no source resolves', () => {
    const playable = makeResult('playable', 'action', 0.9, {
      metadata: { video_rel_url: '/datastore/playable/source.mp4' },
      video: { url: '', dataStore: undefined },
    });
    const unavailable = makeResult('unavailable', 'action', 0.8, {
      metadata: { bucket_name: '', video_rel_url: '', video_url: '' },
      video: { url: '', dataStore: undefined },
    });

    const { container } = renderView(makeStore([playable, unavailable]));

    expect(container.querySelector('video source')?.getAttribute('src')).toContain('/datastore/playable/source.mp4');
    expect(screen.getByText('Video not available')).toBeInTheDocument();
  });

  describe('Multiple results per video', () => {
    it('renders every hit when one video matches at several timestamps', () => {
      const results = [12.26, 33.53, 59.8].map((timestamp, index) =>
        makeResult('video-1', 'ceramic', 0.9 - index * 0.1, {
          id: `result-${index + 1}`,
          metadata: { timestamp },
        }),
      );

      const { container } = renderView(makeStore(results));

      expect(container.querySelectorAll('video')).toHaveLength(3);
      expect(screen.getByText('Relevance Score: 0.900')).toBeInTheDocument();
      expect(screen.getByText('Relevance Score: 0.800')).toBeInTheDocument();
      expect(screen.getByText('Relevance Score: 0.700')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: /ceramic.*1.*videos.*3.*results/ })).toBeInTheDocument();
    });

    it('keeps all hits across several videos sharing a tag', () => {
      const results = [
        ...[10, 20, 30].map((timestamp, index) =>
          makeResult('video-1', 'action', 0.9, { id: `a-${index}`, metadata: { timestamp } }),
        ),
        ...[15, 25].map((timestamp, index) =>
          makeResult('video-2', 'action', 0.8, { id: `b-${index}`, metadata: { timestamp } }),
        ),
      ];

      const { container } = renderView(makeStore(results));

      expect(container.querySelectorAll('video')).toHaveLength(5);
      expect(screen.getByRole('heading', { name: /action.*2.*videos.*5.*results/ })).toBeInTheDocument();
    });

    it('shows the timestamp of each hit', () => {
      const results = [
        makeResult('video-1', 'action', 0.9, { id: 'result-1', metadata: { timestamp: 75.5 } }),
        makeResult('video-1', 'action', 0.8, { id: 'result-2', metadata: { timestamp: 5 } }),
      ];

      renderView(makeStore(results));

      expect(screen.getByText('01:15')).toBeInTheDocument();
      expect(screen.getByText('00:05')).toBeInTheDocument();
    });
  });
});
