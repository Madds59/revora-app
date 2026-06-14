import { FileText } from "lucide-react";

import type { EvidenceItem } from "@/lib/evidence";

export function EvidenceGallery({ items }: { items: EvidenceItem[] }) {
  if (items.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No evidence uploaded yet.</p>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {items.map((item) => (
        <a
          key={item.id}
          href={item.url ?? "#"}
          target="_blank"
          rel="noreferrer"
          className="group flex flex-col gap-1"
          title={item.fileName}
        >
          {item.isImage && item.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.url}
              alt={item.description ?? item.fileName}
              className="aspect-square w-full rounded-lg border object-cover transition-opacity group-hover:opacity-90"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex aspect-square w-full items-center justify-center rounded-lg border">
              <FileText className="size-6" />
            </div>
          )}
          <span className="text-muted-foreground truncate text-xs">
            {item.description || item.fileName}
          </span>
        </a>
      ))}
    </div>
  );
}
