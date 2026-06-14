import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { BrandState } from "@/components/brand-state";
import { buttonVariants } from "@/components/ui/button";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <BrandState
      code={t("code")}
      title={t("title")}
      description={t("description")}
    >
      <Link href="/" className={buttonVariants()}>
        {t("backToDashboard")}
      </Link>
      <Link href="/portal" className={buttonVariants({ variant: "outline" })}>
        {t("goToPortal")}
      </Link>
    </BrandState>
  );
}
