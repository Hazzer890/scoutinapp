import { execFileSync } from 'node:child_process'

// The app talks directly to the cloud dev deployment (VITE_CONVEX_URL), so tests
// don't need `convex dev` running — just the current functions pushed once, then seeded.
export default function globalSetup() {
  execFileSync('npx', ['convex', 'dev', '--once'], { stdio: 'inherit', shell: true })
  execFileSync('npx', ['convex', 'run', 'seed:dev'], { stdio: 'inherit', shell: true })
}
