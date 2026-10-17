import { HealthStatus } from "@/components/health-status";

export function LogPage() {
  return (
    <div className="space-y-4">
      <HealthStatus />
      <p className="text-muted-foreground">Today's meals will show up here.</p>
    </div>
  );
}
