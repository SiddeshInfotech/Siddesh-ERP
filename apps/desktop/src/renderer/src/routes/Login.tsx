import { Eye, EyeOff, LogIn, Package } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { useAuth } from '@/hooks/useAuth'

/**
 * Sign-in screen.
 *
 * Design: Document/stitch_siddesh_inventory_admin_system/login_dark
 *
 * The SSO and Passkey buttons in the Stitch mock are intentionally omitted — Sprint 1 ships
 * a single email/password Admin login (SRD §2), and a button that does nothing is worse
 * than no button.
 */
export function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    // Guard against a double submit racing two sign-in requests.
    if (isSubmitting) return

    setError(null)
    setIsSubmitting(true)

    const result = await signIn(email, password)

    if (result.error !== null) {
      setError(result.error)
      setIsSubmitting(false)
      return
    }

    // Deliberately not clearing isSubmitting on success: the button stays busy until this
    // screen unmounts, so it cannot be pressed twice during navigation.
    navigate('/', { replace: true })
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-container">
      <div className="violet-glow" aria-hidden="true" />

      <div className="mb-8 flex flex-col items-center gap-2">
        <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-primary-container">
          <Package
            aria-hidden="true"
            className="size-8 text-on-primary-container"
            strokeWidth={1.5}
          />
        </div>
        <h1 className="text-h2 tracking-tight text-on-surface">Siddesh</h1>
      </div>

      <div className="glass w-full max-w-[420px] rounded-xl p-8">
        <div className="mb-8">
          <h2 className="mb-1 text-[28px] font-semibold text-on-surface">Sign in</h2>
          <p className="text-body-sm text-on-surface-variant opacity-70">
            Inventory Management System
          </p>
        </div>

        {error ? (
          <Alert className="mb-6" shake tone="error">
            {error}
          </Alert>
        ) : null}

        <form className="space-y-5" noValidate onSubmit={handleSubmit}>
          <Field
            autoComplete="username"
            autoFocus
            error={error ? '' : undefined}
            label="Email Address"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="operator@sid-desh.com"
            required
            type="email"
            value={email}
          />

          <Field
            adornment={
              <button
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                className="text-outline transition-colors hover:text-on-surface-variant"
                onClick={() => setIsPasswordVisible((visible) => !visible)}
                type="button"
              >
                {isPasswordVisible ? (
                  <EyeOff aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
                ) : (
                  <Eye aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />
                )}
              </button>
            }
            autoComplete="current-password"
            error={error ? '' : undefined}
            label="Password"
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
            type={isPasswordVisible ? 'text' : 'password'}
            value={password}
          />

          <div className="pt-2">
            <Button
              className="w-full"
              icon={<LogIn aria-hidden="true" className="size-[18px]" strokeWidth={1.5} />}
              isLoading={isSubmitting}
              size="lg"
              type="submit"
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </Button>
          </div>
        </form>
      </div>

      <footer className="mt-12 text-center text-body-sm text-outline">
        <p>© 2026 Siddesh Technologies Pvt. Ltd.</p>
      </footer>
    </main>
  )
}
