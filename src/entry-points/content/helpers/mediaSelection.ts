export interface MediaSelectionCandidate {
  paused: boolean;
  muted: boolean;
  volume: number;
  currentTime: number;
  width: number;
  height: number;
  hasAudioTrack: boolean;
}

export function scoreMediaCandidate(candidate: MediaSelectionCandidate): number {
  const playingScore = candidate.paused ? 0 : 200;
  const audibleScore = !candidate.muted && candidate.volume > 0 && candidate.hasAudioTrack ? 120 : 0;
  const progressedScore = Math.min(candidate.currentTime, 3600) * 0.01;
  const areaScore = Math.min(candidate.width * candidate.height, 1920 * 1080) / 10000;
  return playingScore + audibleScore + progressedScore + areaScore;
}

export function pickBestMediaCandidateIndex(candidates: MediaSelectionCandidate[]): number {
  if (candidates.length === 0) {
    return -1;
  }
  let bestIndex = 0;
  let bestScore = scoreMediaCandidate(candidates[0]);
  for (let i = 1; i < candidates.length; i += 1) {
    const score = scoreMediaCandidate(candidates[i]);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }
  return bestIndex;
}

export function toMediaSelectionCandidate(el: HTMLMediaElement): MediaSelectionCandidate {
  const withAudioTracks = el as HTMLMediaElement & { audioTracks?: { length?: number } };
  const hasAudioTrack = withAudioTracks.audioTracks
    ? (withAudioTracks.audioTracks.length ?? 1) > 0
    : true;
  const withSize = el as HTMLMediaElement & { videoWidth?: number; videoHeight?: number };
  const width = withSize.videoWidth ?? el.clientWidth ?? 0;
  const height = withSize.videoHeight ?? el.clientHeight ?? 0;
  return {
    paused: el.paused,
    muted: el.muted,
    volume: el.volume,
    currentTime: el.currentTime,
    width,
    height,
    hasAudioTrack,
  };
}
