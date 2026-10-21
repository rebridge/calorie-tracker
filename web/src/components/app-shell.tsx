import { CalendarDays, NotebookPen, Settings } from "lucide-react";
import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { ErrorBoundary } from "@/components/error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/", label: "Log", icon: NotebookPen, end: true },
  { to: "/day", label: "Day", icon: CalendarDays, end: false },
] as const;

const titles: Record<string, string> = {
  "/": "Log",
  "/settings": "Settings",
};

/** Fallback while a lazily loaded page's code downloads. */
function PageLoading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-32 rounded-xl" />
    </div>
  );
}

/** Text-entry elements: focusing one raises the on-screen keyboard on a phone. */
const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLInputElement && !["button", "checkbox", "radio", "submit", "range"].includes(el.type));

/**
 * Sets `data-kb` on <html> while a text field is focused on a touch device. CSS drops the tab bar then
 * (see `--tabbar-h` in index.css), so the pinned composer sits right above the keyboard instead of
 * leaving a tab bar's worth of dead space or being pushed off-screen.
 */
function useKeyboardFlag() {
  useEffect(() => {
    const touch = window.matchMedia("(pointer: coarse)");
    const root = document.documentElement;
    const onFocusIn = (e: FocusEvent) => {
      if (touch.matches && isTextField(e.target)) root.dataset.kb = "";
    };
    const onFocusOut = () => delete root.dataset.kb;
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      onFocusOut();
    };
  }, []);
}

export function AppShell() {
  const { pathname } = useLocation();
  useKeyboardFlag();
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

      <main className="px-safe flex flex-1 flex-col">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col p-4">
          {/* Keyed by the first path segment so a failed page recovers when you tab away, but /day/:date keeps its state. */}
          <ErrorBoundary key={pathname.split("/")[1]}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </div>
      </main>

      <nav className="pb-safe px-safe sticky bottom-0 z-10 border-t bg-background/90 backdrop-blur in-data-kb:hidden">
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

      {/* Top of the screen so toasts never cover the composer or the phone keyboard. */}
      <Toaster
        position="top-center"
        offset={{ top: "calc(4rem + env(safe-area-inset-top))" }}
        mobileOffset={{ top: "calc(4rem + env(safe-area-inset-top))" }}
      />
    </div>
  );
}
