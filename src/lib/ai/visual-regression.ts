import { SupabaseClient } from '@supabase/supabase-js';

export interface RegressionResult {
  viewport: string;
  baselinePath: string;
  currentPath: string;
  diffPath: string | null;
  mismatchPercentage: number;
  flagged: boolean;
}

export interface RegressionReport {
  results: RegressionResult[];
  hasRegression: boolean;
  summary: string;
}

/**
 * Get existing baselines for a card/URL combination.
 */
export async function getBaselines(
  supabase: SupabaseClient,
  cardId: string,
  url: string
): Promise<{ viewport: string; screenshot_path: string }[]> {
  const { data } = await supabase
    .from('qa_baselines')
    .select('viewport, screenshot_path')
    .eq('card_id', cardId)
    .eq('url', url);

  return data ?? [];
}

/**
 * Set screenshots as the new baseline for a card/URL.
 */
export async function setBaselines(
  supabase: SupabaseClient,
  cardId: string,
  url: string,
  screenshots: { viewport: string; storagePath: string }[],
  userId: string
): Promise<void> {
  for (const s of screenshots) {
    await supabase
      .from('qa_baselines')
      .upsert(
        {
          card_id: cardId,
          url,
          viewport: s.viewport,
          screenshot_path: s.storagePath,
          approved_by: userId,
          approved_at: new Date().toISOString(),
        },
        { onConflict: 'card_id,url,viewport' }
      );
  }
}

/**
 * Compare current QA screenshots against baselines using pixelmatch.
 * Returns regression results per viewport.
 */
export async function runVisualRegression(
  supabase: SupabaseClient,
  cardId: string,
  url: string,
  currentScreenshots: { viewport: string; storage_path: string }[],
  threshold: number = 5
): Promise<RegressionReport> {
  const baselines = await getBaselines(supabase, cardId, url);

  if (baselines.length === 0) {
    return {
      results: [],
      hasRegression: false,
      summary: 'No baselines set. Run QA and set results as baseline to enable regression testing.',
    };
  }

  // Dynamic import since pixelmatch is ESM
  const { PNG } = await import('pngjs');
  const pixelmatch = (await import('pixelmatch')).default;

  const results: RegressionResult[] = [];

  for (const current of currentScreenshots) {
    const baseline = baselines.find((b) => b.viewport === current.viewport);
    if (!baseline) continue;

    // Download both images
    const [baselineData, currentData] = await Promise.all([
      supabase.storage.from('card-attachments').download(baseline.screenshot_path),
      supabase.storage.from('card-attachments').download(current.storage_path),
    ]);

    if (baselineData.error || currentData.error || !baselineData.data || !currentData.data) {
      continue;
    }

    try {
      const baselineBuf = Buffer.from(await baselineData.data.arrayBuffer());
      const currentBuf = Buffer.from(await currentData.data.arrayBuffer());

      const img1 = PNG.sync.read(baselineBuf);
      const img2 = PNG.sync.read(currentBuf);

      const width = Math.max(img1.width, img2.width);
      const height = Math.max(img1.height, img2.height);

      const canvas1 = new PNG({ width, height });
      const canvas2 = new PNG({ width, height });
      const diffCanvas = new PNG({ width, height });

      PNG.bitblt(img1, canvas1, 0, 0, img1.width, img1.height, 0, 0);
      PNG.bitblt(img2, canvas2, 0, 0, img2.width, img2.height, 0, 0);

      const numDiff = pixelmatch(canvas1.data, canvas2.data, diffCanvas.data, width, height, { threshold: 0.1 });
      const mismatchPercentage = Math.round((numDiff / (width * height)) * 10000) / 100;

      let diffPath: string | null = null;

      if (mismatchPercentage > 0) {
        const diffBuffer = PNG.sync.write(diffCanvas);
        const storageDiffPath = `regression/${cardId}/${current.viewport}_diff.png`;
        const { error: uploadError } = await supabase.storage
          .from('card-attachments')
          .upload(storageDiffPath, diffBuffer, { contentType: 'image/png', upsert: true });

        if (!uploadError) diffPath = storageDiffPath;
      }

      results.push({
        viewport: current.viewport,
        baselinePath: baseline.screenshot_path,
        currentPath: current.storage_path,
        diffPath,
        mismatchPercentage,
        flagged: mismatchPercentage > threshold,
      });
    } catch {
      // Skip viewports that fail comparison
    }
  }

  const hasRegression = results.some((r) => r.flagged);
  const flaggedViewports = results.filter((r) => r.flagged).map((r) => r.viewport);

  const summary = hasRegression
    ? `Visual regression detected in ${flaggedViewports.join(', ')}. Review changes and update baseline if intentional.`
    : results.length > 0
    ? 'No visual regressions detected. All viewports match baseline.'
    : 'No baselines available for comparison.';

  return { results, hasRegression, summary };
}
