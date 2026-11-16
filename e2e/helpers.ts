import { BrowserContext, Page, expect, test } from '@playwright/test';

// The site is served from the root of the custom domain; set BASE_PATH=/Spot-Cam to test a project-site build.
export const SITE = (process.env.BASE_PATH ?? '').replace(/\/$/, '');
export const paris = { latitude: 48.85837, longitude: 2.29448 };

export type CameraMode = 'granted' | 'denied' | 'notfound';
export type LocationMode = 'granted' | 'denied';
export type PermState = 'granted' | 'prompt' | 'denied';

export interface MockOptions {
  camera?: CameraMode;
  location?: LocationMode;
  /** What navigator.permissions.query() reports. Undefined keeps the browser's real answer. */
  permissionStates?: { camera?: PermState; geolocation?: PermState };
  /** Make the fake camera report a zoom range, and the zoom it starts at (like a real phone camera). */
  zoom?: { min: number; max: number; step: number; initial: number };
  /** The device has no camera that can be asked for by facing (a laptop webcam): an "exact" facing is refused. */
  noFacingMode?: boolean;
  /** How many cameras the device lists (default 1). The switch button needs two. */
  cameras?: number;
  /** The camera cannot open at a large picture size (some phones fail with "NotReadableError"): requests with a size are refused. */
  failsAtLargeSize?: boolean;
  /** The first time the camera opens it takes this long, so a test can leave the page while it is opening. */
  slowFirstOpenMs?: number;
}

/** Shape of the controller the init script exposes on `window`, so tests can flip modes live. */
export interface MockController {
  camera: CameraMode;
  location: LocationMode;
  permissionStates: { camera?: PermState; geolocation?: PermState };
  asked: string[];
  /** The constraints each getUserMedia call asked for. */
  constraints: unknown[];
  /** The constraints applied to the fake camera track afterwards (zoom, focus...). */
  applied: unknown[];
  /** The options each position watch was started with. */
  watchOptions: unknown[];
}

/**
 * Mocks the camera, geolocation errors and Permissions API *inside the page*, so permission
 * screens can be tested identically in Chromium, Firefox and WebKit. (Playwright can only
 * grant/deny the camera natively in Chromium.)
 *
 * - camera 'granted' returns a synthetic canvas stream (works in every engine).
 * - location 'granted' uses the real Geolocation API: pair it with `grantLocation()`.
 */
export async function installMocks(page: Page, options: MockOptions) {
  await page.addInitScript((o: MockOptions) => {
    const w = window as unknown as { __mock: MockController };
    w.__mock = {
      camera: o.camera ?? 'granted',
      location: o.location ?? 'granted',
      permissionStates: o.permissionStates ?? {},
      asked: [],
      constraints: [],
      applied: [],
      watchOptions: [],
    };

    const override = (target: object, name: string, value: unknown) =>
      Object.defineProperty(target, name, { value, configurable: true, writable: true });

    if (o.camera) {
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
      }
      // Patch the prototype, not the instance: in WebKit the instance can be re-wrapped (we saw our
      // override vanish on a cold start), while the prototype keeps the override for good.
      const mediaDevicesTarget: object = (window as any).MediaDevices?.prototype ?? navigator.mediaDevices;
      override(mediaDevicesTarget, 'getUserMedia', async (constraints?: MediaStreamConstraints) => {
        w.__mock.asked.push('camera');
        w.__mock.constraints.push(JSON.parse(JSON.stringify(constraints ?? null)));
        if (w.__mock.camera === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
        if (w.__mock.camera === 'notfound') throw new DOMException('Requested device not found', 'NotFoundError');
        const wanted = (constraints?.video as MediaTrackConstraints | undefined)?.facingMode as { exact?: string } | string | undefined;
        if (o.noFacingMode && wanted && typeof wanted === 'object' && wanted.exact) {
          const err = new Error('Camera facing that way not found');
          err.name = 'OverconstrainedError';
          throw err;
        }
        const video = constraints?.video as MediaTrackConstraints | undefined;
        if (o.failsAtLargeSize && video && typeof video === 'object' && video.width) {
          const err = new Error('Could not start video source');
          err.name = 'NotReadableError';
          throw err;
        }
        if (o.slowFirstOpenMs && w.__mock.asked.filter(a => a === 'camera').length === 1) {
          await new Promise(resolve => setTimeout(resolve, o.slowFirstOpenMs));
        }
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        let t = 0;
        const draw = () => {
          ctx.fillStyle = `hsl(${(t += 5) % 360} 55% 45%)`;
          ctx.fillRect(0, 0, 640, 480);
        };
        draw();
        setInterval(draw, 100);
        // Some engines (e.g. Playwright's WebKit on Windows) have no canvas.captureStream: fall back to
        // an empty stream, which is enough for the permission screens (but not for real photo frames).
        const stream = typeof canvas.captureStream === 'function' ? canvas.captureStream(10) : new MediaStream();
        const track = stream.getVideoTracks()[0];
        if (track) {
          (w as any).__fakeTracks = [...((w as any).__fakeTracks ?? []), track]; // keep the wrapper (and its overrides) alive
          // Report what a phone camera reports, and record what the page asks of it.
          const realSettings = track.getSettings?.bind(track);
          override(track, 'getCapabilities', () =>
            o.zoom
              ? { zoom: { min: o.zoom.min, max: o.zoom.max, step: o.zoom.step }, focusMode: ['manual', 'continuous'], exposureMode: ['manual', 'continuous'], whiteBalanceMode: ['manual', 'continuous'] }
              : {},
          );
          override(track, 'getSettings', () => ({ ...(realSettings?.() ?? {}), ...(o.zoom ? { zoom: o.zoom.initial } : {}) }));
          override(track, 'applyConstraints', async (c?: MediaTrackConstraints) => {
            w.__mock.applied.push(JSON.parse(JSON.stringify(c ?? null)));
          });
        }
        return stream;
      });
      override(mediaDevicesTarget, 'enumerateDevices', async () => Array.from({ length: o.cameras ?? 1 }, () => ({ kind: 'videoinput' }) as MediaDeviceInfo));
    }

    if (o.location) {
      const geoTarget: Geolocation = (window as any).Geolocation?.prototype ?? navigator.geolocation;
      const realWatch = geoTarget.watchPosition;
      Object.defineProperty(geoTarget, 'watchPosition', { configurable: true, writable: true, value: function (this: Geolocation, ok: PositionCallback, err?: PositionErrorCallback | null, opts?: PositionOptions) {
        w.__mock.asked.push('geolocation');
        w.__mock.watchOptions.push(opts ? JSON.parse(JSON.stringify(opts)) : null);
        if (w.__mock.location === 'denied') {
          setTimeout(
            () =>
              err?.({
                code: 1,
                message: 'User denied Geolocation',
                PERMISSION_DENIED: 1,
                POSITION_UNAVAILABLE: 2,
                TIMEOUT: 3,
              } as GeolocationPositionError),
            0,
          );
          return 1;
        }
        return realWatch.call(this, ok, err, opts);
      } });
    }

    // Keep navigator.permissions consistent with the mocked outcomes, as in a real browser:
    // granted -> 'granted'; otherwise 'prompt', unless a test pins an explicit state (e.g. 'denied').
    if (navigator.permissions) {
      const permTarget: Permissions = (window as any).Permissions?.prototype ?? navigator.permissions;
      const realQuery = permTarget.query;
      override(permTarget, 'query', async function (this: Permissions, desc: PermissionDescriptor) {
        const pinned = (w.__mock.permissionStates as Record<string, PermState | undefined>)[desc.name];
        const mode = desc.name === 'camera' ? w.__mock.camera : desc.name === 'geolocation' ? w.__mock.location : null;
        if (pinned || mode) {
          const state = pinned ?? (mode === 'granted' ? 'granted' : 'prompt');
          return { state, addEventListener() {}, removeEventListener() {} } as unknown as PermissionStatus;
        }
        return realQuery.call(this, desc);
      });
    }
  }, options);
}

/** Lets the page use the real Geolocation API (supported natively in all three engines). */
export async function grantLocation(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(paris);
}

/**
 * Stub reverse geocoding so tests never hit the network. Photon answers first (the default order),
 * so the other two are stubbed too in case a test makes the first one fail.
 */
export const mockGeocoder = async (page: Page) => {
  await page.route('**/photon.komoot.io/**', route =>
    route.fulfill({ json: { features: [{ properties: { name: 'Champ de Mars', city: 'Paris', country: 'France' } }] } }),
  );
  await page.route('**/api.bigdatacloud.net/**', route =>
    route.fulfill({ json: { locality: 'Champ de Mars', city: 'Paris', countryName: 'France' } }),
  );
  await page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { display_name: 'Champ de Mars, Paris, France' } }),
  );
};

/** Everything granted: synthetic camera + real (granted) location + stubbed address. */
export async function setUpGrantedCamera(page: Page, context: BrowserContext) {
  await installMocks(page, { camera: 'granted', location: 'granted' });
  await grantLocation(context);
  await mockGeocoder(page);
}

/** Skips the current test in engines that cannot produce synthetic camera frames. */
export async function skipIfNoCameraFrames(page: Page) {
  await page.goto('about:blank');
  const supported = await page.evaluate(
    () => typeof MediaStream === 'function' && typeof HTMLCanvasElement.prototype.captureStream === 'function',
  );
  test.skip(!supported, "This browser build has no MediaStream / canvas.captureStream, so it can't produce a fake camera stream");
}

/** Opens /cam (everything granted) and takes `count` photos. */
export async function takePhotos(page: Page, count = 1) {
  await skipIfNoCameraFrames(page);
  await page.goto(`${SITE}/cam`);
  const capture = page.getByRole('button', { name: 'Capture photo' });
  await expect(capture).toBeEnabled();
  for (let i = 0; i < count; i++) {
    await capture.click();
    await page.waitForTimeout(250); // let the flash and the IndexedDB write settle
  }
}

/** Flip a mock on the live page, e.g. to simulate the user allowing access in browser settings. */
export const setMock = (page: Page, patch: Partial<MockController>) =>
  page.evaluate(p => {
    const w = window as unknown as { __mock: MockController };
    Object.assign(w.__mock, p);
  }, patch);

export const askedFor = (page: Page) =>
  page.evaluate(() => [...new Set((window as unknown as { __mock: MockController }).__mock.asked)].sort());
