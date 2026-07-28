import { useAuthActions } from '@convex-dev/auth/react'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function SignInPage() {
  const { signIn } = useAuthActions()
  const navigate = useNavigate()
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn')
  const [submitting, setSubmitting] = useState(false)

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <h1 className="text-2xl font-semibold">
        {flow === 'signIn' ? 'Sign in' : 'Sign up'}
      </h1>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault()
          setSubmitting(true)
          const formData = new FormData(event.currentTarget)
          formData.set('flow', flow)
          signIn('password', formData)
            .then(() => navigate('/'))
            .catch(() => {
              toast.error(
                flow === 'signIn'
                  ? 'Could not sign in. Check your email and password.'
                  : 'Could not sign up. Try a different email or a longer password.',
              )
              setSubmitting(false)
            })
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
            required
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {flow === 'signIn' ? 'Sign in' : 'Sign up'}
        </Button>
      </form>
      <Button
        variant="link"
        className="px-0"
        onClick={() => setFlow(flow === 'signIn' ? 'signUp' : 'signIn')}
      >
        {flow === 'signIn'
          ? "Don't have an account? Sign up"
          : 'Already have an account? Sign in'}
      </Button>
    </div>
  )
}
