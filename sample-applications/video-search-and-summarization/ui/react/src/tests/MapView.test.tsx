// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { CameraMarker } from '../components/MapView/cameraMarkers';
import MapView from '../components/MapView/MapView';

// Mock i18next: return the key (and interpolate {{count}} the way the real i18next default would for
// our purposes, i.e. just enough to assert on).
vi.mock('react-i18next', async () => ({
  ...(await vi.importActual('react-i18next')),
  useTranslation: () => ({
    t: (key: string, defaultValueOrOptions?: unknown, maybeOptions?: unknown) => {
      const options =
        typeof defaultValueOrOptions === 'object' && defaultValueOrOptions !== null
          ? defaultValueOrOptions
          : maybeOptions;
      if (options && typeof options === 'object' && 'count' in (options as Record<string, unknown>)) {
        return `${key}:${(options as Record<string, unknown>).count}`;
      }
      return key;
    },
  }),
}));

// Isolate MapView's own pan/zoom/culling logic from CameraCard/CameraResultsPanel's redux dependencies.
vi.mock('../components/MapView/CameraCard', () => ({
  default: ({
    marker,
    left,
    top,
    horizontalOffset,
    placement,
  }: {
    marker: CameraMarker;
    left: number;
    top: number;
    horizontalOffset: number;
    placement: string;
  }) => (
    <div
      data-testid={`card-${marker.tag}`}
      data-left={left}
      data-top={top}
      data-horizontal-offset={horizontalOffset}
      data-placement={placement}
    >
      {marker.label}
    </div>
  ),
}));

vi.mock('../components/MapView/CameraResultsPanel', () => ({
  default: ({ tag }: { tag: string | null }) => (tag ? <div data-testid='panel'>{tag}</div> : null),
}));

const makeMarker = (overrides: Partial<CameraMarker>): CameraMarker => ({
  tag: 'cam',
  label: 'Camera',
  lat: 0,
  lon: 0,
  resultIndices: [0],
  ...overrides,
});

const stubContainerSize = (width: number, height: number) => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
    height,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
};

describe('MapView', () => {
  beforeEach(() => {
    stubContainerSize(800, 600);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows the empty-state notice when there are no markers', () => {
    render(<MapView markers={[]} unmappedCount={0} />);
    expect(screen.getByText('NoCameraLocations')).toBeInTheDocument();
  });

  it('renders a card for each marker once the viewport is measured', () => {
    const markers = [makeMarker({ tag: 'lobby-cam', label: 'Lobby' }), makeMarker({ tag: 'dock-cam', label: 'Dock' })];
    render(<MapView markers={markers} unmappedCount={0} />);

    expect(screen.getByTestId('card-lobby-cam')).toBeInTheDocument();
    expect(screen.getByTestId('card-dock-cam')).toBeInTheDocument();
  });

  it('refits when the marker set changes without remounting, even at the same count', () => {
    const { rerender } = render(<MapView markers={[makeMarker({ tag: 'first', lat: 0, lon: 0 })]} unmappedCount={0} />);

    rerender(<MapView markers={[makeMarker({ tag: 'second', lat: 40, lon: 100 })]} unmappedCount={0} />);

    expect(Number(screen.getByTestId('card-second').getAttribute('data-left'))).toBeCloseTo(400, 3);
    expect(Number(screen.getByTestId('card-second').getAttribute('data-top'))).toBeCloseTo(300, 3);
  });

  it('refits when the map container becomes smaller so every marker stays visible', () => {
    const markers = [makeMarker({ tag: 'west', lon: -20 }), makeMarker({ tag: 'east', lon: 20 })];
    render(<MapView markers={markers} unmappedCount={0} />);

    stubContainerSize(400, 300);
    fireEvent.resize(window);

    const west = Number(screen.getByTestId('card-west').getAttribute('data-left'));
    const east = Number(screen.getByTestId('card-east').getAttribute('data-left'));
    expect(west).toBeGreaterThanOrEqual(60);
    expect(east).toBeLessThanOrEqual(340);
  });

  it('restores the best-fit camera view after manual zooming', () => {
    const markers = [makeMarker({ tag: 'west', lon: -20 }), makeMarker({ tag: 'east', lon: 20 })];
    render(<MapView markers={markers} unmappedCount={0} />);

    const initialWest = screen.getByTestId('card-west').getAttribute('data-left');
    fireEvent.click(screen.getByLabelText('ZoomOut'));
    expect(screen.getByTestId('card-west').getAttribute('data-left')).not.toBe(initialWest);

    fireEvent.click(screen.getByLabelText('FitCameras'));
    expect(screen.getByTestId('card-west').getAttribute('data-left')).toBe(initialWest);
  });

  it('culls a marker after panning it beyond the viewport margin', () => {
    render(<MapView markers={[makeMarker({ tag: 'lobby-cam' })]} unmappedCount={0} />);

    const mapContainer = screen.getByTestId('map-view');
    fireEvent.pointerDown(mapContainer, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(mapContainer, { clientX: 1400, clientY: 300 });

    expect(screen.queryByTestId('card-lobby-cam')).toBeNull();
  });

  it('renders the internal basemap tiles and attribution', () => {
    render(<MapView markers={[makeMarker({})]} unmappedCount={0} />);
    expect(document.querySelector('img')).not.toBeNull();
    expect(document.querySelector('img')?.getAttribute('src')).toContain('https://tile.openstreetmap.org/');
    expect(screen.getByText('MapAttribution')).toBeInTheDocument();
  });

  it('shows the unmapped-results notice only when unmappedCount is greater than 0', () => {
    const { rerender } = render(<MapView markers={[makeMarker({})]} unmappedCount={0} />);
    expect(screen.queryByText(/UnmappedResults/)).toBeNull();

    rerender(<MapView markers={[makeMarker({})]} unmappedCount={3} />);
    expect(screen.getByText('UnmappedResults:3')).toBeInTheDocument();
  });

  it('zooms in and out via the zoom control buttons', () => {
    render(<MapView markers={[makeMarker({})]} unmappedCount={0} />);

    const zoomInButton = screen.getByLabelText('ZoomIn');
    const zoomOutButton = screen.getByLabelText('ZoomOut');

    // Simply verify the controls are present and clickable without throwing -
    // the resulting view state is exercised indirectly through card positioning.
    expect(() => fireEvent.click(zoomInButton)).not.toThrow();
    expect(() => fireEvent.click(zoomOutButton)).not.toThrow();
  });

  it('treats a small pointer movement as a click, not a pan (drag threshold)', () => {
    const markers = [makeMarker({ tag: 'lobby-cam' })];
    render(<MapView markers={markers} unmappedCount={0} />);

    const mapContainer = screen.getByTestId('map-view');
    const before = screen.getByTestId('card-lobby-cam').getAttribute('data-left');

    fireEvent.pointerDown(mapContainer, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(mapContainer, { clientX: 101, clientY: 101 });
    fireEvent.pointerUp(mapContainer, { clientX: 101, clientY: 101 });

    const after = screen.getByTestId('card-lobby-cam').getAttribute('data-left');
    expect(after).toBe(before);
  });

  it('pans the view (moves card screen positions) once the drag threshold is exceeded', () => {
    const markers = [makeMarker({ tag: 'lobby-cam', lat: 10, lon: 10 })];
    render(<MapView markers={markers} unmappedCount={0} />);

    const mapContainer = screen.getByTestId('map-view');
    const before = screen.getByTestId('card-lobby-cam').getAttribute('data-left');

    fireEvent.pointerDown(mapContainer, { clientX: 100, clientY: 100 });
    fireEvent.pointerMove(mapContainer, { clientX: 200, clientY: 100 });

    const after = screen.getByTestId('card-lobby-cam').getAttribute('data-left');
    expect(after).not.toBe(before);
  });

  it('shifts a card inward when its anchor approaches the viewport edge', () => {
    render(<MapView markers={[makeMarker({ tag: 'lobby-cam' })]} unmappedCount={0} />);

    const mapContainer = screen.getByTestId('map-view');
    fireEvent.pointerDown(mapContainer, { clientX: 400, clientY: 300 });
    fireEvent.pointerMove(mapContainer, { clientX: 20, clientY: 300 });

    expect(Number(screen.getByTestId('card-lobby-cam').getAttribute('data-horizontal-offset'))).toBeGreaterThan(0);
  });
});
