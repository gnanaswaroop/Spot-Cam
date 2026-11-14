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
}

/** Shape of the controller the init script exposes on `window`, so tests can flip modes live. */
export interface MockController {
  camera: CameraMode;
  location: LocationMode;
  permissionStates: { camera?: PermState; geolocation?: PermState };
  asked: string[];
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
    };

    if (o.camera) {
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, 'mediaDevices', { value: {}, configurable: true });
      }
      navigator.mediaDevices.getUserMedia = async () => {
        w.__mock.asked.push('camera');
        if (w.__mock.camera === 'denied') throw new DOMException('Permission denied', 'NotAllowedError');
        if (w.__mock.camera === 'notfound') throw new DOMException('Requested device not found', 'NotFoundError');
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
        return typeof canvas.captureStream === 'function' ? canvas.captureStream(10) : new MediaStream();
      };
      navigator.mediaDevices.enumerateDevices = async () => [{ kind: 'videoinput' } as MediaDeviceInfo];
    }

    if (o.location) {
      const realWatch = navigator.geolocation.watchPosition.bind(navigator.geolocation);
      navigator.geolocation.watchPosition = (ok, err, opts) => {
        w.__mock.asked.push('geolocation');
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
        return realWatch(ok, err, opts);
      };
    }

    // Keep navigator.permissions consistent with the mocked outcomes, as in a real browser:
    // granted -> 'granted'; otherwise 'prompt', unless a test pins an explicit state (e.g. 'denied').
    if (navigator.permissions) {
      const realQuery = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = async (desc: PermissionDescriptor) => {
        const pinned = (w.__mock.permissionStates as Record<string, PermState | undefined>)[desc.name];
        const mode = desc.name === 'camera' ? w.__mock.camera : desc.name === 'geolocation' ? w.__mock.location : null;
        if (pinned || mode) {
          const state = pinned ?? (mode === 'granted' ? 'granted' : 'prompt');
          return { state, addEventListener() {}, removeEventListener() {} } as unknown as PermissionStatus;
        }
        return realQuery(desc);
      };
    }
  }, options);
}

/** Lets the page use the real Geolocation API (supported natively in all three engines). */
export async function grantLocation(context: BrowserContext) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(paris);
}

/** Stub reverse geocoding so tests never hit the network. */
export const mockGeocoder = (page: Page) =>
  page.route('**/nominatim.openstreetmap.org/**', route =>
    route.fulfill({ json: { display_name: 'Champ de Mars, Paris, France' } }),
  );

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
