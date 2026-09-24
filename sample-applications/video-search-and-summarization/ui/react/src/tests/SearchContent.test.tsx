// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { render, screen, fireEvent } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { I18nextProvider } from 'react-i18next';
import { Provider } from 'react-redux';

import SearchContent from '../components/Search/SearchContent.tsx';
import i18n from '../utils/i18n';
import { SearchQueryUI, SearchResult, SearchQueryStatus, SearchState } from '../redux/search/search.ts';
import { MapConfigState } from '../redux/mapConfig/mapConfig.ts';
import {
  createSearchQuery,
  createSearchResult,
  createSearchState,
  createTestStore,
  createUiState,
} from './testUtils.ts';

// Mock i18next
vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// Mock VideoTile component
vi.mock('../../redux/search/VideoTile.tsx', () => ({
  VideoTile: ({ children }: { children?: ReactNode }) => (
    <div className='video-tile'>
      <video controls>
        <source src='' />
      </video>
      {children}
    </div>
  ),
}));

// Helper function to create mock SearchResult
const createMockSearchResult = (
  id: string,
  videoId: string,
  relevanceScore: number,
  timestamp: number,
): SearchResult => ({
  ...createSearchResult({
    id,
    metadata: {
      id,
      tags: 'test,video,content',
      timestamp,
      video_id: videoId,
      video_path: `/videos/${videoId}.mp4`,
      video_rel_url: `/videos/${videoId}.mp4`,
      video_url: `http://localhost/videos/${videoId}.mp4`,
      relevance_score: relevanceScore,
    },
    video: {
      videoId,
      name: `Video ${videoId}`,
      url: `${videoId}.mp4`,
      tags: ['test', 'video'],
    },
  }),
});

// Helper function to create mock SearchQueryUI
const createMockQuery = (
  queryId: string,
  query: string,
  topK: number = 4,
  results: SearchResult[] = [],
): SearchQueryUI => createSearchQuery({ queryId, query, topK, results });

const createMockStore = (initialState: Partial<SearchState> = {}, mapConfigOverride: Partial<MapConfigState> = {}) => {
  return createTestStore({
    search: createSearchState(initialState),
    ui: createUiState(),
    mapConfig: { cameras: {}, loaded: true, ...mapConfigOverride },
  });
};

describe('SearchContent Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderSearchContent = (
    storeState: Partial<SearchState> = {},
    mapConfigOverride: Partial<MapConfigState> = {},
  ) => {
    const store = createMockStore(storeState, mapConfigOverride);
    return {
      store,
      ...render(
        <Provider store={store}>
          <I18nextProvider i18n={i18n}>
            <SearchContent />
          </I18nextProvider>
        </Provider>,
      ),
    };
  };

  describe('Basic Rendering', () => {
    it('should render no query selected message when no query is selected', () => {
      renderSearchContent();

      // Since NoQuerySelected component renders empty content, check that no query header is rendered
      expect(screen.queryByText('searchOutputCount')).not.toBeInTheDocument();
    });

    it('should render query header when query is selected', () => {
      const mockQuery: SearchQueryUI = {
        queryId: 'query-1',
        query: 'Test Query 1',
        topK: 4,
        dbId: 1,
        watch: false,
        results: [],
        queryStatus: SearchQueryStatus.IDLE,
        tags: [],
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      };

      renderSearchContent({
        selectedQuery: 'query-1', // This should be the ID, not the object
        searchQueries: [mockQuery],
      });

      expect(screen.getAllByText('Test Query 1')[0]).toBeInTheDocument();
      expect(screen.getByText('searchOutputCount')).toBeInTheDocument();
    });

    it('should render videos container when query is selected', () => {
      const mockResults: SearchResult[] = [
        createMockSearchResult('result-1', 'video-1', 0.95, 120),
        createMockSearchResult('result-2', 'video-2', 0.87, 180),
      ];

      const mockQuery = createMockQuery('query-1', 'Test Query 1', 4, mockResults);

      renderSearchContent({
        selectedQuery: 'query-1', // Query ID
        searchQueries: [mockQuery],
      });

      expect(document.querySelectorAll('video')).toHaveLength(2);
    });
  });

  describe('Map View gating', () => {
    it('does not offer the Map View button when map-config.json has no camera locations (the shipped empty {} file)', () => {
      const mockQuery = createMockQuery('query-1', 'Test Query 1', 4, []);

      renderSearchContent({ selectedQuery: 'query-1', searchQueries: [mockQuery] }, { cameras: {} });

      expect(screen.queryByText('MapView')).toBeNull();
    });

    it('offers the Map View button once map-config.json resolves at least one valid camera location', () => {
      const mockQuery = createMockQuery('query-1', 'Test Query 1', 4, []);

      renderSearchContent(
        { selectedQuery: 'query-1', searchQueries: [mockQuery] },
        { cameras: { 'lobby-cam': { lat: 37.3875, lon: -121.9636, label: 'Lobby' } } },
      );

      expect(screen.getByText('MapView')).toBeInTheDocument();
    });

    it('uses the remaining results height for the map instead of a fixed-height host', () => {
      const mockQuery = createMockQuery('query-1', 'Test Query 1', 4, []);

      renderSearchContent(
        { selectedQuery: 'query-1', searchQueries: [mockQuery] },
        { cameras: { 'lobby-cam': { lat: 37.3875, lon: -121.9636, label: 'Lobby' } } },
      );
      fireEvent.click(screen.getByText('MapView'));

      const mapHost = screen.getByTestId('map-view').parentElement;
      expect(mapHost).toHaveStyle({ width: '100%', flex: '1 1 0%', minHeight: '0' });
      expect(mapHost).not.toHaveStyle({ height: '32rem' });
      expect(mapHost?.parentElement).toHaveStyle({ width: '100%', height: '100%', minHeight: '0' });
    });
  });

  describe('Query Header', () => {
    it('should display query title in tooltip', () => {
      const mockQuery = createMockQuery(
        'query-1',
        'This is a very long query title that should be displayed in tooltip',
        4,
      );

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [mockQuery],
      });

      expect(
        screen.getAllByText('This is a very long query title that should be displayed in tooltip')[0],
      ).toBeInTheDocument();
    });

    it('should render topK slider with correct value', () => {
      const mockQuery = createMockQuery('query-1', 'Test Query 1', 8);

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [mockQuery],
      });

      expect(screen.getByText('searchOutputCount')).toBeInTheDocument();
      const slider = screen.getByRole('slider');
      expect(slider).toHaveAttribute('aria-valuenow', '8');
    });

    it('should update topK when slider value changes', () => {
      const mockQuery = createMockQuery('query-1', 'Test Query 1', 5);

      const { store } = renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [mockQuery],
      });

      fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });

      const state = store.getState();
      expect(state.search.searchQueries[0].topK).toBe(6);
    });

    it('should render slider with correct min, max, and step values', () => {
      const mockQuery = createMockQuery('query-1', 'Test Query 1', 4);

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [mockQuery],
      });

      const input = document.querySelector('.cds--slider-text-input') as HTMLInputElement;
      expect(input).toHaveAttribute('min', '1');
      expect(input).toHaveAttribute('max', '20');
      expect(input).toHaveAttribute('step', '1');
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined selected query', () => {
      renderSearchContent({
        selectedQuery: null,
        searchQueries: [],
      });

      // Since NoQuerySelected component renders empty content, check that no query header is rendered
      expect(screen.queryByText('searchOutputCount')).not.toBeInTheDocument();
    });

    it('should render tags when selectedQuery has tags', () => {
      const queryWithTags: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.IDLE,
        results: [],
        topK: 10,
        watch: false,
        tags: ['tag1', 'tag2', 'tag3'], // Query with tags
        errorMessage: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryWithTags],
      });

      // Should render all tags
      expect(screen.getByText('tag1')).toBeInTheDocument();
      expect(screen.getByText('tag2')).toBeInTheDocument();
      expect(screen.getByText('tag3')).toBeInTheDocument();
    });

    it('should not render tags when selectedQuery has no tags', () => {
      const queryWithoutTags: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.IDLE,
        results: [],
        topK: 10,
        watch: false,
        tags: [], // Empty tags array
        errorMessage: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryWithoutTags],
      });

      // Should not render tags container
      expect(screen.queryByTestId('tags-container')).not.toBeInTheDocument();
    });

    it('should render error message when selectedQuery has errorMessage', () => {
      const queryWithError: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.ERROR,
        results: [],
        topK: 10,
        watch: false,
        tags: [],
        errorMessage: 'Search failed due to network error', // Query with error
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryWithError],
      });

      // Should render error message
      expect(screen.getByText('Search failed due to network error')).toBeInTheDocument();
      expect(screen.getByText('⚠️')).toBeInTheDocument(); // Error icon
    });

    it('keeps successful results visible when a later re-run fails', () => {
      const previousResult = createMockSearchResult('result-1', 'video-1', 0.95, 120);
      const queryWithPreviousResults = createSearchQuery({
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.ERROR,
        results: [previousResult],
        topK: 4,
        errorMessage: 'The latest search attempt timed out',
      });

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryWithPreviousResults],
      });

      expect(document.querySelectorAll('video')).toHaveLength(1);
      expect(screen.queryByText('searchErrorTitle')).not.toBeInTheDocument();
    });

    it('should not render error message when selectedQuery has no errorMessage', () => {
      const queryWithoutError: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.IDLE,
        results: [],
        topK: 10,
        watch: false,
        tags: [],
        errorMessage: undefined, // No error message
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryWithoutError],
      });

      // Should not render error message
      expect(screen.queryByText('⚠️')).not.toBeInTheDocument();
    });

    it('should handle refetch query button click', () => {
      const testQuery: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.ERROR, // Change to ERROR status to ensure button appears
        results: [],
        topK: 10,
        watch: false,
        tags: [],
        errorMessage: 'Network error', // Add error message
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [testQuery],
      });

      // Find the refetch button and verify it's clickable
      const refetchButton = screen.getByText('Re-run Search');
      expect(refetchButton).toBeInTheDocument();

      // Click the button (this covers the code path)
      fireEvent.click(refetchButton);

      // Verify button is still there after click
      expect(refetchButton).toBeInTheDocument();
    });

    it('should show search in progress tag when query is in progress', () => {
      const queryInProgress: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.RUNNING, // In progress
        results: [],
        topK: 10,
        watch: false,
        tags: [],
        errorMessage: undefined,
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryInProgress],
      });

      // Should show search in progress tag
      expect(screen.getByText('searchInProgress')).toBeInTheDocument();
    });

    it('should show search error tag when query has error status', () => {
      const queryWithErrorStatus: SearchQueryUI = {
        dbId: 1,
        queryId: 'query-1',
        query: 'test query',
        queryStatus: SearchQueryStatus.ERROR, // Error status
        results: [],
        topK: 10,
        watch: false,
        tags: [],
        errorMessage: 'Network error',
        createdAt: '2024-01-01',
        updatedAt: '2024-01-01',
      };

      renderSearchContent({
        selectedQuery: 'query-1',
        searchQueries: [queryWithErrorStatus],
      });

      // Should show search error tag
      expect(screen.getByText('searchError')).toBeInTheDocument();
    });
  });
});
