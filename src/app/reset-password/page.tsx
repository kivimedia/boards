import Link from 'next/link';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy font-heading">
            Set New Password
          </h1>
          <p className="text-navy/70 mt-2 font-body">
            Choose a new password for your account
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-card p-8">
          <ResetPasswordForm />
          <p className="text-center text-sm text-navy/70 mt-6 font-body">
            <Link href="/login" className="text-electric hover:text-electric-bright transition-colors">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
