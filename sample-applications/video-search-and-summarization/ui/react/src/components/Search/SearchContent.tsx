// Copyright (C) 2025 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { FC, useEffect, useMemo } from 'react';
import styled from 'styled-components';
import { useAppDispatch, useAppSelector } from '../../redux/store';
import { useTranslation } from 'react-i18next';
import {
  Slider,
  Tag,
  Tooltip,
  Button,
  Accordion,
  AccordionItem,
  InlineLoading,
  SkeletonPlaceholder,
  SkeletonText,
} from '@carbon/react';
import { RerunSearch, SearchActions, SearchSelector } from '../../redux/search/searchSlice';
import { SearchResult, TimeFilterSelection } from '../../redux/search/search';
import TimeFilterControl from './TimeFilterControl';
import { StateActionStatus } from '../../redux/summary/summary';
import { VideoTile } from '../../redux/search/VideoTile';
import { UIActions, uiSelector } from '../../redux/ui/ui.slice';
import { ResultsView } from '../../redux/ui/ui.model';
import VideoGroupsView from '../VideoGroups/VideoGroupsView';
import TelemetryAccordion from './TelemetryAccordion';
import MapView from '../MapView/MapView';
import { buildCameraMarkers, unmappedResultCount } from '../MapView/cameraMarkers';
import { mapConfigSelector } from '../../redux/mapConfig/mapConfigSlice';

// Keying by clip identity rather than array position keeps unchanged tiles mounted when a
// watched query refreshes, so their <video> elements are not torn down and reloaded.
const searchResultKey = (result: SearchResult, index: number): string => {
  const videoId = result?.metadata?.video_id;
  const timestamp = result?.metadata?.timestamp;
  if (videoId === undefined || timestamp === undefined) return `result-${index}`;
  return `${videoId}-${timestamp}`;
};

const QueryContentWrapper = styled.div`
  display: flex;
  flex-flow: column nowrap;
  align-items: flex-start;
  justify-content: flex-start;
  overflow: hidden;
  .videos-container {
    display: flex;
    flex-flow: row wrap;
    overflow-x: hidden;
    overflow-y: auto;
  }
`;

const SettingsContainer = styled.div`
  position: sticky;
  width: 100%;
  top: 0;
  z-index: 2;
  background-color: var(--color-sidebar);
  border-bottom: 1px solid var(--color-border);
  .cds--accordion__item {
    padding-inline-end: 0rem;
  }
`;

const SettingsBar = styled.div`
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  padding: 1rem 0;
  width: 100%;
  gap: 0.75rem;
  flex-wrap: wrap;
`;

const SettingsSection = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1 1 0;
  /* min-width: 10rem; */
`;

const ControlCard = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem;
  border: 0.1px solid #a8a8a8;
  border-radius: 0.5rem;
  background: #f4f4f4;
`;

const SliderBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 8rem;
`;

const QueryBar = styled.div`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background-color: #f4f4f4;
  border-bottom: 1px solid var(--color-border);
  width: 100%;

  .query-label {
    font-weight: 600;
    color: #525252;
  }

  .query-text {
    font-weight: 700;
    color: #161616;
  }

  .cds--tooltip-trigger__wrapper {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40rem;
  }
`;

const ViewActionSeparator = styled.span`
  color: #8d8d8d;
  line-height: 2rem;
  user-select: none;
`;

const SliderLabel = styled.div`
  margin-right: 1rem;
`;

const IntervalNotice = styled.div`
  width: 100%;
  padding: 0.5rem 1rem;
  background: #eef4ff;
  color: #0f62fe;
  font-weight: 600;
  border-bottom: 1px solid var(--color-border);
`;

export const statusClassName = {
  [StateActionStatus.NA]: 'gray',
  [StateActionStatus.READY]: 'purple',
  [StateActionStatus.IN_PROGRESS]: 'blue',
  [StateActionStatus.COMPLETE]: 'green',
};

export const statusClassLabel = {
  [StateActionStatus.NA]: 'naTag',
  [StateActionStatus.READY]: 'readyTag',
  [StateActionStatus.IN_PROGRESS]: 'progressTag',
  [StateActionStatus.COMPLETE]: 'completeTag',
};

const NothingSelectedWrapper = styled.div`
  opacity: 0.6;
  padding: 0 2rem;
`;

const TagsContainer = styled.div`
  display: flex;
  flex-flow: row wrap;
  align-items: center;
  justify-content: flex-start;
  margin-left: 1rem;
  .cds--tag {
    margin: 0.25rem;
  }
`;

const ErrorMessageWrapper = styled.div`
  padding: 1.5rem;
  background-color: #fdf2f2;
  border: 1px solid #da1e28;
  border-radius: 0.5rem;
  margin: 1rem;
  display: flex;
  align-items: flex-start;
  gap: 1rem;

  .error-icon {
    font-size: 1.5rem;
    flex-shrink: 0;
  }

  .error-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .error-title {
    font-weight: 600;
    color: #da1e28;
    font-size: 1.1rem;
  }

  .error-text {
    color: #525252;
    line-height: 1.4;
  }

  .error-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }
`;

export const QuerySettings: FC = () => {
  const { selectedQuery, isSelectedInProgress, isSelectedHasError } = useAppSelector(SearchSelector);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  const currentTimeFilter: TimeFilterSelection | null | undefined = selectedQuery?.timeFilter;

  const updateTimeFilter = (timeFilter: TimeFilterSelection | null) => {
    if (!selectedQuery) return;
    dispatch(SearchActions.updateTimeFilter({ queryId: selectedQuery.queryId, timeFilter }));
    dispatch(RerunSearch({ queryId: selectedQuery.queryId, timeFilter }));
  };

  return (
    <SettingsContainer>
      <Accordion align='start' size='sm'>
        <AccordionItem title={t('filters', 'Filters')}>
          <SettingsBar>
            <SettingsSection style={{ justifyContent: 'flex-start' }}>
              {isSelectedInProgress && (
                <Tag size='sm' type='blue'>
                  {t('searchInProgress')}
                </Tag>
              )}
              {isSelectedHasError && (
                <Tag size='sm' type='red'>
                  {t('searchError')}
                </Tag>
              )}
            </SettingsSection>

            <SettingsSection style={{ justifyContent: 'center' }}>
              {selectedQuery && (
                <ControlCard>
                  <SliderBlock>
                    <SliderLabel>{t('searchOutputCount', 'Search Output Count')}</SliderLabel>
                    <Slider
                      min={1}
                      max={20}
                      step={1}
                      value={selectedQuery.topK}
                      hideTextInput
                      onChange={({ value }) => {
                        dispatch(SearchActions.updateTopK({ queryId: selectedQuery.queryId, topK: value }));
                      }}
                    />
                  </SliderBlock>
                </ControlCard>
              )}
            </SettingsSection>

            <SettingsSection style={{ justifyContent: 'flex-end' }}>
              {selectedQuery && (
                <ControlCard>
                  <TimeFilterControl
                    key={selectedQuery.queryId}
                    timeFilter={currentTimeFilter}
                    onChange={updateTimeFilter}
                    idPrefix='time-filter'
                    size='sm'
                  />
                </ControlCard>
              )}
            </SettingsSection>
          </SettingsBar>
        </AccordionItem>
      </Accordion>
    </SettingsContainer>
  );
};

export const QueryInfo: FC = () => {
  const { selectedQuery, isSelectedRefreshing } = useAppSelector(SearchSelector);
  const { resultsView } = useAppSelector(uiSelector);
  const { hasCameraLocations } = useAppSelector(mapConfigSelector);
  const dispatch = useAppDispatch();
  const { t } = useTranslation();

  if (!selectedQuery) return null;

  const toggleResultsView = (nextView: ResultsView) => {
    dispatch(UIActions.setResultsView(resultsView === nextView ? ResultsView.LIST : nextView));
  };

  return (
    <QueryBar>
      <span className='query-label'>{t('userQueryLabel', 'User Query:')}</span>
      <Tooltip align='bottom' label={selectedQuery.query}>
        <strong className='query-text'>{selectedQuery.query}</strong>
      </Tooltip>
      {selectedQuery.tags.length > 0 && (
        <TagsContainer>
          {selectedQuery.tags.map((tag, index) => (
            <Tag key={index} size='sm' type='high-contrast'>
              {tag}
            </Tag>
          ))}
        </TagsContainer>
      )}
      <span style={{ flex: 1 }}></span>
      {isSelectedRefreshing && (
        <span data-testid='search-refreshing-indicator' style={{ marginRight: '0.5rem' }}>
          <InlineLoading status='active' description={t('searchUpdating')} />
        </span>
      )}
      <Button
        kind='ghost'
        size='sm'
        aria-pressed={resultsView === ResultsView.LIST}
        onClick={() => dispatch(UIActions.setResultsView(ResultsView.LIST))}
      >
        {t('ResultsList', 'Results')}
      </Button>
      {hasCameraLocations && (
        <Button
          kind='ghost'
          size='sm'
          aria-pressed={resultsView === ResultsView.MAP}
          onClick={() => toggleResultsView(ResultsView.MAP)}
        >
          {t('MapView', 'Map View')}
        </Button>
      )}
      <Button
        kind='ghost'
        size='sm'
        aria-pressed={resultsView === ResultsView.GROUPS}
        onClick={() => toggleResultsView(ResultsView.GROUPS)}
      >
        {t('GroupByTag')}
      </Button>
      <ViewActionSeparator data-testid='view-action-separator' aria-hidden='true'>
        |
      </ViewActionSeparator>
      <Button
        kind='ghost'
        size='sm'
        onClick={() => {
          dispatch(RerunSearch({ queryId: selectedQuery.queryId, timeFilter: selectedQuery.timeFilter }));
        }}
      >
        Re-run Search
      </Button>
    </QueryBar>
  );
};

export const IntervalDisplay: FC = () => {
  const { selectedQuery } = useAppSelector(SearchSelector);
  if (
    !selectedQuery ||
    !selectedQuery.timeFilter ||
    !selectedQuery.timeFilter.value ||
    !selectedQuery.timeFilter.unit
  ) {
    return null;
  }

  const { value, unit } = selectedQuery.timeFilter;
  const unitLabel = unit.charAt(0).toUpperCase() + unit.slice(1);

  return <IntervalNotice>{`Time Range: Last ${value} ${unitLabel}`}</IntervalNotice>;
};

const NoQuerySelected: FC = () => <NothingSelectedWrapper></NothingSelectedWrapper>;

// Sized through CSS rather than an inline `style` prop, since older @carbon/react
// typings do not declare `style` on SkeletonPlaceholder.
const SkeletonTile = styled.div`
  width: 100%;

  .cds--skeleton__placeholder {
    width: 100%;
    height: 10rem;
  }
`;

const SearchResultsSkeleton: FC<{ count?: number }> = ({ count = 4 }) => (
  <div className='videos-container' data-testid='search-results-skeleton'>
    {Array.from({ length: count }, (_, index) => (
      <div className='video-tile' key={`skeleton-${index}`}>
        <SkeletonTile>
          <SkeletonPlaceholder />
        </SkeletonTile>
        <div className='relevance'>
          <SkeletonText width='60%' />
        </div>
      </div>
    ))}
  </div>
);

const VideosContainer: FC = () => {
  const { selectedQuery, selectedResults, isSelectedInitialLoading, isSelectedHasError } =
    useAppSelector(SearchSelector);
  const { t } = useTranslation();

  if (!selectedQuery) return null;

  // Queries that already have results keep them mounted through both refreshes (see the
  // QueryInfo "updating" chip) and failed re-runs, so these guards only apply when empty.
  if (selectedResults.length === 0) {
    if (isSelectedHasError) return null;

    // First run has nothing worth preserving, so show placeholders instead of a blank pane.
    if (isSelectedInitialLoading) return <SearchResultsSkeleton />;

    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#525252', fontStyle: 'italic' }}>
        <p>{t('noSearchResults', 'No videos found matching your search query.')}</p>
        <p>{t('tryDifferentSearch', 'Try using different keywords or check if videos have been uploaded.')}</p>
      </div>
    );
  }

  return (
    <div className='videos-container'>
      {selectedResults.map((result, index) => (
        <VideoTile key={searchResultKey(result, index)} resultIndex={index} />
      ))}
    </div>
  );
};

const ErrorMessage: FC = () => {
  const { selectedQuery } = useAppSelector(SearchSelector);
  const { t } = useTranslation();
  if (!selectedQuery?.errorMessage) return null;

  return (
    <ErrorMessageWrapper>
      <div className='error-icon'>⚠️</div>
      <div className='error-content'>
        <div className='error-title'>{t('searchErrorTitle', 'Search Failed')}</div>
        <div className='error-text'>{selectedQuery.errorMessage}</div>
      </div>
    </ErrorMessageWrapper>
  );
};

const MapResultsContainer: FC = () => {
  const { selectedResults } = useAppSelector(SearchSelector);
  const { cameras } = useAppSelector(mapConfigSelector);

  const markers = useMemo(() => buildCameraMarkers(selectedResults, cameras), [selectedResults, cameras]);
  const unmappedCount = useMemo(() => unmappedResultCount(selectedResults, cameras), [selectedResults, cameras]);

  return (
    <div style={{ width: '100%', flex: '1 1 0%', minHeight: 0 }}>
      <MapView markers={markers} unmappedCount={unmappedCount} />
    </div>
  );
};

export const SearchContent: FC = () => {
  const { selectedQuery, selectedResults, isSelectedHasError } = useAppSelector(SearchSelector);
  const hasSelectedQuery = Boolean(selectedQuery);
  const { resultsView } = useAppSelector(uiSelector);
  const { hasCameraLocations } = useAppSelector(mapConfigSelector);
  const dispatch = useAppDispatch();

  // If the mapping disappears (e.g. the operator cleared map-config.json)
  // while Map View is active, fall back to the flat list rather than leaving
  // the user on a view that can no longer be reached from the controls.
  useEffect(() => {
    if (resultsView === ResultsView.MAP && !hasCameraLocations) {
      dispatch(UIActions.setResultsView(ResultsView.LIST));
    }
  }, [resultsView, hasCameraLocations, dispatch]);

  const renderResults = () => {
    if (isSelectedHasError && selectedResults.length === 0) return <ErrorMessage />;

    switch (resultsView) {
      case ResultsView.GROUPS:
        return <VideoGroupsView />;
      case ResultsView.MAP:
        return hasCameraLocations ? <MapResultsContainer /> : <VideosContainer />;
      case ResultsView.LIST:
      default:
        return <VideosContainer />;
    }
  };

  return (
    <>
      <QueryContentWrapper style={{ width: '100%', height: '100%', minHeight: 0 }}>
        {!hasSelectedQuery && <NoQuerySelected />}

        {hasSelectedQuery && (
          <>
            <QuerySettings />
            <QueryInfo />
            <IntervalDisplay />
            {renderResults()}
          </>
        )}
        <TelemetryAccordion />
      </QueryContentWrapper>
    </>
  );
};

export default SearchContent;
