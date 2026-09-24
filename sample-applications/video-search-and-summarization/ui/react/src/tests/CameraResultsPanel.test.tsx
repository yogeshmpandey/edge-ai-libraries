// SPDX-FileCopyrightText: (C) 2026 Intel Corporation
// SPDX-License-Identifier: Apache-2.0
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CameraResultsPanel from '../components/MapView/CameraResultsPanel';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('../redux/search/VideoTile', () => ({
  VideoTile: ({ resultIndex, showScoreDetails }: { resultIndex: number; showScoreDetails?: boolean }) => (
    <div data-score-details={String(showScoreDetails)}>result-{resultIndex}</div>
  ),
}));

const marker = {
  tag: 'lobby-cam',
  label: 'Lobby',
  lat: 37.3875,
  lon: -121.9636,
  resultIndices: [0, 1],
};

describe('CameraResultsPanel', () => {
  it('isolates wheel and pointer interactions from the map behind it', () => {
    const onWheel = vi.fn();
    const onPointerDown = vi.fn();

    render(
      <div onWheel={onWheel} onPointerDown={onPointerDown}>
        <CameraResultsPanel tag={marker.tag} markers={[marker]} onClose={vi.fn()} />
      </div>,
    );

    const panel = screen.getByTestId('camera-results-panel');
    fireEvent.wheel(panel, { deltaY: 100 });
    fireEvent.pointerDown(panel, { clientX: 10, clientY: 10 });

    expect(onWheel).not.toHaveBeenCalled();
    expect(onPointerDown).not.toHaveBeenCalled();
  });

  it('hides raw, peak, and score breakdown controls on panel cards', () => {
    render(<CameraResultsPanel tag={marker.tag} markers={[marker]} onClose={vi.fn()} />);

    expect(screen.getByText('result-0')).toHaveAttribute('data-score-details', 'false');
    expect(screen.getByText('result-1')).toHaveAttribute('data-score-details', 'false');
  });
});
