import { useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { toast } from 'sonner'
import { api } from '../../../convex/_generated/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

export function EventSetup() {
  const activeEvent = useQuery(api.events.getActive)
  const importEvent = useAction(api.tba.importEvent)
  const [eventKey, setEventKey] = useState('')
  const [importing, setImporting] = useState(false)

  async function handleImport() {
    const key = eventKey.trim()
    if (!key) return
    setImporting(true)
    try {
      const result = await importEvent({ eventKey: key })
      if (result.ok) {
        toast.success(`Imported ${result.teams} teams, ${result.matches} matches`)
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error('Import failed')
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <div className="space-y-2">
        <Label htmlFor="tba-event-key">TBA event key</Label>
        <div className="flex gap-2">
          <Input
            id="tba-event-key"
            value={eventKey}
            onChange={(e) => setEventKey(e.target.value)}
            placeholder="e.g. 2026casf"
            disabled={importing}
          />
          <Button
            type="button"
            disabled={importing || !eventKey.trim()}
            onClick={() => void handleImport()}
          >
            {importing ? 'Importing…' : 'Import'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Requires <code>TBA_API_KEY</code> set in the Convex deployment environment
          (<code>npx convex env set TBA_API_KEY &lt;key&gt;</code>).
        </p>
      </div>

      <Separator />

      <div className="space-y-1">
        <span className="text-sm font-medium text-muted-foreground">Active event</span>
        {activeEvent === undefined ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : activeEvent === null ? (
          <p className="text-sm text-muted-foreground">No active event.</p>
        ) : (
          <p className="text-sm">
            {activeEvent.name} <span className="text-muted-foreground">({activeEvent.tbaKey})</span>
          </p>
        )}
      </div>
    </div>
  )
}
