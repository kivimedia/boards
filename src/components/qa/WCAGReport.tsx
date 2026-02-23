'use client';

import { useState } from 'react';
import type { WCAGReport as WCAGReportType, WCAGCriterion } from '@/lib/types';

interface Props {
  report: WCAGReportType;
}

const PRINCIPLE_LABELS: Record<string, string> = {
  perceivable: 'Perceivable',
  operable: 'Operable',
  understandable: 'Understandable',
  robust: 'Robust',
};

const PRINCIPLE_DESCRIPTIONS: Record<string, string> = {
  perceivable: 'Information and UI components must be presentable in ways users can perceive',
  operable: 'UI components and navigation must be operable by all users',
  understandable: 'Information and UI operation must be understandable',
  robust: 'Content must be robust enough to be interpreted by assistive technologies',
};

function complianceColor(percentage: number): string {
  if (percentage >= 90) return 'text-green-600 dark:text-green-400';
  if (percentage >= 70) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function complianceBg(percentage: number): string {
  if (percentage >= 90) return 'bg-green-100 dark:bg-green-900/30';
  if (percentage >= 70) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function impactBadge(level: string): string {
  switch (level) {
    case 'A': return 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300';
    case 'AA': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300';
    case 'AAA': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300';
    default: return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
  }
}

export default function WCAGReportView({ report }: Props) {
  const [expandedPrinciple, setExpandedPrinciple] = useState<string | null>(null);

  const principleEntries = Object.entries(report.principles) as Array<
    [string, { passed: number; failed: number; total: number }]
  >;

  return (
    <div className="space-y-4">
      {/* Overall Compliance */}
      <div className={`rounded-lg p-4 ${complianceBg(report.compliancePercentage)}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              WCAG 2.1 AA Compliance
            </h3>
            <p className={`text-3xl font-bold ${complianceColor(report.compliancePercentage)}`}>
              {report.compliancePercentage}%
            </p>
          </div>
          <div className="text-right text-sm text-gray-600 dark:text-gray-400">
            <p>{report.totalViolations} total violations</p>
            <p>{report.criteria.length} criteria affected</p>
          </div>
        </div>
      </div>

      {/* Principle Accordion */}
      <div className="space-y-2">
        {principleEntries.map(([principle, stats]) => {
          const isExpanded = expandedPrinciple === principle;
          const percentage = stats.total > 0 ? Math.round((stats.passed / stats.total) * 100) : 100;
          const criteria = report.criteria.filter((c) => c.principle === principle);

          return (
            <div
              key={principle}
              className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
            >
              <button
                onClick={() => setExpandedPrinciple(isExpanded ? null : principle)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {stats.failed === 0 ? '✅' : '⚠️'}
                  </span>
                  <div className="text-left">
                    <p className="font-medium text-sm text-gray-900 dark:text-white">
                      {PRINCIPLE_LABELS[principle]}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {PRINCIPLE_DESCRIPTIONS[principle]}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${complianceColor(percentage)}`}>
                    {stats.passed}/{stats.total}
                  </span>
                  <svg
                    className={`w-4 h-4 transition-transform text-gray-500 ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </button>

              {isExpanded && criteria.length > 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 overflow-x-auto">
                  <table className="w-full text-sm min-w-[300px]">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-800">
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Criterion</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Level</th>
                        <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Issues</th>
                      </tr>
                    </thead>
                    <tbody>
                      {criteria.map((c) => (
                        <CriterionRow key={c.id} criterion={c} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {isExpanded && criteria.length === 0 && (
                <div className="border-t border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                  No violations found - all criteria pass
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CriterionRow({ criterion }: { criterion: WCAGCriterion }) {
  return (
    <tr className="border-t border-gray-100 dark:border-gray-700/50">
      <td className="px-3 py-2">
        <div>
          <span className="font-medium text-gray-900 dark:text-white">{criterion.id}</span>
          <span className="ml-2 text-gray-600 dark:text-gray-400">{criterion.name}</span>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{criterion.description}</p>
      </td>
      <td className="px-3 py-2">
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${impactBadge(criterion.level)}`}>
          {criterion.level}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <span className="text-red-600 dark:text-red-400 font-semibold">{criterion.violations}</span>
      </td>
    </tr>
  );
}
