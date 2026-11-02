/**
 * generate-flight.mjs — converging-city flythrough (Option A).
 *
 * A pure camera flythrough, no filmed "vehicle" subject at all - lesson from
 * two prior failed attempts (jet crashing into a spire, jet crammed onto a
 * balcony): image-to-video chaining is unreliable whenever a rigid foreground
 * object needs to keep consistent physics while interacting with something
 * (landing, entering a building). A camera moving through open space has no
 * such constraint, so the whole thing is designed to be ONE continuous chain,
 * start to finish, matching the site's own six-beat copy narrative:
 *
 *   Invisible -> hazy, scattered, low city, hard to see
 *   The System -> haze clears, one light trail appears
 *   Paid Traffic -> trails multiply, start converging
 *   Lender-Ready -> all trails funnel toward one glowing tower
 *   Funded -> camera arcs up the tower's facade
 *   Scale -> glides through a lit window into an office, full skyline view
 *
 * Scene 1: Flux Schnell still -> Kling image-to-video.
 * Scenes 2-6: motion-only continuation, each seeded from the literal last
 * frame of the previous scene's clip (ffmpeg extract -> fal.storage.upload).
 *
 * The ext->int move in scene 6 (flying through a window into an office) is
 * the one point with any resemblance to the prior failure category, so it's
 * verified extra carefully (see the caller's frame-by-frame check) - if it
 * breaks, the fallback is a fresh independent still + crossfade, same fix
 * used for the penthouse shot before.
 *
 * Run: node generate-flight.mjs
 */
import { fal } from '@fal-ai/client';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { execSync } from 'child_process';

if (!process.env.FAL_KEY) {
  console.error('FAL_KEY required. export FAL_KEY=your-key');
  process.exit(1);
}
fal.config({ credentials: process.env.FAL_KEY });
mkdirSync('./src', { recursive: true });

const DURATION = '5';

const SCENES = [
  {
    id: 'scene1',
    image: `Photorealistic cinematic aerial drone shot low over a dim, hazy city at night, scattered building lights, quiet streets, muted low-contrast lighting, a slight fog suggesting obscurity and stillness, camera close to rooftop height. No text, no logos, no people, no vehicles in close view.`,
    motion: `Slow but building forward glide low over the hazy rooftops, thin atmospheric haze drifting past the camera, gradually gaining speed and altitude as it goes, continuous smooth forward momentum throughout, cinematic, no static moments.`,
  },
  {
    id: 'scene2',
    motion: `The camera continues accelerating forward and rising slightly higher, the haze clearing as the city comes into sharper focus below, a single glowing light trail appears tracing along a road and begins to flow and pulse with motion. Continuous forward momentum, speed steadily increasing, cinematic, no pause.`,
  },
  {
    id: 'scene3',
    motion: `The camera flies fast and low across the city as several more glowing light trails appear on different roads and begin curving toward each other, converging like a network, strong forward speed with heavy parallax as buildings pass below. Continuous unbroken momentum, cinematic, no pause.`,
  },
  {
    id: 'scene4',
    motion: `The camera continues its fast forward flight as all the converging light trails funnel directly toward one tall glowing skyscraper rising ahead of every other building, the tower growing rapidly larger and brighter in frame as the camera closes in. Continuous forward speed the entire time, cinematic, no pause.`,
  },
  {
    id: 'scene5',
    motion: `The camera arcs smoothly upward alongside the glowing skyscraper's glass facade, the city and its converging light trails falling away below, continuous unbroken forward-and-upward motion, rising fast toward a large lit window near the top of the tower. No sudden stops, cinematic.`,
  },
  {
    id: 'scene6',
    motion: `The camera glides smoothly through the large lit window into a modern glass-walled office interior, warm ambient lighting, floor-to-ceiling windows revealing the full glittering city skyline and the converging light trails far below. Continuous forward glide the entire time, no sudden stops, cinematic.`,
  },
];

async function generateStill(prompt) {
  console.log('  1/2 - still via Flux Schnell...');
  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: { prompt, image_size: 'landscape_16_9', num_inference_steps: 4, num_images: 1 },
    logs: true,
    onQueueUpdate(u) { if (u.status === 'IN_PROGRESS') process.stdout.write('.'); },
  });
  const url = result.data?.images?.[0]?.url;
  if (!url) throw new Error('no image URL: ' + JSON.stringify(result));
  return url;
}

async function generateVideo(id, motion, imageUrl) {
  console.log(`  2/2 - animating ${id} with Kling v1.6 (duration ${DURATION}s)...`);
  const result = await fal.subscribe('fal-ai/kling-video/v1.6/standard/image-to-video', {
    input: { prompt: motion, image_url: imageUrl, duration: DURATION, aspect_ratio: '16:9', cfg_scale: 0.5 },
    logs: true,
    onQueueUpdate(u) {
      if (u.status === 'IN_PROGRESS') {
        const msg = u.logs?.map(l => l.message).join(' | ') || '...';
        process.stdout.write('\r  ' + msg.substring(0, 60).padEnd(60));
      }
    },
  });
  const videoUrl = result.data?.video?.url;
  if (!videoUrl) throw new Error(`[${id}] no video URL: ` + JSON.stringify(result));
  const buf = Buffer.from(await (await fetch(videoUrl)).arrayBuffer());
  writeFileSync(`./src/${id}.mp4`, buf);
  console.log(`\n  saved src/${id}.mp4`);
}

function extractLastFrame(id) {
  const out = `./src/${id}-last.jpg`;
  execSync(`ffmpeg -v error -sseof -0.15 -i ./src/${id}.mp4 -frames:v 1 -y ${out}`);
  return out;
}

async function uploadFrame(path) {
  const buf = await import('fs').then(fs => fs.readFileSync(path));
  const blob = new Blob([buf], { type: 'image/jpeg' });
  return await fal.storage.upload(blob);
}

async function run() {
  let seedUrl = null;
  for (const scene of SCENES) {
    console.log(`\n[${scene.id}]`);
    const clipPath = `./src/${scene.id}.mp4`;
    if (existsSync(clipPath)) {
      console.log(`  already generated, skipping (resume mode) - reusing for continuity`);
    } else {
      if (scene.image) {
        seedUrl = await generateStill(scene.image);
      }
      if (!seedUrl) throw new Error(`[${scene.id}] no seed image available - can't resume past a gap`);
      await generateVideo(scene.id, scene.motion, seedUrl);
    }
    const lastFramePath = extractLastFrame(scene.id);
    seedUrl = await uploadFrame(lastFramePath);
    console.log(`  last frame uploaded: ${seedUrl}`);
  }
  console.log('\nDone. Chained clips written to src/scene1.mp4..scene6.mp4');
}

run().catch(err => { console.error('\nGeneration failed:', err.message || err); process.exit(1); });
