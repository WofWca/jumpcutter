import { describe, expect, it } from 'vitest';
import {
  pickBestMediaCandidateIndex,
  scoreMediaCandidate,
} from '../src/entry-points/content/helpers/mediaSelection';

describe('media selection', () => {
  it('prefers currently playing audible media', () => {
    const index = pickBestMediaCandidateIndex([
      {
        paused: false,
        muted: true,
        volume: 0,
        currentTime: 50,
        width: 1280,
        height: 720,
        hasAudioTrack: false,
      },
      {
        paused: false,
        muted: false,
        volume: 1,
        currentTime: 10,
        width: 640,
        height: 360,
        hasAudioTrack: true,
      },
    ]);
    expect(index).toBe(1);
  });

  it('gives deterministic index when candidates tie', () => {
    const index = pickBestMediaCandidateIndex([
      {
        paused: true,
        muted: false,
        volume: 1,
        currentTime: 0,
        width: 100,
        height: 100,
        hasAudioTrack: true,
      },
      {
        paused: true,
        muted: false,
        volume: 1,
        currentTime: 0,
        width: 100,
        height: 100,
        hasAudioTrack: true,
      },
    ]);
    expect(index).toBe(0);
  });

  it('scores larger area and progressed media higher among paused media', () => {
    const scoreA = scoreMediaCandidate({
      paused: true,
      muted: false,
      volume: 1,
      currentTime: 10,
      width: 640,
      height: 360,
      hasAudioTrack: true,
    });
    const scoreB = scoreMediaCandidate({
      paused: true,
      muted: false,
      volume: 1,
      currentTime: 90,
      width: 1280,
      height: 720,
      hasAudioTrack: true,
    });
    expect(scoreB).toBeGreaterThan(scoreA);
  });
});
