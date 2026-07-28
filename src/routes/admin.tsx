import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EventSetup } from '@/components/admin/event-setup'
import { TeamEditor } from '@/components/admin/team-editor'
import { MatchEditor } from '@/components/admin/match-editor'
import { UserRoles } from '@/components/admin/user-roles'

export function AdminPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <Tabs defaultValue="event">
        <TabsList className="w-full sm:w-fit">
          <TabsTrigger value="event">Event</TabsTrigger>
          <TabsTrigger value="teams">Teams</TabsTrigger>
          <TabsTrigger value="matches">Matches</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
        </TabsList>
        <TabsContent value="event">
          <EventSetup />
        </TabsContent>
        <TabsContent value="teams">
          <TeamEditor />
        </TabsContent>
        <TabsContent value="matches">
          <MatchEditor />
        </TabsContent>
        <TabsContent value="users">
          <UserRoles />
        </TabsContent>
      </Tabs>
    </div>
  )
}
