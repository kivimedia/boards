import { useTheme } from './useTheme';

/**
 * Returns chart-appropriate colors that adapt to light/dark mode.
 * Use these instead of hardcoded hex values in SVG charts.
 */
export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  return {
    // Primary accent color (electric/indigo)
    primary: isDark ? '#818cf8' : '#6366f1',       // indigo-400 / indigo-500
    primaryFill: isDark ? '#818cf820' : '#6366f108', // with alpha

    // Grid lines
    grid: isDark ? '#334155' : '#e2e8f0',           // slate-700 / slate-200

    // Ideal/secondary line
    secondary: isDark ? '#94a3b8' : '#0f172a',      // slate-400 / slate-900

    // Axis text
    axisText: isDark ? '#64748b' : '#94a3b8',       // slate-500 / slate-400

    // Data point fill
    pointFill: isDark ? '#1e293b' : '#ffffff',       // slate-800 / white

    // Success / error bar colors
    success: isDark ? '#818cf8' : '#6366f1',
    error: isDark ? '#fca5a5' : '#fca5a5',          // red-300 both

    // Gradient stops
    gradientStart: isDark ? '#818cf8' : '#6366f1',
    gradientStartOpacity: isDark ? '0.20' : '0.15',
    gradientEndOpacity: '0.02',

    // Priority colors (unchanged in both modes)
    urgent: '#ef4444',
    high: '#fb923c',
    medium: '#facc15',
    low: '#4ade80',

    // Dependency lines
    depLine: isDark ? '#818cf8' : '#6366f1',
  };
}
