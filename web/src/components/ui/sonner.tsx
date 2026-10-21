import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

// shadcn's Sonner wrapper, minus next-themes: the app always follows the system theme.
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="system"
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
