import { createServerSupabaseClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/layout/Sidebar';
import Header from '@/components/layout/Header';
import { isAdmin, isAgencyOwner } from '@/lib/permissions';
import { UserRole } from '@/lib/types';
import { getFeatureAccessMap, isTrueAdmin } from '@/lib/feature-access';

export default async function SettingsPage() {
  const supabase = createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  const userRole = (profile?.user_role || profile?.role || 'member') as UserRole;
  const userIsAdmin = isAdmin(userRole) || isAgencyOwner(profile?.agency_role ?? null);

  const [featureAccess, isRealAdmin] = await Promise.all([
    getFeatureAccessMap(supabase, user.id),
    isTrueAdmin(supabase, user.id),
  ]);

  // Pre-fetch boards for sidebar (avoids client-side refetch flash)
  const { data: boards } = await supabase
    .from('boards')
    .select('*')
    .order('created_at', { ascending: true });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar initialBoards={boards || []} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <Header title="Settings" />
        <div className="flex-1 overflow-y-auto bg-cream dark:bg-dark-bg p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            <p className="text-navy/60 dark:text-slate-400 font-body text-sm mb-8">
              Manage your workspace settings, users, and permissions.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* User Management Card - Admin Only */}
              {(userIsAdmin || featureAccess.user_management) && (
                <Link
                  href="/settings/users"
                  className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1">
                        User Management
                      </h3>
                      <p className="text-navy/50 font-body text-sm leading-relaxed">
                        View and manage all users in the workspace. Assign global roles and permissions.
                      </p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )}

              {/* Handoff Rules Card */}
              <Link
                href="/settings/handoff-rules"
                className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-navy font-heading font-semibold text-base mb-1">
                      Handoff Rules
                    </h3>
                    <p className="text-navy/50 font-body text-sm leading-relaxed">
                      Configure cross-board card handoff rules.
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>

              {/* Trello Migration Card */}
              <Link
                href="/settings/migration"
                className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                      <path d="M12 3v3m0 12v3M3 12h3m12 0h3" />
                      <path d="M18.364 5.636l-2.121 2.121m-8.486 8.486l-2.121 2.121M18.364 18.364l-2.121-2.121M7.757 7.757L5.636 5.636" />
                      <circle cx="12" cy="12" r="4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-navy font-heading font-semibold text-base mb-1">
                      Trello Migration
                    </h3>
                    <p className="text-navy/50 font-body text-sm leading-relaxed">
                      Import boards, cards, and data from Trello.
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>

              {/* Backups Card */}
              <Link
                href="/settings/backups"
                className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                      <ellipse cx="12" cy="5" rx="9" ry="3" />
                      <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
                      <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-navy font-heading font-semibold text-base mb-1">
                      Backups
                    </h3>
                    <p className="text-navy/50 font-body text-sm leading-relaxed">
                      Create backups and restore data.
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>

              {/* AI Configuration Card */}
              {featureAccess.ai_config && (
                <Link
                  href="/settings/ai"
                  className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                        <path d="M12 2a4 4 0 0 0-4 4c0 2 1.5 3.5 4 5 2.5-1.5 4-3 4-5a4 4 0 0 0-4-4z" />
                        <path d="M12 11v4" />
                        <path d="M8 17.5a6 6 0 0 0 8 0" />
                        <path d="M6.5 15a8 8 0 0 0 11 0" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1">
                        AI Configuration
                      </h3>
                      <p className="text-navy/50 font-body text-sm leading-relaxed">
                        Manage API keys, models, budgets, and usage.
                      </p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )}

              {/* Agent Skills Card */}
              {userIsAdmin && (
                <Link
                  href="/settings/agents"
                  className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                      <span className="text-2xl">🤖</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1">
                        Agent Skills
                      </h3>
                      <p className="text-navy/50 font-body text-sm leading-relaxed">
                        Manage AI agent skills, view quality scores, and optimize skill prompts over time.
                      </p>
                    </div>
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </Link>
              )}

              {/* Board Maintenance Card */}
              <Link
                href="/settings/board-maintenance"
                className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                      <rect x="2" y="4" width="8" height="4" rx="1" />
                      <rect x="14" y="4" width="8" height="4" rx="1" />
                      <rect x="2" y="12" width="8" height="4" rx="1" />
                      <rect x="14" y="12" width="8" height="4" rx="1" />
                      <path d="M6 20h12" />
                      <path d="M12 16v4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1">
                      Board Maintenance
                    </h3>
                    <p className="text-navy/50 font-body text-sm leading-relaxed">
                      Scan all boards for duplicate cards and remove them in bulk. View dedup reports.
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>

              {/* QA Monitoring Card */}
              <Link
                href="/settings/qa"
                className="group block bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 hover:border-electric/30 p-6 transition-all duration-200 hover:shadow-lg"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-electric/10 flex items-center justify-center shrink-0 group-hover:bg-electric/20 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-electric">
                      <path d="M9 11a3 3 0 1 0 6 0a3 3 0 0 0-6 0z" />
                      <path d="M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9z" />
                      <path d="M12 14v4" />
                      <path d="M12 6V8" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-1">
                      QA Monitoring
                    </h3>
                    <p className="text-navy/50 font-body text-sm leading-relaxed">
                      Track Lighthouse scores, link health, and WCAG compliance. View trends and regressions.
                    </p>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy/20 group-hover:text-electric transition-colors mt-1 shrink-0">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </Link>

              {/* Board Permissions Card - Informational */}
              <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-navy font-heading font-semibold text-base mb-1">
                      Board Permissions
                    </h3>
                    <p className="text-navy/50 font-body text-sm leading-relaxed">
                      Board-level permissions including member roles and column move rules are managed directly within each board&apos;s settings. Navigate to a board and open its settings to configure access.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
