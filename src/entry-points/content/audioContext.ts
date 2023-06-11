/**
 * @license
 * Copyright (C) 2020, 2021, 2022  WofWca <wofwca@protonmail.com>
 *
 * This file is part of Jump Cutter Browser Extension.
 *
 * Jump Cutter Browser Extension is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Jump Cutter Browser Extension is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Jump Cutter Browser Extension.  If not, see <https://www.gnu.org/licenses/>.
 */

export const audioContext = new AudioContext({
  // From what I understood `latencyHint` only affects the delay between `AudioDestinationNode`
  // and the system's output, so changing this to something faster won't actually affect
  // how fast we can react to loudness changes.
  // https://webaudio.github.io/web-audio-api/#dom-audiocontextoptions-latencyhint
  // https://webaudio.github.io/web-audio-api/#dom-audiocontext-baselatency
  // Would be cool if I was wrong.
  latencyHint: 'playback',
});
