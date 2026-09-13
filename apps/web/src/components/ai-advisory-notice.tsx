import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { StatusBanner } from "@/components/status-banner";

/**
 * Persistent notice on every Vehicle Intelligence surface: AI output is
 * advisory, may be wrong, and must be reviewed by a qualified workshop. The
 * same statement lives in the Terms of Service §8 and Privacy Policy §11;
 * this keeps it in front of the person actually reading the result.
 */
export async function AiAdvisoryNotice({ className }: { className?: string }) {
  const t = await getTranslations("vehicleIntelligence.advisoryNotice");
  return (
    <StatusBanner tone="muted" icon={Sparkles} title={t("title")} className={className}>
      <p>{t("body")}</p>
    </StatusBanner>
  );
}
