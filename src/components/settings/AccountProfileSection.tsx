'use client';

import { Profile } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import AvatarUpload from '@/components/settings/AvatarUpload';

interface AccountProfileSectionProps {
  profile: Profile;
  email: string;
}

export default function AccountProfileSection({ profile, email }: AccountProfileSectionProps) {
  const { refreshProfile } = useAuth();

  const roleName = profile.user_role || profile.role || 'member';

  return (
    <div className="bg-white dark:bg-dark-surface rounded-2xl border-2 border-cream-dark dark:border-slate-700 p-6">
      <h3 className="text-navy dark:text-slate-100 font-heading font-semibold text-base mb-6">
        Profile
      </h3>
      <div className="flex items-start gap-8">
        <AvatarUpload
          currentUrl={profile.avatar_url}
          displayName={profile.display_name}
          onUploaded={() => refreshProfile()}
        />
        <div className="space-y-3 text-sm font-body">
          <div>
            <span className="text-navy/40 dark:text-slate-500 text-xs uppercase tracking-wider font-semibold">Name</span>
            <p className="text-navy dark:text-slate-200 font-medium mt-0.5">{profile.display_name}</p>
          </div>
          <div>
            <span className="text-navy/40 dark:text-slate-500 text-xs uppercase tracking-wider font-semibold">Email</span>
            <p className="text-navy dark:text-slate-200 font-medium mt-0.5">{email}</p>
          </div>
          <div>
            <span className="text-navy/40 dark:text-slate-500 text-xs uppercase tracking-wider font-semibold">Role</span>
            <p className="mt-0.5">
              <span className="inline-block px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider rounded-full bg-electric/10 text-electric dark:bg-electric/20">
                {roleName}
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
