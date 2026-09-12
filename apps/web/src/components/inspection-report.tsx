import { getTranslations } from "next-intl/server";

import { InspectionResultBadge } from "@/components/inspection-result-badge";
import { groupBySection } from "@/lib/inspections/results";
import type { InspectionItemView } from "@/lib/inspections/data";

/**
 * The read-only inspection report, shared by the portal and the public share
 * page so a customer sees exactly the same document either way.
 *
 * It renders ONLY what it is given. The two callers build their payloads with
 * separate, explicitly-columned queries (see lib/inspections/data.ts), so this
 * component has no access to internal notes, pricing or storage paths and
 * cannot leak them by accident.
 */
export async function InspectionReport({
  items,
  namespace,
}: {
  items: InspectionItemView[];
  /** Which message namespace supplies this surface's labels. */
  namespace: "portalInspections" | "publicInspection";
}) {
  const t = await getTranslations(namespace);
  const tShared = await getTranslations("inspections");
  const sections = groupBySection(items);

  return (
    <div className="space-y-6">
      {sections.map(({ section, items: sectionItems }) => (
        <section key={section} className="space-y-3">
          <h2 className="text-sm font-semibold">{section}</h2>
          <ul className="space-y-3">
            {sectionItems.map((item) => (
              <li key={item.id} className="bg-card rounded-xl border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm leading-6 font-medium">{item.label}</p>
                  <InspectionResultBadge result={item.result} />
                </div>

                {item.note && (
                  <p className="text-muted-foreground mt-2 text-sm leading-6">
                    {item.note}
                  </p>
                )}

                {item.photos.length > 0 && (
                  <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {item.photos.map((photo) => (
                      <li key={photo.id}>
                        <a href={photo.url} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.url}
                            alt={t("photoAlt", { label: item.label })}
                            className="aspect-square w-full rounded-lg border object-cover"
                          />
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-muted-foreground text-xs leading-5">
        {tShared("notAStandard")}
      </p>
    </div>
  );
}
