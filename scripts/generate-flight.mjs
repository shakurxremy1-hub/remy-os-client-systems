/**
 * generate-flight.mjs
 * New flythrough narrative: a private jet's arrival — clouds -> golden-hour
 * breakthrough -> taxi with light trails -> the operator disembarks -> the
 * luxury building lobby -> inside the penthouse boardroom overlooking the
 * same golden skyline the old flythrough showed from outside.
 *
 * Flux Schnell still -> Kling v1.6 image-to-video, one 5s clip per scene,
 * written to src/sN.mp4 for build-flight-frames.sh to concatenate + extract.
 *
 * Run: FAL_KEY=your-key node scripts/generate-flight.mjs
 */
import { fal } from '@fal-ai/client';
import { writeFileSync, mkdirSync } from 'fs';

if (!process.env.FAL_KEY) {
  console.error('FAL_KEY required. export FAL_KEY=your-key');
  process.exit(1);
}

fal.config({ credentials: process.env.FAL_KEY });
mkdirSync('./src', { recursive: true });

const SCENES = [
  {
    id: 's1',
    name: 'Invisible',
    image: `
Wide aerial shot of a sleek matte-charcoal private jet cruising alone above a
thick layer of dim grey-blue clouds at dawn, half-obscured by mist, distant
and small in frame, flat muted light, understated and quiet. Photorealistic
cinematic editorial photography, 35mm lens, shallow depth of field. No text,
no logos, no people, no readable typography.
    `.trim(),
    motion: `
Slow steady forward glide through thin cloud wisps, gentle drift, subdued
light, no sudden moves, stable camera, 5 seconds.
    `.trim(),
  },
  {
    id: 's2',
    name: 'The System',
    image: `
The same sleek dark private jet breaking through a cloud layer into warm
golden-hour light above, sunlight glinting off the fuselage, clouds parting
below like a stage curtain, dramatic cinematic light, warm amber sunlight
meeting cool blue shadow on the aircraft's underside. Photorealistic, 35mm
lens, shallow depth of field. No text, no logos, no people.
    `.trim(),
    motion: `
Slow push-in as the jet breaks through the clouds into golden light, gentle
bank to one side, stable cinematic camera, 5 seconds.
    `.trim(),
  },
  {
    id: 's3',
    name: 'Paid Traffic',
    image: `
Low wide-angle shot of the same private jet taxiing on a private airstrip at
dusk, runway edge lights streaking past as long warm-gold light trails
(slow-shutter effect), motion energy, a city skyline glowing softly in the
distant background. Photorealistic cinematic photography. No text, no logos,
no people.
    `.trim(),
    motion: `
Smooth tracking shot alongside the taxiing jet, runway lights streaking past,
controlled forward motion, stable camera, 5 seconds.
    `.trim(),
  },
  {
    id: 's4',
    name: 'Lender-Ready',
    image: `
Wide shot of the jet stopped on tarmac at golden hour, airstair lowered, a
confident Black businessman in a tailored charcoal suit walking down the
stairs carrying a slim leather portfolio, warm golden backlight rim-lighting
his silhouette, a matte-black luxury SUV waiting nearby. Photorealistic,
cinematic, shallow depth of field. No text, no logos, face not clearly
visible/turned away or in silhouette.
    `.trim(),
    motion: `
Slow push-in following him down the airstair toward the car, smooth stable
camera, warm golden backlight, 5 seconds.
    `.trim(),
  },
  {
    id: 's5',
    name: 'Funded',
    image: `
The same man walking through the grand entrance of a modern luxury building —
tall bronze-framed glass doors opening into a warm-lit marble and brass
lobby, golden interior light spilling onto the dusk exterior, architectural
and premium. Photorealistic cinematic photography. No text, no logos, face
not clearly visible.
    `.trim(),
    motion: `
Slow push forward through the doorway into the warm-lit lobby, stable
cinematic dolly-in, 5 seconds.
    `.trim(),
  },
  {
    id: 's6',
    name: 'Scale',
    image: `
Interior wide shot from inside a luxury penthouse boardroom at night:
floor-to-ceiling windows framing a glittering golden-lit city skyline beyond,
a polished dark-wood table in the foreground catching warm brass light,
empty and grand, aspirational, no people. Photorealistic cinematic
photography.
    `.trim(),
    motion: `
Slow forward glide toward the window, city lights shimmering, stable
cinematic camera, gentle parallax, 5 seconds.
    `.trim(),
  },
];

async function generateStill(scene) {
  console.log(`\n[${scene.id}] 1/2 — still via Flux Schnell...`);
  const result = await fal.subscribe('fal-ai/flux/schnell', {
    input: {
      prompt: scene.image,
      image_size: 'landscape_16_9',
      num_inference_steps: 4,
      num_images: 1,
    },
    logs: true,
    onQueueUpdate(u) { if (u.status === 'IN_PROGRESS') process.stdout.write('.'); }
  });
  const imageUrl = result.data?.images?.[0]?.url;
  if (!imageUrl) throw new Error(`[${scene.id}] no image URL: ` + JSON.stringify(result));
  const res = await fetch(imageUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`./src/${scene.id}-still.jpg`, buf);
  console.log(`\n  saved src/${scene.id}-still.jpg`);
  return imageUrl;
}

async function generateVideo(scene, imageUrl) {
  console.log(`[${scene.id}] 2/2 — animating with Kling v1.6...`);
  const result = await fal.subscribe('fal-ai/kling-video/v1.6/standard/image-to-video', {
    input: {
      prompt: scene.motion,
      image_url: imageUrl,
      duration: '5',
      aspect_ratio: '16:9',
      cfg_scale: 0.5,
    },
    logs: true,
    onQueueUpdate(u) {
      if (u.status === 'IN_PROGRESS') {
        const msg = u.logs?.map(l => l.message).join(' | ') || '...';
        process.stdout.write('\r  ' + msg.substring(0, 60).padEnd(60));
      }
    }
  });
  const videoUrl = result.data?.video?.url;
  if (!videoUrl) throw new Error(`[${scene.id}] no video URL: ` + JSON.stringify(result));
  const res = await fetch(videoUrl);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(`./src/${scene.id}.mp4`, buf);
  console.log(`\n  saved src/${scene.id}.mp4`);
}

async function runScene(scene, attempt = 1) {
  try {
    const imageUrl = await generateStill(scene);
    await generateVideo(scene, imageUrl);
    return true;
  } catch (err) {
    console.error(`\n[${scene.id}] attempt ${attempt} failed:`, err.message || err);
    if (attempt < 3) {
      console.log(`[${scene.id}] retrying (${attempt + 1}/3)...`);
      return runScene(scene, attempt + 1);
    }
    return false;
  }
}

const failed = [];
for (const scene of SCENES) {
  const ok = await runScene(scene);
  if (!ok) failed.push(scene.id);
}

console.log(`\n${'='.repeat(60)}`);
if (failed.length) {
  console.log(`DONE WITH FAILURES: ${SCENES.length - failed.length}/${SCENES.length} succeeded. Failed: ${failed.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log(`✓ All ${SCENES.length} scenes generated: src/s1.mp4 .. src/s6.mp4`);
  console.log('Next: run ./scripts/build-flight-frames.sh');
}
