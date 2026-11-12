import type * as React from "react";
import { useEffect } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

/**
 * `repositionInputs` is off: vaul lifts the sheet by `innerHeight - visualViewport.height` once, when the
 * keyboard opens, and gets it wrong when it measures at the wrong moment. That also turns off vaul's iOS
 * scroll handling, so `KeyboardInset` below keeps the sheet above the keyboard instead.
 */
function Drawer(props: React.ComponentProps<typeof DrawerPrimitive.Root>) {
  return <DrawerPrimitive.Root data-slot="drawer" repositionInputs={false} {...props} />;
}

function DrawerTrigger(props: React.ComponentProps<typeof DrawerPrimitive.Trigger>) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />;
}

function DrawerClose(props: React.ComponentProps<typeof DrawerPrimitive.Close>) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />;
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Overlay>) {
  return (
    <DrawerPrimitive.Overlay
      data-slot="drawer-overlay"
      className={cn("fixed inset-0 z-50 bg-black/50", className)}
      {...props}
    />
  );
}

/**
 * Publishes where the visible area ends while a sheet is open: `--kb-inset` is how much of the bottom of the
 * layout viewport is hidden (by the keyboard, or because the browser panned the page to reveal a focused
 * input), `--vvh` is the visible height. Recomputed on every viewport change rather than once, so the sheet
 * stays put wherever the browser scrolls. Android shrinks the page itself (`interactive-widget` in
 * index.html), so the inset stays 0 there; iOS Safari ignores that and overlays the keyboard.
 */
function KeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      // Pinch-zoom also shrinks the visual viewport; that isn't a keyboard.
      const inset = vv.scale > 1.01 ? 0 : Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      root.style.setProperty("--kb-inset", `${Math.round(inset)}px`);
      root.style.setProperty("--vvh", `${Math.round(vv.height * vv.scale)}px`);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--kb-inset");
      root.style.removeProperty("--vvh");
    };
  }, []);
  return null;
}

/** Bottom sheet. Children should include a DrawerTitle for screen readers. */
function DrawerContent({ className, children, ...props }: React.ComponentProps<typeof DrawerPrimitive.Content>) {
  return (
    <DrawerPrimitive.Portal>
      <DrawerOverlay />
      <DrawerPrimitive.Content
        data-slot="drawer-content"
        className={cn(
          "fixed inset-x-0 bottom-(--kb-inset,0px) z-50 mt-24 flex max-h-[calc(var(--vvh,100dvh)*0.9)] flex-col rounded-t-xl border-t bg-background pb-[env(safe-area-inset-bottom)]",
          className,
        )}
        {...props}
      >
        <KeyboardInset />
        <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-full bg-muted" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPrimitive.Portal>
  );
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-header" className={cn("flex flex-col gap-1.5 p-4", className)} {...props} />;
}

function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="drawer-footer" className={cn("mt-auto flex flex-col gap-2 p-4", className)} {...props} />;
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Title>) {
  return (
    <DrawerPrimitive.Title data-slot="drawer-title" className={cn("font-semibold text-foreground", className)} {...props} />
  );
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof DrawerPrimitive.Description>) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerOverlay,
  DrawerTitle,
  DrawerTrigger,
};
