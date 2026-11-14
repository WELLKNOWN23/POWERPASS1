
import { useState } from 'react'
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import {
  ArrowRight,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react'
import { auth } from './firebase'
import './AuthScreen.css'

type AuthScreenProps = {
  user?: User | null
}

function getErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error
      ? String(error.code)
      : ''

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account with this email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/user-not-found': 'No account was found with this email.',
    'auth/wrong-password': 'Incorrect email or password.',
    'auth/weak-password': 'Your password must contain at least 8 characters.',
    'auth/popup-closed-by-user': 'The Google sign-in window was closed.',
    'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow popups and try again.',
    'auth/too-many-requests': 'Too many attempts. Please wait and try again.',
    'auth/network-request-failed': 'Network error. Check your internet connection.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase.',
    'auth/account-exists-with-different-credential': 'An account already exists with this email using another sign-in method.',
    'auth/user-disabled': 'This account has been disabled.',
  }

  return messages[code] || 'Something went wrong. Please try again.'
}

export default function AuthScreen({ user }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(true)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const isVerifying = Boolean(user && !user.emailVerified)

  function clearMessages() {
    setError('')
    setNotice('')
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (loading) return

    clearMessages()
    setLoading(true)

    try {
      if (mode === 'register') {
        if (password.length < 8) {
          throw new Error('Your password must contain at least 8 characters.')
        }

        const result = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        )

        if (name.trim()) {
          await updateProfile(result.user, {
            displayName: name.trim(),
          })
        }

        await sendEmailVerification(result.user)

        setNotice(
          'Your account has been created. Check your inbox for the verification link.',
        )
      }

      if (mode === 'login') {
        await setPersistence(
          auth,
          rememberMe
            ? browserLocalPersistence
            : browserSessionPersistence,
        )

        await signInWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        )
      }

      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, email.trim())

        setNotice(
          'Password reset instructions have been sent to your email.',
        )
      }
    } catch (err) {
      setError(
        err instanceof Error && !('code' in err)
          ? err.message
          : getErrorMessage(err),
      )
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogleSignIn() {
    if (loading) return

    clearMessages()
    setLoading(true)

    try {
      await setPersistence(
        auth,
        rememberMe
          ? browserLocalPersistence
          : browserSessionPersistence,
      )

      const provider = new GoogleAuthProvider()

      provider.setCustomParameters({
        prompt: 'select_account',
      })

      const result = await signInWithPopup(auth, provider)

      await result.user.reload()

      if (!result.user.emailVerified) {
        setError(
          'Your Google account email is not verified. Please verify it before continuing.',
        )
        await signOut(auth)
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function resendVerification() {
    if (!user || loading) return

    clearMessages()
    setLoading(true)

    try {
      await sendEmailVerification(user)
      setNotice('A new verification email has been sent.')
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function checkVerification() {
    if (!user || loading) return

    clearMessages()
    setLoading(true)

    try {
      await user.reload()

      if (auth.currentUser?.emailVerified) {
        window.location.reload()
      } else {
        setError(
          'Your email is not verified yet. Open the link in your inbox first.',
        )
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleSignOut() {
    if (loading) return

    try {
      await signOut(auth)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (isVerifying && user) {
    return (
      <main className="auth-page">
        <section className="auth-card verification-card">
          <div className="auth-logo">
            <span className="auth-logo-mark">P</span>
            <span>
              power<span>pass</span>
            </span>
          </div>

          <div className="auth-icon-circle">
            <Mail size={28} />
          </div>

          <h1>Verify your email</h1>

          <p>
            We've sent a verification link to
            <strong> {user.email}</strong>.
            Open that email and click the verification link before continuing.
          </p>

          {notice && <div className="auth-success">{notice}</div>}
          {error && <div className="auth-error">{error}</div>}

          <button
            className="auth-primary"
            onClick={checkVerification}
            disabled={loading}
          >
            {loading ? 'Checking...' : 'I have verified my email'}
            <ArrowRight size={18} />
          </button>

          <button
            className="auth-secondary"
            onClick={resendVerification}
            disabled={loading}
          >
            Resend verification email
          </button>

          <button
            className="auth-text-button"
            onClick={handleSignOut}
            disabled={loading}
          >
            Sign out
          </button>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-logo">
          <span className="auth-logo-mark">P</span>
          <span>
            power<span>pass</span>
          </span>
        </div>

        <div className="auth-heading">
          <span className="auth-eyebrow">
            <span /> YOUR SPACE. YOUR PEOPLE.
          </span>

          <h1>
            {mode === 'register'
              ? 'Create your account.'
              : mode === 'reset'
                ? 'Reset your password.'
                : 'Welcome back.'}
          </h1>

          <p>
            {mode === 'register'
              ? 'Join a better way to discover workspaces and meet professionals.'
              : mode === 'reset'
                ? 'Enter your email and we will send you a password reset link.'
                : 'Sign in to discover your next productive workspace.'}
          </p>
        </div>

        {mode !== 'reset' && (
          <>
            <button
              className="google-button"
              onClick={handleGoogleSignIn}
              disabled={loading}
            >
              <svg viewBox="0 0 48 48" aria-hidden="true">
                <path
                  fill="#EA4335"
                  d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
                  transform="translate(0 4)"
                />
                <path
                  fill="#4285F4"
                  d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.72 7.18l7.62 5.91c4.45-4.1 7.14-10.14 7.14-17.56Z"
                />
                <path
                  fill="#FBBC05"
                  d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.2a24 24 0 0 0 0 21.58l7.98-6.2Z"
                  transform="translate(0 4)"
                />
                <path
                  fill="#34A853"
                  d="M24 48c6.48 0 11.93-2.13 15.9-5.89l-7.62-5.91c-2.12 1.42-4.83 2.27-8.28 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.2C6.51 42.62 14.62 48 24 48Z"
                  transform="translate(0 -4)"
                />
              </svg>

              {loading ? 'Please wait...' : 'Continue with Google'}
            </button>

            <div className="auth-divider">
              <span />
              <small>OR CONTINUE WITH EMAIL</small>
              <span />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === 'register' && (
            <label className="auth-field">
              <span>FULL NAME</span>

              <div className="auth-input-wrap">
                <UserRound size={18} />

                <input
                  type="text"
                  placeholder="Your full name"
                  value={name}
                  onChange={event => setName(event.target.value)}
                  autoComplete="name"
                  required
                />
              </div>
            </label>
          )}

          <label className="auth-field">
            <span>EMAIL ADDRESS</span>

            <div className="auth-input-wrap">
              <Mail size={18} />

              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={event => setEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
          </label>

          {mode !== 'reset' && (
            <label className="auth-field">
              <span>PASSWORD</span>

              <div className="auth-input-wrap">
                <LockKeyhole size={18} />

                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  autoComplete={
                    mode === 'register'
                      ? 'new-password'
                      : 'current-password'
                  }
                  minLength={8}
                  required
                />

                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff size={18} />
                  ) : (
                    <Eye size={18} />
                  )}
                </button>
              </div>
            </label>
          )}

          {mode === 'login' && (
            <div className="auth-login-options">
              <label className="remember-option">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={event => setRememberMe(event.target.checked)}
                />
                <span className="remember-checkmark" />
                <span className="remember-copy">
                  <strong>Remember me</strong>
                  <small>Stay signed in on this device</small>
                </span>
              </label>

              <button
                type="button"
                className="forgot-link"
                onClick={() => {
                  clearMessages()
                  setMode('reset')
                }}
              >
                Forgot password?
              </button>
            </div>
          )}

          {error && <div className="auth-error">{error}</div>}
          {notice && <div className="auth-success">{notice}</div>}

          <button
            className="auth-primary"
            type="submit"
            disabled={loading}
          >
            {loading
              ? 'Please wait...'
              : mode === 'register'
                ? 'Create account'
                : mode === 'reset'
                  ? 'Send reset link'
                  : 'Sign in'}

            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div className="auth-switch">
          {mode === 'register' ? (
            <>
              Already have an account?
              <button
                onClick={() => {
                  clearMessages()
                  setMode('login')
                }}
              >
                Sign in
              </button>
            </>
          ) : mode === 'reset' ? (
            <>
              Remember your password?
              <button
                onClick={() => {
                  clearMessages()
                  setMode('login')
                }}
              >
                Back to sign in
              </button>
            </>
          ) : (
            <>
              New to PowerPass?
              <button
                onClick={() => {
                  clearMessages()
                  setMode('register')
                }}
              >
                Create an account
              </button>
            </>
          )}
        </div>

        <div className="auth-security">
          <ShieldCheck size={16} />
          <span>
            Your account is protected by Firebase Authentication.
          </span>
        </div>

        <div className="auth-coming-soon">
          <Fingerprint size={16} />
          Passkey and biometric login can be added in a later milestone.
        </div>
      </section>

      <footer className="auth-footer">
        © 2026 PowerPass · Find your space. Find your people.
      </footer>
    </main>
  )
}
