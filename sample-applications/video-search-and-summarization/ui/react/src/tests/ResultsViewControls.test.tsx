// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { describe, expect, it, vi } from 'vitest';
import { QueryInfo } from '../components/Search/SearchContent';
import { ResultsView } from '../redux/ui/ui.model';
import { createSearchQuery, createSearchState, createTestStore, createUiState } from './testUtils';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const createStore = () =>
  createTestStore({
    search: createSearchState({
      searchQueries: [createSearchQuery({ queryId: 'query-1', query: 'vehicles' })],
      selectedQuery: 'query-1',
    }),
    ui: createUiState({ resultsView: ResultsView.LIST }),
    mapConfig: {
      cameras: { lobby: { lat: 0, lon: 0, label: 'Lobby' } },
      loaded: true,
    },
  });

describe('results view controls', () => {
  it('defaults to Results and keeps Map View immediately left of Group by Tag', () => {
    const store = createStore();
    render(
      <Provider store={store}>
        <QueryInfo />
      </Provider>,
    );

    const resultsButton = screen.getByRole('button', { name: 'ResultsList' });
    const mapButton = screen.getByRole('button', { name: 'MapView' });
    const groupButton = screen.getByRole('button', { name: 'GroupByTag' });
    const rerunButton = screen.getByRole('button', { name: 'Re-run Search' });
    const separator = screen.getByTestId('view-action-separator');

    expect(resultsButton).toHaveAttribute('aria-pressed', 'true');
    expect(resultsButton.compareDocumentPosition(mapButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mapButton.compareDocumentPosition(groupButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(groupButton.compareDocumentPosition(separator) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(separator.compareDocumentPosition(rerunButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(separator).toHaveTextContent('|');

    fireEvent.click(mapButton);
    expect(store.getState().ui.resultsView).toBe(ResultsView.MAP);
    fireEvent.click(resultsButton);
    expect(store.getState().ui.resultsView).toBe(ResultsView.LIST);

    fireEvent.click(groupButton);
    expect(store.getState().ui.resultsView).toBe(ResultsView.GROUPS);
    fireEvent.click(resultsButton);
    expect(store.getState().ui.resultsView).toBe(ResultsView.LIST);
  });
});
