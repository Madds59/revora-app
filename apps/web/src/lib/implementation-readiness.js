import { getCommonLabel } from "@/lib/display-labels";
import { formatNumber } from "@/lib/formatters";

function countReady(value) {
  return typeof value === "number" && value > 0;
}

function formatCount(value, locale) {
  if (value == null) return getCommonLabel("unavailable", locale);
  return formatNumber(value, undefined, locale);
}

function buildImplementationReadinessCards(counts, locale) {
  return [
    {
      key: "branches",
      label: locale === "ar" ? "الفروع" : "Branches",
      value: formatCount(counts.branches, locale),
      detail: locale === "ar" ? "أماكن التشغيل المسجلة." : "Registered operating locations.",
      complete: countReady(counts.branches),
    },
    {
      key: "teamMembers",
      label: locale === "ar" ? "أعضاء الفريق" : "Team members",
      value: formatCount(counts.teamMembers, locale),
      detail: locale === "ar" ? "الأعضاء النشطون في النشاط." : "Active members in the business.",
      complete: countReady(counts.teamMembers),
    },
    {
      key: "customers",
      label: locale === "ar" ? "العملاء" : "Customers",
      value: formatCount(counts.customers, locale),
      detail: locale === "ar" ? "سجلات العملاء الجاهزة." : "Customer records ready for operations.",
      complete: countReady(counts.customers),
    },
    {
      key: "vehicles",
      label: locale === "ar" ? "المركبات" : "Vehicles",
      value: formatCount(counts.vehicles, locale),
      detail: locale === "ar" ? "المركبات المرتبطة بالعملاء." : "Vehicles linked to customers.",
      complete: countReady(counts.vehicles),
    },
    {
      key: "services",
      label: locale === "ar" ? "الخدمات" : "Services",
      value: formatCount(counts.services, locale),
      detail: locale === "ar" ? "الخدمات المتاحة في التسعير." : "Services available for pricing.",
      complete: countReady(counts.services),
    },
    {
      key: "quotations",
      label: locale === "ar" ? "عروض الأسعار" : "Quotations",
      value: formatCount(counts.quotations, locale),
      detail: locale === "ar" ? "عروض الأسعار السابقة أو الجاهزة." : "Existing or ready quotation records.",
      complete: countReady(counts.quotations),
    },
    {
      key: "jobs",
      label: locale === "ar" ? "المهام" : "Jobs",
      value: formatCount(counts.jobs, locale),
      detail: locale === "ar" ? "أعمال التشغيل الجارية." : "Jobs already flowing through operations.",
      complete: countReady(counts.jobs),
    },
    {
      key: "complaints",
      label: locale === "ar" ? "الشكاوى" : "Complaints",
      value: formatCount(counts.complaints, locale),
      detail: locale === "ar" ? "سجلات الشكاوى القابلة للتتبع." : "Trackable complaint records.",
      complete: countReady(counts.complaints),
    },
    {
      key: "documents",
      label: locale === "ar" ? "المستندات" : "Documents",
      value: formatCount(counts.documents, locale),
      detail: locale === "ar" ? "مستندات النشاط المؤرشفة." : "Archived business documents.",
      complete: countReady(counts.documents),
    },
  ];
}

function buildImplementationChecklist(counts, locale, options = {}) {
  const businessProfileComplete = options.businessProfileComplete ?? false;

  return [
    {
      key: "business_profile",
      label: locale === "ar" ? "إكمال ملف النشاط" : "Complete business profile",
      detail:
        locale === "ar"
          ? "تأكد من الاسم التجاري والهوية والعلامة التجارية."
          : "Confirm the business name, identity, and branding.",
      href: "/settings/business",
      complete: businessProfileComplete,
    },
    {
      key: "branches",
      label: locale === "ar" ? "إضافة الفروع" : "Add branches",
      detail:
        locale === "ar"
          ? "ابدأ بإنشاء مواقع التشغيل الأساسية."
          : "Create your operating locations first.",
      href: "/settings/business",
      complete: countReady(counts.branches),
    },
    {
      key: "team",
      label: locale === "ar" ? "دعوة الفريق" : "Invite team members",
      detail:
        locale === "ar"
          ? "أضف المديرين ومستشاري الخدمة وأعضاء الفريق."
          : "Add managers, advisors, and staff.",
      href: "/settings/business",
      complete: countReady(counts.teamMembers),
    },
    {
      key: "services",
      label: locale === "ar" ? "إضافة الخدمات" : "Add services",
      detail:
        locale === "ar"
          ? "عرّف الخدمات التي ستظهر في عروض الأسعار."
          : "Define the services that will appear in quotations.",
      href: "/settings/business",
      complete: countReady(counts.services),
    },
    {
      key: "customers",
      label: locale === "ar" ? "إضافة العملاء" : "Import or add customers",
      detail:
        locale === "ar"
          ? "انقل قاعدة العملاء الحالية أو أضف أولى السجلات."
          : "Bring over your customer base or create the first records.",
      href: "/customers",
      complete: countReady(counts.customers),
    },
    {
      key: "vehicles",
      label: locale === "ar" ? "إضافة المركبات" : "Import or add vehicles",
      detail:
        locale === "ar"
          ? "اربط المركبات بالعملاء قبل التشغيل."
          : "Link vehicles to customers before launch.",
      href: "/vehicles",
      complete: countReady(counts.vehicles),
    },
    {
      key: "quotes",
      label: locale === "ar" ? "إنشاء أول عرض سعر" : "Create first quotation",
      detail:
        locale === "ar"
          ? "اختبر تدفق عروض الأسعار والتوقيع."
          : "Test the quotation and approval flow.",
      href: "/quotations",
      complete: countReady(counts.quotations),
    },
    {
      key: "jobs",
      label: locale === "ar" ? "إنشاء أول مهمة" : "Create first job",
      detail:
        locale === "ar"
          ? "تأكد من انتقال العرض المعتمد إلى المهمة."
          : "Confirm approved quotations turn into jobs.",
      href: "/jobs",
      complete: countReady(counts.jobs),
    },
    {
      key: "complaints",
      label: locale === "ar" ? "تهيئة الشكاوى" : "Configure complaints workflow",
      detail:
        locale === "ar"
          ? "تأكد من أن الفريق يرى مسار الشكاوى بوضوح."
          : "Make sure staff can follow the complaint flow.",
      href: "/complaints",
      complete: countReady(counts.complaints),
    },
    {
      key: "documents",
      label: locale === "ar" ? "رفع المستندات" : "Upload documents",
      detail:
        locale === "ar"
          ? "حمّل النماذج والملفات المرجعية."
          : "Upload templates and reference files.",
      href: "/documents",
      complete: countReady(counts.documents),
    },
    {
      key: "customer_portal",
      label: locale === "ar" ? "تفعيل بوابة العميل" : "Activate customer portal",
      detail:
        locale === "ar"
          ? "راجع بوابة العميل والإعدادات المرئية."
          : "Review customer portal visibility and settings.",
      href: "/settings/business",
      complete: false,
    },
    {
      key: "notifications",
      label: locale === "ar" ? "مراجعة الإشعارات" : "Review notification setup",
      detail:
        locale === "ar"
          ? "تأكد من أن الإشعارات تصل إلى الفريق الصحيح."
          : "Make sure the right team sees the right notifications.",
      href: "/notifications",
      complete: false,
    },
    {
      key: "billing",
      label: locale === "ar" ? "مراجعة الفوترة" : "Review billing setup",
      detail:
        locale === "ar"
          ? "تأكد من أن الخطة والاشتراك جاهزان قبل الإطلاق."
          : "Confirm plan and billing readiness before launch.",
      href: "/billing",
      complete: false,
    },
  ];
}

export { buildImplementationChecklist, buildImplementationReadinessCards };
