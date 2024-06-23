/**
 * @license
 * Copyright (C) 2023, 2024  WofWca <wofwca@protonmail.com>
 * Copyright (C) 2023  Jonas Herzig <me@johni0702.de>
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

import { assertDev } from "@/helpers";
import type { KeysOfType } from "@/helpers";

const VERBOSE_LOGGING = IS_DEV_MODE && true;

// TODO refactor: hmmm there is a lot of `stopSomething: () => void`. Maybe we can utilize
// `WeakRef`s and `FinalizationRegistry`? Why doesn't everybody does it?

export function startCloningMediaSources(): [
  getCloneElement: (originalElement: HTMLMediaElement) => HTMLMediaElement | undefined,
  stopCloningMediaSources: () => void,
] {
  const [objectUrlToMediaSourceMap, stopMaintainingUrlMap] =
    createMaintainedObjectUrlToMediaSourceMap();
  const [mediaSourceToCloneMediaElementMap, stopMaintainingCloneMap] =
    createMaintainedMediaSourceToCloneMediaElementMap();

  function getCloneElement(originalElement: HTMLMediaElement): HTMLMediaElement | undefined {
    const originalMediaSource = getOriginalMediaSource(originalElement);
    if (!originalMediaSource) {
      if (IS_DEV_MODE) {
        console.error('No original `MediaSource` found for the requested original element')
      }
      return;
    }
    const cloneEl = mediaSourceToCloneMediaElementMap.get(originalMediaSource);
    if (!cloneEl) {
      if (IS_DEV_MODE) {
        console.error('No clone element found for `MediaSource`. How did we miss it?');
      }
      return;
    }
    return cloneEl;
  }
  function getOriginalMediaSource(originalElement: HTMLMediaElement): MediaSource | undefined {
    // Also see {@link `createCloneElementWithSameSrc`}. It is very similar.
    // Maybe even too similar.

    // https://html.spec.whatwg.org/multipage/media.html#concept-media-load-algorithm
    // > If mode is object
    // > 1. Set the currentSrc attribute to the empty string.
    const { currentSrc } = originalElement;
    const isSrcObjectUsedOrNoSourceAtAll = !currentSrc;
    if (isSrcObjectUsedOrNoSourceAtAll) {
      const { srcObject } = originalElement;
      if (!srcObject) {
        // TODO maybe return different errors which the caller can differentiate between?
        return;
      }
      if (!(srcObject instanceof MediaSource)) {
        // This doesn't mean that this extension only supports `MediaSource` `srcObject`.
        // (they can also be `Blob`, `File`s):
        // https://html.spec.whatwg.org/multipage/media.html#media-elements:dom-media-srcobject
        // They're simply handled in a different part of the code (namely see
        // `createCloneElementWithSameSrc`).
        return;
      }
      return srcObject;
    }

    if (IS_DEV_MODE) {
      // URLs returned by `createObjectURL` are guaranteed to `.startsWith('blob:')`:
      // https://w3c.github.io/FileAPI/#unicodeBlobURL
      if (!currentSrc.startsWith('blob:')) {
        console.warn('Requested a clone element for original element whose `currentSrc` is not'
          + ' empty and is not a URL made from `URL.createObjectURL`');
      }
    }

    const fromObjectUrlMap = objectUrlToMediaSourceMap.get(currentSrc);
    if (!fromObjectUrlMap) {
      if (IS_DEV_MODE) {
        console.error('No MediaSource for this objectURL. How did we miss it?')
      }
      return;
    }
    const derefed = fromObjectUrlMap.deref();
    if (!derefed) {
      if (IS_DEV_MODE) {
        console.error('An original `MediaSource` for an `objectURL` used to exist,'
          + ' but it is now garbage-collected. How did we get a request for it then,'
          + ' if there are no references to it?');
      }
      return;
    }
    return derefed;
  }

  return [
    getCloneElement,
    () => {
      stopMaintainingUrlMap();
      stopMaintainingCloneMap();
    },
  ];
}

// I have no particular explanation on why I'm using `Map` instead of a plain object, but
// my intuition says that it's probably better.
type ObjectUrlToItsMediaSource = Map<
  ReturnType<typeof URL.createObjectURL>,
  // It's fine to not hold a strong reference because we would never
  // actually need a `MediaSource` if it is already not used by the page.
  //
  // Also FYI in Chromium currently it's the case that if you
  // `someEl.src = URL.createObjectURL(mediaSource)` but never `URL.revokeObjectURL(someEl.src)`,
  // it would still be possible for `mediaSource` to get garbage collected. If a website
  // relies on this (although they probably shouldn't) then we'd leak memory here.
  WeakRef<MediaSource>
>;
/**
 * Creates and maintains a map of all URLs created with `URL.createObjectURL`
 * to a `WeakRef` of the `MediaSource` that the URL was created for.
 * The map is automatically cleaned up when the target `MediaSource` is garbage-collected.
 * Calling `revokeObjectURL` doesn't remove the corresponding record from the map
 * (because the underlying object is still usable after that, see comment inside this function).
 *
 * TODO I think there must be a native way to resolve objectURLs to the underlying thing they're
 * holding.
 */
function createMaintainedObjectUrlToMediaSourceMap(): [
  map: ObjectUrlToItsMediaSource,
  stopWatching: () => void,
] {
  const map: ObjectUrlToItsMediaSource = new Map<string, WeakRef<MediaSource>>();
  // TODO perf: potential smol memory leak: add `FinalizationRegistry` (see the comment in
  // `ObjectUrlToItsMediaSource`).

  const stopInterceptingCreateObjectUrlCalls = startInterceptingMethodCalls(
    URL,
    'createObjectURL',
    ([obj], url) => {
      if (obj instanceof MediaSource) {
        map.set(url, new WeakRef(obj));
      }
    }
  );
  // The fact that `revokeObjectURL` has been called
  // doesn't mean that we need to remove it from the map, because an
  // `HTMLMediaElement` can still have that URL as `src` and play its
  // `MediaSource` properly, as long as started loading the URL before it
  // got revoked:
  // https://w3c.github.io/FileAPI/#creating-revoking
  // > Requests that were started before the url was revoked should still succeed.
  //
  // const stopInterceptingRevokeObjectUrlCalls = startInterceptingMethodCalls(
  //   URL,
  //   'revokeObjectURL',
  //   ([url]) => map.delete(url)
  // );

  return [
    map,
    stopInterceptingCreateObjectUrlCalls,
  ];
}

function createMaintainedMediaSourceToCloneMediaElementMap(): [
  map: WeakMap<MediaSource, HTMLMediaElement>,
  stopMaintainingMap: () => void,
] {
  const map = new WeakMap<MediaSource, HTMLMediaElement>();
  // Keep in mind that `HTMLMediaElement` sources can also be made out of `MediaSourceHandle`.
  // However, we currently don't (and can't, I think) intercept the corresponding `MediaSource`
  // constructor invokations since, according to the current spec, such `MediaSource`s can only
  // be constructed in workers (also see `MediaSource.canConstructInDedicatedWorker`). Sigh. TODO?
  const stopInterceptingMediaSourceConstructorCalls = startInterceptingMediaSourceConstructorCalls(
    (constructorArgs, originalMediaSource) => {
      // TODO handle `stopMaintainingMediaSourceClone` so the clone can be GCd.
      const maintainedMediaSourceClone =
        makeMaintainedMediaSourceClone(originalMediaSource, constructorArgs);

      // "Hold up, why can't we attach clone `MediaSource`s to clone `HTMLMediaElement`s or demand,
      // when we need a clone element to play back?". TL;DR: to avoid a memory leak.
      // Look at how the `makeMaintainedMediaSourceClone` function works.
      // Practically every operation on a `MediaSource` requires its `readyState` to be `"open"`.
      // So, when an operation is performed on the original `MediaSource`, we re-apply the operation
      // on the clone _through `cloneMSOpenP.then`_. This means that operations are queued until the
      // clone's state is "open". And they're not light-weight, especially the `appendBuffer` ones,
      // which are a huge memory leak hazard.
      //
      // TODO refactor: add tests that show that the clone `HTMLMediaElement` gets GCd when
      // the original `MediaSource` becomes unreachable.
      const cloneElement = document.createElement('audio');

      if (IS_DEV_MODE) {
        cloneElement.addEventListener('error', () => {
          console.error(
            'Jump Cutter: clone element error:',
            cloneElement.error
          );
        });
      }

      // TODO fix: I believe we also need to copy some attributes from the original element,
      // like `crossOrigin` (see {@link createCloneElementWithSameSrc}).
      // Should we leave it up to the script that actually uses the element?
      
      // Keep in mind that `URL.createObjectURL` is intercepted by us. Currently this is fine.
      const cloneMediaSourceUrl = URL.createObjectURL(maintainedMediaSourceClone);
      cloneElement.src = cloneMediaSourceUrl;
      // We can `URL.revokeObjectURL` as soon as the `HTMLMediaElement` gets a hold of the
      // underlying `MediaSource` and it will work fine. At least based on my tests, and this note:
      // https://w3c.github.io/FileAPI/#creating-revoking
      // > Requests that were started before the url was revoked should still succeed.
      // TODO refactor: the spec seems a bit vague in this regard. I.e. can you really use the
      // term "request" in regards to `MediaSource`s being used for `HTMLMediaElement` playback?
      {
        const revokeAndRemoveListener = () => {
          URL.revokeObjectURL(cloneMediaSourceUrl);
          cloneElement.removeEventListener('loadstart', revokeAndRemoveListener);
          clearTimeout(timeoutId);
        }
        cloneElement.addEventListener('loadstart', revokeAndRemoveListener, { once: true, passive: true });
        // Failsafe, just in case the event didn't fire for some reason.
        let timeoutId = setTimeout(() => {
          // Two `setTimeout`s in case one event cycle takes longer than serveral seconds idk lol.
          timeoutId = setTimeout(revokeAndRemoveListener);
        }, 10000);
      }

      // TODO fix: memory leak. Even when an `HTMLMediaSource` becomes unreachable,
      // it doesn't guarantee that it's gonna get GCd as long as it can potentially play audio:
      // https://html.spec.whatwg.org/multipage/media.html#best-practices-for-authors-using-media-elements
      // https://github.com/WofWca/jumpcutter/blob/505b55924871ebc3c433c54d431b828a052c470c/src/entry-points/content/ElementPlaybackControllerCloning/Lookahead.ts#L92-L102
      //
      // I'd suggest "well, just `.src = ''` when it's not needed and assign it when it is needed".
      // Doesn't work because you can only attach a `MediaSource` to a `HTMLMediaElement` once.
      //
      // I guess what we have to do is ensure that this extension doesn't hold strong references
      // to the original `MediaSource` (currently the clone `MediaSource` strongy references it)
      // and use `FinalizationRegistry` to watch for when the original `MediaSource` gets GCd
      // and clean up the clones.
      //
      // Another idea: since we know that `MediaSource`s can only be attached once to an
      // `HTMLMediaElement` (or do we know that? this comment
      // https://github.com/WofWca/jumpcutter/issues/2#issuecomment-1571654947
      // says that they can?? But in that case, we'd not have to create a clone `MediaSource`,
      // would we?), we could watch the original element that the original `MediaSource` gets
      // attached to and when it does get detached, we are good to clean our clones up.

      map.set(originalMediaSource, cloneElement);
    }
  )
  return [
    map,
    () => stopInterceptingMediaSourceConstructorCalls(),
  ];
}

function makeIntercepted<T extends (...args: unknown[]) => unknown>(
  originalFn: T,
  callback: (args: Parameters<T>, retVal: ReturnType<T>) => void,
): T {
  // TODO perf: should we use `Proxy.revokable()`?
  return new Proxy(originalFn, {
    apply(target, thisArg, argArray, ...rest) {
      const originalRetVal = Reflect.apply(target, thisArg, argArray, ...rest) as ReturnType<T>;

      VERBOSE_LOGGING &&
        console.debug(
          "➡️ intercepted",
          originalFn,
          argArray,
          originalRetVal
        );
      // TODO perf: maybe `queueMicrotask` so that the website's code is given
      // priority. However, it's the way the code was initially,
      // but switching to synchronous execution makes the cloning algorithm
      // much more reliable.
      // This applies to all other callbacks in this file.
      //
      // queueMicrotask(() => callback(argArray as Parameters<T>, originalRetVal));
      try {
        callback(argArray as Parameters<T>, originalRetVal);
      } catch (e) {
        IS_DEV_MODE
        && console.error('calling', originalFn, 'on clone threw an error', e);
      }

      return originalRetVal;
    },
  })
}
/**
 * When called, starts invoking `callback` whenever `object[methodName]` is called.
 * This mutates `object` (but we try to cause as little side effects as possible).
 * @param addOriginalProperty - whether to add a property to `object` that holds the original
 * function. Juuuuust in case. Idk, maybe someone's making an extension that is supposed to
 * work together with ours.
 * @returns stop intercepting
 */
function startInterceptingMethodCalls<
  T extends Record<string, any>,
  U extends KeysOfType<T, (...args: any[]) => any> & string,
>(
  object: T,
  methodName: U,
  callback: (params: Parameters<T[U]>, retVal: ReturnType<T[U]>) => void,
  addOriginalProperty = true
): () => void {
  const original = object[methodName];
  // TODO fix: consider overriding the prototype instead (`MediaSource.prototype.addSourceBuffer`).
  // (note that we can't do `MediaSource.prototype = new Proxy(MediaSource.prototype)` since
  // the assignment wouldn't work:
  // https://stackoverflow.com/questions/76366764/how-to-proxy-function-prototype).
  // Why? Because a website may call something like
  // `Object.getPrototypeOf(object).addSourceBuffer.apply(object, args)`,
  // which would bypass the override.
  // This also applies to `startInterceptingSetters`.
  //
  // This is also probably good for performance as we're not creating a bunch of proxies for each
  // object.
  //
  // That would, of course, require some refactoring since the same callback would be called for
  // each object, so it needs to be universal.
  object[methodName] = makeIntercepted(object[methodName], callback);

  const originalValuePropName = `_jumpCutterExtensionOriginal_${methodName}` as const;
  type MutatedOriginalObject = T & {
    OriginalValuePropName?: T[U]
  };
  if (addOriginalProperty) {
    // Also consider `Object.defineProperty` with `enumberable: false`.
    // @ts-expect-error 2322 Idk what's this about.
    (object as MutatedOriginalObject)[originalValuePropName] = original;
  }

  return () => {
    object[methodName] = original;
    delete (object as MutatedOriginalObject)[originalValuePropName];
  }
}

// You might ask "why not just do `new Proxy(object, { set(...`". Well, how are you gonna do it
// for `addSourceBuffer`, smartass?
/**
 * @param objectClass Must be the class that actually defines the `propName` property.
 * May be any class of the `object`'s prototype chain, e.g. for a `MediaSource` instance
 * it can be `MediaSource`, `EventTarget`, or `Object`.
 */
function startInterceptingSetters<
  C extends new (...args: any) => any,
  T extends InstanceType<C>,
  P extends keyof T,
>(
  object: T,
  propName: P,
  objectClass: C,
  callback: (newVal: T[P]) => void,
) {
  const prototype = objectClass.prototype;
  const originalDescriptor = Object.getOwnPropertyDescriptor(prototype, propName);
  if (!originalDescriptor) {
    if (IS_DEV_MODE) {
      console.error('No such property.', object, propName, prototype);
    }
    return;
  }
  const originalSet = originalDescriptor.set;
  if (!originalSet) {
    if (IS_DEV_MODE) {
      console.error('No setter for', propName, prototype, object);
    }
    return;
  }

  // TODO `addOriginalProperty` as in `startInterceptingMethodCalls`.
  Object.defineProperty(object, propName, {
    ...originalDescriptor,
    set(newVal, ...rest) {
      const retVal = originalSet.call(this, newVal, ...rest);

      VERBOSE_LOGGING &&
        console.debug("➡️ intercepted setter", object, propName, newVal);
      // queueMicrotask(() => callback(newVal));
      try {
        callback(newVal);
      } catch (e) {
        IS_DEV_MODE
        && console.error('setting', object, propName, 'on clone threw an error', e);
      }

      return retVal;
    },
  });

  return () => {
    delete object[propName];
  }
}

type MutatedGlobalThis = typeof globalThis & {
  _jumpCutterExtensionOriginal_MediaSource?: typeof MediaSource
};
/**
 * @returns stop intercepting
 */
function startInterceptingMediaSourceConstructorCalls(
  callback:
    (
      constructorArgs: ConstructorParameters<typeof MediaSource>,
      newMediaSource: MediaSource,
    ) => void,
): () => void {
  // TODO refactor: this code is very similar to `startInterceptingMethod`.

  const original = MediaSource;
  globalThis.MediaSource = new Proxy(MediaSource, {
    construct(target, argArray, newTarget, ...rest) {
      const originalRetVal = Reflect.construct(target, argArray, newTarget, ...rest);

      VERBOSE_LOGGING &&
        console.debug(
          "➡️ intercepted MediaSource constructor",
          newTarget,
          argArray,
          originalRetVal
        );
      // queueMicrotask(() => callback(
      //   argArray as ConstructorParameters<typeof MediaSource>,
      //   originalRetVal
      // ));
      try {
        callback(
          argArray as ConstructorParameters<typeof MediaSource>,
          originalRetVal
        );
      } catch (e) {
        IS_DEV_MODE
        && console.error('MediaSource constructor interceptor threw an error', argArray, e);
      }

      return originalRetVal;
    },
    // TODO refactor: this does not belong to the function named
    // `startInterceptingMediaSourceConstructorCalls`
    get(target, propName, receiver) {
      if (propName === 'canConstructInDedicatedWorker') {
        VERBOSE_LOGGING &&
          console.debug(
            "➡️ intercepted `MediaSource.canConstructInDedicatedWorker` getter. " +
              "Overiding with `false`",
            propName,
            "original would have returned:",
            Reflect.get(target, propName, receiver)
          );

        // We cannot intercept `MediaSource`s that are created inside dedicated workers.
        // Let's try to trick the website into falling back to creating `MediaSource` in
        // the page's context, where we can intercept it.
        // This currently works on e.g. twitch.tv.
        // TODO an option to turn this off.
        return false;
      }
      return Reflect.get(target, propName, receiver)
    },
  });

  // Also make it accessible to the whole page juuuust in case.
  (globalThis as MutatedGlobalThis)._jumpCutterExtensionOriginal_MediaSource = original;

  return () => {
    globalThis.MediaSource = original;
    delete (globalThis as MutatedGlobalThis)._jumpCutterExtensionOriginal_MediaSource;
  }
}

function makeMaintainedMediaSourceClone(
  originalMS: MediaSource,
  constructorArgs: ConstructorParameters<typeof MediaSource>,
): MediaSource {
  // The "MS" abbreviation means "MediaSource".

  // Calling the original one so that a clone is not created for the clone.
  // TODO refactor: write this properly somehow, decouple. Maybe add a way to signal to the
  // interceptor that this constructor is not to be intercepted? Extra constructor parameter?
  // Or some global variable, like `dontCloneNextMediaSourceInstance`. Or make
  // `startInterceptingMediaSourceConstructorCalls` also return `(pause/unpause)Intercepting`.
  const cloneMS = new (globalThis as Required<MutatedGlobalThis>)
    ._jumpCutterExtensionOriginal_MediaSource(...constructorArgs);

  // Many mutations of `MediaSource` (like `addSourceBuffer`) throw if its state is not "open",
  // so need to await.
  // https://w3c.github.io/media-source/#dom-mediasource-addsourcebuffer
  // TODO `readyState` can transition back from "open" actually, so maybe need to check and await
  // every time, roughly like `execWhenSourceBufferReady`.
  const cloneMSOpenP = new Promise<MediaSource>(r => {
    cloneMS.addEventListener('sourceopen', () => r(cloneMS), { once: true, passive: true });
  });

  if (IS_DEV_MODE) {
    const timeoutId = setTimeout(() => {
      console.error("Created a clone `MediaSource` for", cloneMS, "5 seconds ago, but it's"
        + " still not 'open'. Potential memory leak.");
      cloneMSOpenP.then(() => {
        console.warn(cloneMS, "is finally 'open'. Sheesh, that took a while");
      });
    }, 5000);
    cloneMSOpenP.then(() => clearTimeout(timeoutId));
  }

  const originalToCloneSourceBufferP =
    new WeakMap<SourceBuffer, Promise<SourceBuffer>>();

  // TODO perf: `stopIntercepting`.
  //
  // Currently known functions that we're not intercepting:
  // setLiveSeekableRange, clearLiveSeekableRange,
  // `EventTarget` ones (`addEventListener`, `dispatchEvent`)
  //
  // We're probably not intercepting something we should. But this works for the majority of sites.
  //
  // TODO refactor: consider a black-list approach instead, for forwards compatibility, or
  // maybe even dynamically determine which properties are settable
  // (`Object.getOwnPropertyDescriptors(MediaSource.prototype)`).
  startInterceptingMethodCalls(originalMS, 'addSourceBuffer', (params, originalSourceBuffer) => {
    const cloneSourceBufferP = makeMaintainedSourceBufferCloneWhenOpen(
      originalSourceBuffer,
      params,
      cloneMSOpenP
    );
    originalToCloneSourceBufferP.set(originalSourceBuffer, cloneSourceBufferP);
  });
  startInterceptingMethodCalls(
    originalMS,
    'removeSourceBuffer',
    ([originalSourceBuffer]) => {
      const cloneSourceBufferP = originalToCloneSourceBufferP.get(originalSourceBuffer);
      cloneSourceBufferP!.then(cloneSourceBuffer => {
        VERBOSE_LOGGING &&
          console.debug(
            "⬅️ executing on clone",
            originalMS,
            "removeSourceBuffer",
            originalSourceBuffer,
            cloneSourceBuffer,
          );

        cloneMS.removeSourceBuffer(cloneSourceBuffer)
      });
    }
  );
  // TBH I'm not sure if it's of any use to replicate `endOfStream`.
  startInterceptingMethodCalls(originalMS, 'endOfStream', (params) => {
    // TODO fix: this throws if one or more of the `SourceBuffer`s are `.updating === true`.
    // https://developer.mozilla.org/en-US/docs/Web/API/MediaSource/endOfStream#exceptions
    // M8, how am I supposed to track that?
    cloneMSOpenP.then(cloneMS => {
      VERBOSE_LOGGING &&
        console.debug("⬅️ executing on clone", originalMS, "endOfStream", params);

      cloneMS.endOfStream(...params)
    });
  });

  startInterceptingSetters(originalMS, 'duration', MediaSource, newVal => {
    // TODO this throws if one or more of the `SourceBuffer`s are `.updating === true`.
    // And I actually encountered it in the wild.
    cloneMSOpenP.then(cloneMS => {
      VERBOSE_LOGGING &&
        console.debug("⬅️ setting on clone", originalMS, "duration", newVal);

      cloneMS.duration = newVal;
    });
  });

  return cloneMS;
}

/**
 * @returns a Promise that resolves that the clone SourceBuffer
 */
function makeMaintainedSourceBufferCloneWhenOpen(
  originalSourceBuffer: ReturnType<MediaSource['addSourceBuffer']>,
  addSourceBufferParams: Parameters<MediaSource['addSourceBuffer']>,
  cloneMediaSourceOpenP: Promise<MediaSource>,
): Promise<SourceBuffer> {
  const cloneSourceBufferP = cloneMediaSourceOpenP.then(cloneMS => {
    VERBOSE_LOGGING && console.debug('make sourceBuffer', addSourceBufferParams);
    return cloneMS.addSourceBuffer(...addSourceBufferParams);
  });

  if (IS_DEV_MODE) {
    cloneSourceBufferP.then(cloneSourceBuffer => {
      cloneSourceBuffer.addEventListener('error', (event) => {
        console.error('cloneSourceBuffer error event', event)
      })
    })
  }

  // TODO perf: `stopIntercepting`.
  //
  // TODO fix: add appendBufferAsync, removeAsync
  // Currently known functions that we're not intercepting:
  // `EventTarget` ones (`addEventListener`, `dispatchEvent`)
  const methodNamesToReplicateCallsFor = [
    'appendBuffer',
    // `abort` may seem unimportant based on its name (like "let's just save time and not process"
    // the last chunk"), but it actually also
    // > resets the segment parser
    // , which is important for when you perform a seek to an unbuffered range, i.e. when
    // you `appendBuffer` that does not directly follow the last appended one in media-time
    // (or something like that, I'm not good at codecs).
    'abort',
    // We're replicating this mostly to avoid memory leaks, but I don't know if it's of essense
    // to playback.
    'remove',
    'changeType',
  ] as const /* satisfies Array<keyof typeof originalSourceBuffer> */;
  for (const methodName of methodNamesToReplicateCallsFor) {
    // Yes, we need to start intercepting _before_ the `cloneSourceBuffer` is created, in order
    // to not skip any calls.
    startInterceptingMethodCalls(originalSourceBuffer, methodName, async (params) => {
      const cloneSourceBuffer = await cloneSourceBufferP;
      execWhenSourceBufferReady(
        cloneSourceBuffer,
        () => {
          VERBOSE_LOGGING &&
            console.debug(
              "⬅️ executing on clone",
              originalSourceBuffer,
              methodName,
              params
            );
          (cloneSourceBuffer[methodName] as any)(...params);
        },
      );
    });
  }

  const propNamesToReplicateSettersFor = [
    'appendWindowStart',
    'appendWindowEnd',
    'mode',
    'timestampOffset',
  ] as const /* satisfies Array<keyof typeof originalSourceBuffer> */;
  for (const propName of propNamesToReplicateSettersFor) {
    startInterceptingSetters(originalSourceBuffer, propName, SourceBuffer, async newVal => {
      const cloneSourceBuffer = await cloneSourceBufferP;
      execWhenSourceBufferReady(
        cloneSourceBuffer,
        () => {
          VERBOSE_LOGGING &&
            console.debug(
              "⬅️ setting on clone",
              originalSourceBuffer,
              propName,
              newVal
            );
          (cloneSourceBuffer[propName] as any) = newVal;
        }
      );
    });
  }

  return cloneSourceBufferP;
}

/**
 * Execute `fn` when `sourceBuffer.updating` becomes `false`,
 * or immediately if it's already `false`.
 * If this function was called several times while `sourceBuffer.updating === true` then
 * `fn`s are executed in the same order as this function was called.
 */
function execWhenSourceBufferReady(sourceBuffer: SourceBuffer, fn: () => void): void {
  let queue = queueMap.get(sourceBuffer);
  if (queue && queue.length > 0) {
    // console.log('queue not empty, pushing', fn);

    queue.push(fn);
    return;
  }
  // There is nothing in the queue.

  if (!sourceBuffer.updating) {
    // console.log('sourceBuffer.updating === false, executing immediately', fn);
    fn();
    return;
  }

  if (!queue) {
    queue = [fn];
    queueMap.set(sourceBuffer, queue);
  } else {
    queue.push(fn);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _assert1: true = sourceBuffer.updating
  // `sourceBuffer.updating === true` and we just added the first item
  // to the queue.
  // Let's initiate the "empty queue" process

  const onSourceBufferReadyAndQueueNotEmpty = () => {
    if (sourceBuffer.updating) {
      IS_DEV_MODE && console.warn(
        "sourceBuffer.updating === true, but we're supposed to be the only " +
        "party that can operate on the sourceBuffer. " +
        "Something else made it busy. " +
        "We'll graciously wait for the next 'updateend' event"
      )
      return
    }

    // why `do while`? Because if `sourceBuffer.updating` didn't
    // become `true` after `fn()`,
    // there will be no subsequent 'updateend' event,
    // so we'd be waiting for it indefinitely.
    do {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const _assert2: true = !sourceBuffer.updating
      const fn = queue.shift();
      assertDev(fn);
      fn();

      if (!sourceBuffer.updating) {
        IS_DEV_MODE && console.warn(
          "Executed `fn()`, but it didn't make " +
          "`sourceBuffer.updating === true`\n" +
          "We'll handle it graciously, but usually " +
          "operations on `sourceBuffer` cause it to become busy."
        )
      }
  
      // Checking length _after_ `queue.shift()` because, as stated before,
      // there is at least one item in the queue, and this is the only code
      // that can reduce the size of the queue.
      if (queue.length === 0) {
        sourceBuffer.removeEventListener(
          'updateend',
          onSourceBufferReadyAndQueueNotEmpty
        );
        return
      }
      // The queue is still not empty.
    } while (!sourceBuffer.updating)
    // `sourceBuffer.updating === true` and the queue is still not empty.
    // Let's simply wait for the next 'updateend' event.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _assert2: true = sourceBuffer.updating
  }

  sourceBuffer.addEventListener(
    'updateend',
    onSourceBufferReadyAndQueueNotEmpty,
    { passive: true }
  );
  // Why 'updateend' and not 'updated' or 'update' and 'error' and 'abort'?
  // Because 'updateend' seems to be the only event that 100% correlates
  // with `.updating` becoming `false`.
  // https://www.w3.org/TR/media-source-2/#sourcebuffer-events
  // Search for "updating attribute to false" and
  // "fire an event named updateend". The former is always accompanied
  // by the latter.
  //
  // Although you might ask whether it makes sense
  // to apply queued operations
  // if the event that caused `.updating` to become `false`
  // is 'error' or 'abort'. IDK.
}
const queueMap = new WeakMap<SourceBuffer, Array<() => void>>();
