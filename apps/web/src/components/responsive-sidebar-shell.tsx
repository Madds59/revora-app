"use client";

import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import { useTranslations } from "next-intl";

import { Logo, FlagStripe } from "@/components/brand";
import { Button } from "@/components/ui/button";

export function ResponsiveSidebarShell({
  brandTitle,
  brandSubtitle,
  nav,
  mobileHeaderEnd,
  sidebarTop,
  sidebarFooter,
  children,
}: {
  brandSubtitle?: string;
  brandTitle: string;
  children: React.ReactNode;
  nav: React.ReactNode;
  mobileHeaderEnd?: React.ReactNode;
  sidebarFooter?: React.ReactNode;
  sidebarTop?: React.ReactNode;
}) {
  const t = useTranslations("shell");

  // Brand header + nav + footer, shared by the desktop aside and the mobile
  // drawer. `close` is only passed in the drawer (it needs a Dialog ancestor).
  const sidebarBody = (close?: React.ReactNode) => (
    <>
      <div className="relative">
        <div className="flex items-start justify-between gap-3 px-4 py-4">
          <Logo wordmark={brandTitle} subtitle={brandSubtitle} tone="inverted" />
          {close}
        </div>
        <FlagStripe />
      </div>

      {sidebarTop && (
        <div className="border-sidebar-border border-b p-4">{sidebarTop}</div>
      )}

      <div className="flex-1 overflow-y-auto py-2">{nav}</div>

      {sidebarFooter && (
        <div className="border-sidebar-border border-t p-4">{sidebarFooter}</div>
      )}
    </>
  );

  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[280px_1fr]">
      {/* Desktop sidebar */}
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden flex-col border-e md:flex">
        {sidebarBody()}
      </aside>

      <div className="flex min-w-0 flex-col">
        {/* Mobile top bar + drawer */}
        <header className="bg-background/95 sticky top-0 z-30 flex items-center gap-2 border-b px-3 py-2.5 backdrop-blur md:hidden">
          <DialogPrimitive.Root>
            <DialogPrimitive.Trigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("openNavigation")}
                >
                  <Menu />
                </Button>
              }
            />
            <DialogPrimitive.Portal>
              <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/40 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
              {/* Purpose-built side drawer: full-height, pinned to the start edge
                  (RTL-correct via logical `start-0`/`border-e`), no transform hacks. */}
              <DialogPrimitive.Popup className="bg-sidebar text-sidebar-foreground border-sidebar-border fixed inset-y-0 start-0 z-50 flex h-dvh w-[min(19rem,82vw)] flex-col overflow-hidden border-e shadow-xl outline-none data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0">
                {sidebarBody(
                  <DialogPrimitive.Close
                    render={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("closeNavigation")}
                        className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground -me-1"
                      />
                    }
                  >
                    <X />
                    <span className="sr-only">{t("closeNavigation")}</span>
                  </DialogPrimitive.Close>,
                )}
              </DialogPrimitive.Popup>
            </DialogPrimitive.Portal>
          </DialogPrimitive.Root>

          <div className="min-w-0 flex-1">
            <Logo wordmark={brandTitle} subtitle={brandSubtitle} />
          </div>

          {mobileHeaderEnd}
        </header>

        <main className="flex min-w-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
