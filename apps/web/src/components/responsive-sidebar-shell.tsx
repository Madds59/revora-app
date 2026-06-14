"use client";

import { Menu, X } from "lucide-react";

import { Logo, FlagStripe } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  const brandHeader = (
    <div>
      <div className="px-4 py-4">
        <Logo wordmark={brandTitle} subtitle={brandSubtitle} tone="inverted" />
      </div>
      <FlagStripe />
    </div>
  );

  return (
    <div className="min-h-dvh bg-background md:grid md:grid-cols-[280px_1fr]">
      <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border hidden flex-col border-e md:flex">
        {brandHeader}

        {sidebarTop && (
          <div className="border-sidebar-border border-b p-4">{sidebarTop}</div>
        )}

        <div className="flex-1 overflow-y-auto py-2">{nav}</div>

        {sidebarFooter && (
          <div className="border-sidebar-border border-t p-4">
            {sidebarFooter}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex items-center gap-3 border-b px-3 py-2.5 backdrop-blur md:hidden">
          <Dialog>
            <DialogTrigger
              render={
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Open navigation"
                >
                  <Menu />
                </Button>
              }
            />
            <DialogContent
              className="overflow-hidden rounded-none border-e p-0"
              showCloseButton={false}
              style={{
                transform: "none",
                top: 0,
                left: 0,
                bottom: 0,
                maxWidth: "none",
                width: "min(19rem, calc(100vw - 1rem))",
                height: "100dvh",
              }}
            >
              <div className="bg-sidebar text-sidebar-foreground flex h-full flex-col">
                <div className="relative">
                  <div className="flex items-start justify-between gap-3 px-4 py-4">
                    <Logo
                      wordmark={brandTitle}
                      subtitle={brandSubtitle}
                      tone="inverted"
                    />
                    <DialogClose
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Close navigation"
                          className="text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        />
                      }
                    >
                      <X />
                      <span className="sr-only">Close navigation</span>
                    </DialogClose>
                  </div>
                  <FlagStripe />
                </div>

                {sidebarTop && (
                  <div className="border-sidebar-border border-b p-4">
                    {sidebarTop}
                  </div>
                )}

                <div className="flex-1 overflow-y-auto py-2">{nav}</div>

                {sidebarFooter && (
                  <div className="border-sidebar-border border-t p-4">
                    {sidebarFooter}
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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
