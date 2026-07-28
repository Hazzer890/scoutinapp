import { createBrowserRouter } from 'react-router'
import { RequireAdmin } from '@/components/require-admin'
import { RootLayout } from '@/routes/root'
import { HomePage } from '@/routes/home'
import { SignInPage } from '@/routes/sign-in'
import { TeamsPage } from '@/routes/teams'
import { PitPage } from '@/routes/pit'
import { PitFormPage } from '@/routes/pit-form'
import { MatchesPage } from '@/routes/matches'
import { MatchFormPage } from '@/routes/match-form'
import { PicklistPage } from '@/routes/picklist'
import { AdminPage } from '@/routes/admin'
import { ErrorPage } from '@/routes/error'

export const router = createBrowserRouter([
  {
    path: '/',
    Component: RootLayout,
    errorElement: <ErrorPage />,
    children: [
      { index: true, Component: HomePage },
      { path: 'sign-in', Component: SignInPage },
      { path: 'teams', Component: TeamsPage },
      { path: 'pit', Component: PitPage },
      { path: 'pit/:teamId', Component: PitFormPage },
      { path: 'matches', Component: MatchesPage },
      { path: 'matches/:matchNumber/:teamNumber', Component: MatchFormPage },
      { path: 'picklist', Component: PicklistPage },
      {
        path: 'admin',
        element: (
          <RequireAdmin>
            <AdminPage />
          </RequireAdmin>
        ),
      },
    ],
  },
])
