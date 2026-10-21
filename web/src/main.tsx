import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import { AppShell } from "@/components/app-shell";
import { LogPage } from "@/pages/log";
import { NotFoundPage } from "@/pages/not-found";
import "./index.css";

// The Log page is the landing page and stays in the main bundle; the others load on first visit
// (Day brings the calendar, Settings the form). AppShell shows a skeleton while they load.
const DayPage = lazy(() => import("@/pages/day").then((m) => ({ default: m.DayPage })));
const SettingsPage = lazy(() => import("@/pages/settings").then((m) => ({ default: m.SettingsPage })));

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<LogPage />} />
            <Route path="day/:date?" element={<DayPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
