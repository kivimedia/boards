import { SupabaseClient } from '@supabase/supabase-js';

export interface ExtractedFrame {
  timestamp: number;
  buffer: Buffer;
  storagePath: string;
}

/**
 * Extract key frames from a video file via Browserless.io.
 * Uses ffmpeg-style frame extraction through a serverless function approach.
 *
 * For MVP, we extract frames by taking screenshots of the video at specific timestamps
 * using the browser's built-in video player.
 */
export async function extractFramesFromVideo(
  supabase: SupabaseClient,
  videoStoragePath: string,
  cardId: string,
  options: {
    intervalSeconds?: number;
    maxFrames?: number;
    specificTimestamps?: number[];
  } = {}
): Promise<ExtractedFrame[]> {
  const { intervalSeconds = 5, maxFrames = 10, specificTimestamps } = options;

  // Get public URL for the video
  const { data: urlData } = supabase.storage
    .from('card-attachments')
    .getPublicUrl(videoStoragePath);

  const videoUrl = urlData.publicUrl;

  const browserlessKey = process.env.BROWSERLESS_API_KEY;
  if (!browserlessKey) {
    throw new Error('BROWSERLESS_API_KEY not configured');
  }

  // Use Browserless function to load video in browser and capture frames
  const timestamps = specificTimestamps || generateTimestamps(intervalSeconds, maxFrames);

  const frames: ExtractedFrame[] = [];

  for (const timestamp of timestamps) {
    try {
      const response = await fetch(
        `https://chrome.browserless.io/screenshot?token=${browserlessKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            html: `
              <html>
              <body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;">
                <video id="vid" src="${videoUrl}" style="max-width:100%;max-height:100%;" muted preload="auto"></video>
                <script>
                  const vid = document.getElementById('vid');
                  vid.currentTime = ${timestamp};
                  vid.addEventListener('seeked', () => {
                    document.title = 'ready';
                  });
                </script>
              </body>
              </html>
            `,
            options: { fullPage: false, type: 'png' },
            viewport: { width: 1920, height: 1080 },
            waitFor: 5000,
          }),
        }
      );

      if (!response.ok) continue;

      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) continue;

      // Upload frame to storage
      const storagePath = `video-frames/${cardId}/${timestamp}s.png`;
      const { error } = await supabase.storage
        .from('card-attachments')
        .upload(storagePath, buffer, { contentType: 'image/png', upsert: true });

      if (!error) {
        frames.push({ timestamp, buffer, storagePath });
      }
    } catch (err) {
      console.error(`[VideoFrameExtractor] Failed at ${timestamp}s:`, err);
    }
  }

  return frames;
}

export function generateTimestamps(intervalSeconds: number, maxFrames: number): number[] {
  const timestamps: number[] = [];
  for (let i = 0; i < maxFrames; i++) {
    timestamps.push(i * intervalSeconds);
  }
  return timestamps;
}
