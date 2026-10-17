import { HealthResponseSchema } from "@calorie-tracker/shared";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import { cn } from "@/lib/utils";

export function HealthStatus() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => apiGet("/api/health", HealthResponseSchema),
    refetchInterval: 30_000,
  });

  const state = health.isPending ? "checking" : health.isSuccess ? "ok" : "down";
  const label = { checking: "Checking server…", ok: "Server healthy", down: "Server unreachable" }[state];

  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span
        className={cn(
          "size-2.5 rounded-full",
          state === "checking" && "animate-pulse bg-muted-foreground",
          state === "ok" && "bg-green-500",
          state === "down" && "bg-destructive",
        )}
        aria-hidden
      />
      {label}
    </div>
  );
}
