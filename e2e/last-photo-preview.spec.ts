/** The camera's bottom-left button previews the newest photo, and the gallery says where the photos are kept. */
import { test, expect } from './fixtures';
import { setUpGrantedCamera, takePhotos } from './helpers';

test('the gallery button shows the newest photo after a capture and opens the gallery', async ({ page, context }) => {
  await setUpGrantedCamera(page, context);
  const open = page.getByRole('button', { name: 'Open gallery' });
  await expect(open.locator('img')).toHaveCount(0); // nothing taken yet: the plain gallery icon

  await takePhotos(page, 1);
  await expect(open.locator('img')).toHaveCount(1);
  await expect(open.locator('img')).toHaveAttribute('src', /^data:image\//);

  await open.click();
  await expect(page.getByRole('heading', { name: 'Gallery', level: 1 })).toBeVisible();
});

test('the gallery explains that photos are kept inside SpotCam and how to export them', async ({ page, context }) => {
  await setUpGrantedCamera(page, context);
  await takePhotos(page, 1);
  await page.getByRole('button', { name: 'Open gallery' }).click();
  await expect(page.getByTestId('gallery-storage-note')).toContainText('not in your phone');
  await expect(page.getByTestId('gallery-storage-note')).toContainText('Share');
});
