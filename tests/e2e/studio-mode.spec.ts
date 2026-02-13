import { test, expect } from '@playwright/test';

test.describe('Studio Mode (Dailies Engine)', () => {
  test.setTimeout(180000); // 3 minutes for the whole test

  test.beforeEach(async ({ page }) => {
    // Mock Google GenAI API calls
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const url = route.request().url();
      console.log(`MOCKING API CALL: ${url}`);
      
      if (url.includes('generateContent')) {
        if (url.includes('gemini-3-pro-preview')) {
          // Director Plan
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [{
                content: {
                  parts: [{
                    text: JSON.stringify({
                      subject_prompt: "A fluffy white cat named Belle",
                      environment_prompt: "A cozy kitchen",
                      visual_style: "Cinematic, soft lighting",
                      scenes: [
                        {
                          id: "scene-1",
                          order: 1,
                          duration_seconds: 3,
                          segments: [{ start_time: "00:00", end_time: "00:03", prompt: "Belle meowing", camera_movement: "Static" }],
                          master_prompt: "[00:00-00:03] Belle meowing at an empty bowl. (no subtitles)"
                        }
                      ],
                      reasoning: "Simple intro"
                    })
                  }]
                }
              }]
            })
          });
        } else if (url.includes('gemini-3-pro-image-preview')) {
          // Artist Turnaround or Refiner
          // Return a small transparent PNG as base64
          const base64Image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhAFGAKm64QAAAABJRU5ErkJggg==';
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              candidates: [{
                content: {
                  parts: [{ inlineData: { data: base64Image, mimeType: 'image/png' } }]
                }
              }]
            })
          });
        }
      } else if (url.includes('generateVideos') || url.includes('predictLongRunning') || url.includes('operations/')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            name: "operations/mock-op-123",
            done: true,
            response: {
              generateVideoResponse: {
                generatedSamples: [{ video: { uri: "http://localhost:3000/test/shot1.mp4" } }]
              }
            }
          })
        });
      } else {
        await route.continue();
      }
    });

    // A tiny valid MP4 file (1 second, black)
    const tinyMp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pbmYxbXA0MgADOG1vb3YAAABsbXZoZAAAAADDU7S4w1O0uAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAI0dHJhawAAAFx0a2hkAAAAAcNTtLjDU7S4AAAAAQAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAEAAAAAAhBtZGlhAAAAIG1kaGQAAAAAw1O0uMNTtLjAAAcIAAAH0ABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB521pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAdNzdGJsAAAAr3N0c2QAAAAAAAAAAQAAAJ9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAUABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAN/+EAFWdCwA3ZAsTsBEAAAPpAADqYAAH0gGisYhAALeX7mP8AAAACHGN0dHMAAAAAAAAAAQAAAAEAAAAAAQAAGHN0dHMAAAAAAAAAAQAAAAEAAAcIAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAAAAAAABAAAIHHN0Y28AAAAAAAAAAQAAADQ=';
    const tinyMp4 = Buffer.from(tinyMp4Base64, 'base64');

    // Mock the video file fetch
    await page.route('**/test/shot1.mp4', async (route) => {
      console.log(`MOCKING VIDEO FETCH: ${route.request().url()}`);
      await route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: tinyMp4,
      });
    });

    // Mock test assets
    await page.route('**/test/Belle.png', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from('mock image content'),
      });
    });

    await page.route('**/test/env.jpg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/jpeg',
        body: Buffer.from('mock image content'),
      });
    });

    await page.goto('/');
    
    // Handle API Key Dialog if it appears
    const continueBtn = page.locator('button:has-text("Continue to App")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
  });

  test('should complete the full dailies generation pipeline', async ({ page }) => {
    // Log console messages
    page.on('console', msg => {
      if (msg.type() === 'error') console.log(`PAGE ERROR: ${msg.text()}`);
    });

    // 1. Verify we are in Studio Mode (it's the default now)
    await expect(page.locator('h2')).toContainText('Veo Dailies');

    // 2. Use 'Test Set' button
    await page.click('button:has-text("Test Set")');
    
    // Wait for prompt to be filled (it's async due to fetch)
    const textarea = page.locator('textarea');
    await expect(textarea).not.toHaveValue('', { timeout: 10000 });
    
    const promptValue = await textarea.inputValue();
    expect(promptValue).toContain('cat food commercial');

    // 3. Click 'Generate Dailies'
    await page.click('button:has-text("Generate Dailies")');

    // 4. Wait for pipeline to complete
    // Wait for "Dailies are ready for review" log message
    // Increased timeout because of potential throttling in the app logic (waitForQuota)
    await expect(page.locator('text=Dailies are ready for review')).toBeVisible({ timeout: 60000 });

    // 5. Verify 'Production Complete' state
    await expect(page.locator('text=Production Complete')).toBeVisible();
    
    // 6. Check that generated assets (turnaround sheets) are visible
    await expect(page.locator('text=Production Bible')).toBeVisible();
    await expect(page.locator('img[alt="character"]').first()).toBeVisible();
    await expect(page.locator('img[alt="background"]').first()).toBeVisible();
    
    // 7. Check that video shots are generated
    // The mock plan has 1 scene, so we expect 1 video element
    const video = page.locator('video');
    await expect(video).toHaveCount(1);
    await expect(video).toBeVisible();
    
    // Verify it's a blob URL (meaning it was fetched and processed from our mock URI)
    const videoSrc = await video.getAttribute('src');
    expect(videoSrc).toMatch(/^blob:/);

    // 8. Setup download listener for stitching
    const downloadPromise = page.waitForEvent('download');

    // 9. Click 'Export Full Commercial' (Stitch)
    const exportBtn = page.locator('#export-btn');
    await expect(exportBtn).toBeVisible();
    await exportBtn.click();

    // 10. Verify download
    const download = await downloadPromise;
    const filename = download.suggestedFilename();
    expect(filename).toBe('veo-studio-production.mp4');
    
    // Clean up the download
    await download.delete();
  });
});
