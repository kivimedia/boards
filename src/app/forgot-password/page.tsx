import Link from 'next/link';
import ForgotPasswordForm from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy font-heading">
            Get Back In
          </h1>
          <p className="text-navy/70 mt-2 font-body">
            Reset your password or sign in with a magic link
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-card p-8">
          <ForgotPasswordForm />
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
