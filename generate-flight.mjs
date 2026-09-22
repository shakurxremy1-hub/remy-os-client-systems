/**
 * generate-flight.mjs — chained-continuity flight generation.
 *
 * Scene 1: Flux Schnell still -> Kling image-to-video.
 * Scenes 2-6: motion-only continuation, each seeded from the literal last
 * frame of the previous scene's clip (extracted via ffmpeg, uploaded via
 * fal.storage.upload). Same jet/environment persists, no jump cuts.
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

const DURATION = '5'; // Kling v1.6 standard image-to-video only accepts '5' or '10', not '8'

const SCENES = [
  {
    id: 'scene1',
    image: `Photorealistic cinematic aerial shot of a sleek luxury private jet, long elegant white fuselage with subtle brushed-gold trim along the window line, cruising smoothly above a thick layer of golden-lit clouds at sunset. Warm dramatic light, shallow depth of field, 35mm lens look. No text, no visible logos, no people.`,
    motion: `Slow, smooth cinematic forward glide following the jet through soft cloud wisps, camera trailing slightly behind and to the side, gentle bank, no sudden moves, warm golden light.`,
  },
  {
    id: 'scene2',
    motion: `The jet continues its smooth forward descent, breaking through the last wisps of cloud. Below, the Manhattan skyline emerges through the haze at dusk, skyscraper lights beginning to twinkle, the river catching the last golden light. Camera continues gliding forward and downward with the jet, no sudden moves, cinematic.`,
  },
  {
    id: 'scene3',
    motion: `The jet glides low and smooth alongside the Manhattan skyline at dusk, banking gently toward one tall glass skyscraper rising above the others. City lights twinkle below, the river reflects the darkening sky. Camera continues following the jet in a smooth continuous bank, cinematic, no cuts.`,
  },
  {
    id: 'scene4',
    motion: `The jet continues its smooth forward flight, banking gently and descending toward the rooftop of the glass skyscraper ahead, approaching a private landing area on the tower's upper terrace. Smooth, continuous, physically realistic forward and downward glide - no spinning, no flipping, no erratic movement. Cinematic, warm dusk light.`,
  },
  {
    id: 'scene5',
    // Deliberately NOT chained from scene4 - a fresh still, cut to via crossfade in the
    // build step. Two failed attempts proved "jet lands on a residential terrace" is a
    // physically implausible continuous shot for the model (crash-into-spire, then a
    // giant jet crammed onto a tiny balcony). A clean transition here is correct, not a
    // fallback - real films/ads cut here too.
    image: `Photorealistic cinematic shot of an elegant rooftop penthouse terrace at dusk atop a glass skyscraper in Manhattan, marble tiles, soft warm ambient lighting, floor-to-ceiling glass doors open leading into a luxurious interior, the glittering city skyline and river visible beyond the terrace railing. No people, no text, no logos, no vehicles.`,
    motion: `Slow, smooth cinematic forward glide across the terrace toward the open glass doors, warm light spilling out, gentle camera movement, no sudden moves, cinematic.`,
  },
  {
    id: 'scene6',
    // Deliberately a fresh still too (not chained from scene5), cut to via crossfade.
    // The figure goes IN THE STILL this time - Kling motion-only prompts proved
    // unreliable at introducing a new person who wasn't in the seed image (two prior
    // attempts rendered an empty room despite the prompt asking for a figure). Flux
    // renders people into a still directly and far more reliably; Kling then only has
    // to animate camera + ambient motion around an already-composed scene.
    image: `Photorealistic cinematic interior shot of a luxurious penthouse living room at night: marble floors, a warm red patterned rug, a cream sofa and dark wood coffee table, floor-to-ceiling windows framing a glittering Manhattan skyline at dusk. A well-dressed man in a tailored dark suit stands facing the window, back partly to camera, backlit in silhouette against the city lights, calm and composed posture. Photorealistic, cinematic, warm ambient interior lighting, shallow depth of field, 35mm lens. No text, no logos.`,
    motion: `Slow, smooth cinematic forward push toward the window and the standing figure, the figure remains still and calm with only minimal natural motion, warm ambient light glimmers gently, no sudden moves, cinematic.`,
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
  console.log('\nDone. 6 chained clips written to src/scene1.mp4..scene6.mp4');
}

run().catch(err => { console.error('\nGeneration failed:', err.message || err); process.exit(1); });
