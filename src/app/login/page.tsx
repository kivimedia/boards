import Link from 'next/link';
import LoginForm from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-navy font-heading">
            Kivi Media
          </h1>
          <p className="text-navy/70 mt-2 font-body">
            Sign in to your workspace
          </p>
        </div>
        <div className="bg-white rounded-2xl shadow-card p-6 sm:p-8">
          <LoginForm />
          <p className="text-center text-sm text-navy/70 mt-6 font-body">
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-electric hover:text-electric-bright transition-colors">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
