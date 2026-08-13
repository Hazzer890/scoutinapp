import { createBrowserRouter } from 'react-router'
import { RequireAdmin } from '@/components/require-admin'
import { RootLayout } from '@/routes/root'
import { HomePage } from '@/routes/home'
import { SignInPage } from '@/routes/sign-in'
import { TeamsPage } from '@/routes/teams'
import { ScoutPage } from '@/routes/scout'
import { ScoutFormPage } from '@/routes/scout-form'
import { PicklistPage } from '@/routes/picklist'
import { LeaderboardPage } from '@/routes/leaderboard'
import { GalleryPage } from '@/routes/gallery'
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
      { path: 'scout', Component: ScoutPage },
      { path: 'scout/:teamId', Component: ScoutFormPage },
      { path: 'picklist', Component: PicklistPage },
      { path: 'leaderboard', Component: LeaderboardPage },
      { path: 'gallery', Component: GalleryPage },
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
