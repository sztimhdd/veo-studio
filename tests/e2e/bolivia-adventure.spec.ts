import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Bolivia Adventure E2E Test', () => {
  test.setTimeout(180000); // 3 minutes

  test.beforeEach(async ({ page }) => {
    // Mock Google GenAI API calls
    await page.route('**/generativelanguage.googleapis.com/**', async (route) => {
      const url = route.request().url();
      
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
                      subject_prompt: "Belle, a fluffy Ragdoll cat with cream and brown fur, pointed ears, blue eyes, and a curious expression.",
                      environment_prompt: "Salar de Uyuni salt flats in Bolivia at sunset, mirror-like reflections, fiery horizon.",
                      visual_style: "High-quality CGI, vibrant colors, realistic textures, dynamic lighting.",
                      scenes: [
                        {
                          id: "scene-1",
                          order: 1,
                          duration_seconds: 5,
                          segments: [{ start_time: "00:00", end_time: "00:05", prompt: "Wide shot of Belle arriving on the flats, looking awe-struck, pawing at reflection.", camera_movement: "Wide" }],
                          master_prompt: "[00:00-00:05] Belle arriving on the salt flats at sunset, weary but awe-struck."
                        },
                        {
                          id: "scene-2",
                          order: 2,
                          duration_seconds: 5,
                          segments: [{ start_time: "00:05", end_time: "00:10", prompt: "Tracking shot Belle spots a picnic setup with cat treats and map, ears perking up.", camera_movement: "Tracking" }],
                          master_prompt: "[00:05-00:10] Belle spotting a picnic setup on the reflective flats."
                        },
                        {
                          id: "scene-3",
                          order: 3,
                          duration_seconds: 8,
                          segments: [{ start_time: "00:10", end_time: "00:18", prompt: "Montage Belle exploring, chasing reflections, posing by salt mounds.", camera_movement: "Various" }],
                          master_prompt: "[00:10-00:18] Belle exploring the magical salt flats with sparkles and paw prints."
                        },
                        {
                          id: "scene-4",
                          order: 4,
                          duration_seconds: 2,
                          segments: [{ start_time: "00:18", end_time: "00:20", prompt: "Fade to text overlay 'Belle's Bolivia Adventure'.", camera_movement: "Static" }],
                          master_prompt: "[00:18-00:20] Final text overlay: Belle's Bolivia Adventure with [Agency]."
                        }
                      ],
                      reasoning: "Following the user's detailed timeline breakdown."
                    })
                  }]
                }
              }]
            })
          });
        } else if (url.includes('gemini-3-pro-image-preview')) {
          // Artist or Refiner
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
                generatedSamples: [{ video: { uri: "http://localhost:3000/test/bolivia-shot.mp4" } }]
              }
            }
          })
        });
      } else {
        await route.continue();
      }
    });

    // Mock video file fetch
    const tinyMp4Base64 = 'AAAAIGZ0eXBpc29tAAACAGlzb21pbmYxbXA0MgADOG1vb3YAAABsbXZoZAAAAADDU7S4w1O0uAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAI0dHJhawAAAFx0a2hkAAAAAcNTtLjDU7S4AAAAAQAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAUAAAAEAAAAAAhBtZGlhAAAAIG1kaGQAAAAAw1O0uMNTtLjAAAcIAAAH0ABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB521pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAdNzdGJsAAAAr3N0c2QAAAAAAAAAAQAAAJ9hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAUAAUABIAAAASAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAN/+EAFWdCwA3ZAsTsBEAAAPpAADqYAAH0gGisYhAALeX7mP8AAAACHGN0dHMAAAAAAAAAAQAAAAEAAAAAAQAAGHN0dHMAAAAAAAAAAQAAAAEAAAcIAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAABAAAAAQAAABRzdHN6AAAAAAAAAAAAAAABAAAIHHN0Y28AAAAAAAAAAQAAADQ=';
    await page.route('**/test/bolivia-shot.mp4', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'video/mp4',
        body: Buffer.from(tinyMp4Base64, 'base64'),
      });
    });

    await page.goto('/');
    
    // Handle API Key Dialog
    const continueBtn = page.locator('button:has-text("Continue to App")');
    if (await continueBtn.isVisible()) {
      await continueBtn.click();
    }
  });

  test('should generate Bolivia adventure commercial with user assets', async ({ page }) => {
    // 1. Fill prompt
    const prompt = `Create a 20-second animated cat travel agency commercial in high-quality CGI style with vibrant colors, realistic textures, dynamic lighting, and fluid animal animations. The main character is a fluffy Ragdoll cat named Belle, with cream and brown fur, pointed ears, blue eyes, and a curious expression. Set on the mirror-like salt flats of Salar de Uyuni, Bolivia, at sunset, with endless reflections, a fiery horizon, and scattered salt crystals for a magical, otherworldly feel.
Timeline breakdown:

0-5 seconds: Wide shot of Belle arriving on the flats, looking awe-struck but weary from travel, pawing at her reflection in the shallow water. Golden sunlight bathes the scene; soft wind effects ripple the surface.
5-10 seconds: Tracking shot as Belle spots a picnic setup with cat treats and a travel map, her ears perking up. Use glowing highlights on the reflective flats to emphasize vast beauty.
10-18 seconds: Montage of Belle exploring energetically—chasing reflections, posing by salt mounds, and gazing at the sunset. Add playful particle effects for salt sparkles and paw prints.
18-20 seconds: Fade to text overlay in whimsical font: 'Belle\'s Bolivia Adventure with [Agency] – Purrfect Getaways!' with a cat paw icon.

Audio: Upbeat adventure tune with pan flutes and light percussion; include meows, crunching sounds, and wind whispers. Ensure 4K resolution, seamless transitions, and emotional shift from arrival to delight for engaging pet travel promotion.`;

    await page.fill('textarea', prompt);

    // 2. Upload Character Ref
    const characterFile = path.resolve(process.cwd(), 'public/test/Belle.png');
    // We have two inputs, the first one is Character Ref
    const charInput = page.locator('input[type="file"]').first();
    await charInput.setInputFiles(characterFile);

    // 3. Upload Location Ref
    const locationFile = path.resolve(process.cwd(), 'public/test/bolivia-coast.jpg');
    // The second one is Location Ref
    const locInput = page.locator('input[type="file"]').nth(1);
    await locInput.setInputFiles(locationFile);

    // 4. Click Generate Dailies
    await page.click('button:has-text("Generate Dailies")');

    // 5. Wait for pipeline completion
    await expect(page.locator('text=Dailies are ready for review')).toBeVisible({ timeout: 120000 });

    // 6. Verify outputs
    await expect(page.locator('text=Production Complete')).toBeVisible();
    
    // We expect 4 scenes based on the timeline breakdown
    const videos = page.locator('video');
    await expect(videos).toHaveCount(4);
    
    // Verify specific scene descriptions in the UI if possible
    // (Assuming PipelineVisualizer shows scene info)
    await expect(page.locator('text=Scene 1')).toBeVisible();
    await expect(page.locator('text=Scene 2')).toBeVisible();
    await expect(page.locator('text=Scene 3')).toBeVisible();
    await expect(page.locator('text=Scene 4')).toBeVisible();

    console.log('Bolivia Adventure E2E test passed successfully!');
  });
});
