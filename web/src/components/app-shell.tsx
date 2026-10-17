import { CalendarDays, NotebookPen, Settings } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Log", icon: NotebookPen, end: true },
  { to: "/day", label: "Day", icon: CalendarDays, end: false },
] as const;

const titles: Record<string, string> = {
  "/": "Log",
  "/settings": "Settings",
};

export function AppShell() {
  const { pathname } = useLocation();
  const title = titles[pathname] ?? (pathname.startsWith("/day") ? "Day" : "Calories");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="pt-safe px-safe sticky top-0 z-10 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-md items-center justify-between px-4">
          <h1 className="text-lg font-semibold">{title}</h1>
          <Link
            to="/settings"
            aria-label="Settings"
            className={cn(
              "-mr-2 flex size-11 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground",
              pathname === "/settings" && "text-foreground",
            )}
          >
            <Settings className="size-5" />
          </Link>
        </div>
      </header>

      <main className="px-safe flex-1">
        <div className="mx-auto w-full max-w-md p-4">
          <Outlet />
        </div>
      </main>

      <nav className="pb-safe px-safe sticky bottom-0 z-10 border-t bg-background/90 backdrop-blur">
        <ul className="mx-auto flex max-w-md">
          {tabs.map(({ to, label, icon: Icon, end }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    "flex h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium text-muted-foreground",
                    isActive && "text-foreground",
                  )
                }
              >
                <Icon className="size-5" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
