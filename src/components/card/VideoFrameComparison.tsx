'use client';

import { useState } from 'react';
import type { FrameVerdict } from '@/lib/ai/design-review';

interface VideoFrameComparisonProps {
  frameVerdicts: FrameVerdict[];
  thumbnailSuggestion?: string;
  videoDuration?: number;
}

const verdictColors = {
  PASS: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  FAIL: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  PARTIAL: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  'N/A': 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-700',
};

const verdictIcons = {
  PASS: '✓',
  FAIL: '✗',
  PARTIAL: '~',
  'N/A': '-',
};

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VideoFrameComparison({
  frameVerdicts,
  thumbnailSuggestion,
  videoDuration,
}: VideoFrameComparisonProps) {
  const [selectedFrame, setSelectedFrame] = useState<number>(0);

  if (frameVerdicts.length === 0) {
    return (
      <div className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
        No frame analysis available
      </div>
    );
  }

  const currentFrame = frameVerdicts[selectedFrame];
  const totalDuration = videoDuration ?? (frameVerdicts[frameVerdicts.length - 1]?.timestamp ?? 0);

  return (
    <div className="space-y-4">
      {/* Timeline scrubber */}
      <div className="relative">
        <div className="h-8 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden flex items-center px-2">
          {frameVerdicts.map((fv, idx) => {
            const position = totalDuration > 0
              ? (fv.timestamp / totalDuration) * 100
              : (idx / Math.max(frameVerdicts.length - 1, 1)) * 100;
            const isSelected = idx === selectedFrame;
            const color = fv.overallQuality === 'PASS'
              ? 'bg-green-500'
              : fv.overallQuality === 'FAIL'
              ? 'bg-red-500'
              : 'bg-yellow-500';

            return (
              <button
                key={idx}
                onClick={() => setSelectedFrame(idx)}
                className={`absolute w-4 h-4 rounded-full border-2 transition-transform ${color} ${
                  isSelected
                    ? 'border-white dark:border-gray-200 scale-125 ring-2 ring-indigo-400'
                    : 'border-gray-300 dark:border-gray-600 hover:scale-110'
                }`}
                style={{ left: `${Math.min(Math.max(position, 5), 95)}%` }}
                title={`Frame at ${formatTimestamp(fv.timestamp)}`}
              />
            );
          })}
        </div>
        <div className="flex justify-between text-xs text-gray-400 dark:text-gray-500 mt-1 px-1">
          <span>0:00</span>
          <span>{formatTimestamp(totalDuration)}</span>
        </div>
      </div>

      {/* Selected frame details */}
      {currentFrame && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
              Frame {selectedFrame + 1} at {formatTimestamp(currentFrame.timestamp)}
            </h4>
            <div className="flex gap-1">
              <button
                onClick={() => setSelectedFrame(Math.max(0, selectedFrame - 1))}
                disabled={selectedFrame === 0}
                className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-30"
              >
                ← Prev
              </button>
              <button
                onClick={() => setSelectedFrame(Math.min(frameVerdicts.length - 1, selectedFrame + 1))}
                disabled={selectedFrame === frameVerdicts.length - 1}
                className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className={`text-center px-2 py-1.5 rounded border ${verdictColors[currentFrame.brandConsistency]}`}>
              <div className="text-xs opacity-75">Brand</div>
              <div className="text-sm font-medium">
                {verdictIcons[currentFrame.brandConsistency]} {currentFrame.brandConsistency}
              </div>
            </div>
            <div className={`text-center px-2 py-1.5 rounded border ${verdictColors[currentFrame.textReadability]}`}>
              <div className="text-xs opacity-75">Text</div>
              <div className="text-sm font-medium">
                {verdictIcons[currentFrame.textReadability]} {currentFrame.textReadability}
              </div>
            </div>
            <div className={`text-center px-2 py-1.5 rounded border ${verdictColors[currentFrame.overallQuality]}`}>
              <div className="text-xs opacity-75">Quality</div>
              <div className="text-sm font-medium">
                {verdictIcons[currentFrame.overallQuality]} {currentFrame.overallQuality}
              </div>
            </div>
          </div>

          {currentFrame.notes && (
            <p className="text-xs text-gray-600 dark:text-gray-400">{currentFrame.notes}</p>
          )}
        </div>
      )}

      {/* Thumbnail suggestion */}
      {thumbnailSuggestion && (
        <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-3 border border-indigo-200 dark:border-indigo-800">
          <div className="text-xs font-medium text-indigo-700 dark:text-indigo-300 mb-1">
            Thumbnail Suggestion
          </div>
          <p className="text-xs text-indigo-600 dark:text-indigo-400">
            {thumbnailSuggestion}
          </p>
        </div>
      )}
    </div>
  );
}
