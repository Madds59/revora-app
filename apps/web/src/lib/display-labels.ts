import type {
  ComplaintSeverity,
  ComplaintStatus,
  JobStatus,
  QuoteStatus,
} from "@/lib/database.types";

import type { AppLocale } from "@/lib/formatters";

type LabelMap<T extends string> = Record<AppLocale, Record<T, string>>;

function getLabel<T extends string>(
  map: LabelMap<T>,
  value: T,
  locale: AppLocale = "en",
): string {
  return map[locale][value] ?? map.en[value] ?? value;
}

const JOB_STATUS_LABELS: LabelMap<JobStatus> = {
  en: {
    pending: "Pending",
    approved: "Approved",
    in_progress: "In progress",
    waiting_parts: "Waiting parts",
    delayed: "Delayed",
    completed: "Completed",
    cancelled: "Cancelled",
  },
  ar: {
    pending: "قيد الانتظار",
    approved: "معتمد",
    in_progress: "قيد التنفيذ",
    waiting_parts: "بانتظار القطع",
    delayed: "متأخر",
    completed: "مكتملة",
    cancelled: "ملغاة",
  },
};

const QUOTE_STATUS_LABELS: LabelMap<QuoteStatus> = {
  en: {
    draft: "Draft",
    sent: "Sent",
    revised: "Revised",
    approved: "Approved",
    declined: "Declined",
    expired: "Expired",
    cancelled: "Cancelled",
  },
  ar: {
    draft: "مسودة",
    sent: "مُرسل",
    revised: "معدّل",
    approved: "معتمد",
    declined: "مرفوض",
    expired: "منتهي الصلاحية",
    cancelled: "ملغى",
  },
};

const COMPLAINT_STATUS_LABELS: LabelMap<ComplaintStatus> = {
  en: {
    open: "Open",
    assigned: "Assigned",
    awaiting_customer: "Awaiting customer",
    investigating: "Investigating",
    escalated: "Escalated",
    resolved: "Resolved",
    closed: "Closed",
  },
  ar: {
    open: "مفتوحة",
    assigned: "مُسندة",
    awaiting_customer: "بانتظار العميل",
    investigating: "قيد التحقيق",
    escalated: "مصعّدة",
    resolved: "محلولة",
    closed: "مغلقة",
  },
};

const COMPLAINT_SEVERITY_LABELS: LabelMap<ComplaintSeverity> = {
  en: {
    low: "Low",
    medium: "Medium",
    high: "High",
    critical: "Critical",
  },
  ar: {
    low: "منخفضة",
    medium: "متوسطة",
    high: "عالية",
    critical: "حرجة",
  },
};

const BILLING_INVOICE_STATUS_LABELS = {
  en: {
    draft: "Draft",
    open: "Open",
    paid: "Paid",
    uncollectible: "Uncollectible",
    void: "Void",
    deleted: "Deleted",
  },
  ar: {
    draft: "مسودة",
    open: "مفتوحة",
    paid: "مدفوعة",
    uncollectible: "غير قابلة للتحصيل",
    void: "ملغاة",
    deleted: "محذوفة",
  },
} as const;

const NOTIFICATION_STATUS_LABELS = {
  en: {
    unread: "Unread",
    read: "Read",
    queued: "Queued",
    sent: "Sent",
    delivered: "Delivered",
    failed: "Failed",
    skipped_disabled: "Skipped - disabled",
    skipped_missing_recipient: "Skipped - missing recipient",
    skipped_no_provider: "Skipped - no provider",
    skipped_suppressed: "Skipped - suppressed",
  },
  ar: {
    unread: "غير مقروء",
    read: "مقروء",
    queued: "في الانتظار",
    sent: "مرسلة",
    delivered: "تم التسليم",
    failed: "فاشلة",
    skipped_disabled: "تم التخطي - معطل",
    skipped_missing_recipient: "تم التخطي - لا يوجد مستلم",
    skipped_no_provider: "تم التخطي - لا يوجد مزود",
    skipped_suppressed: "تم التخطي - محجوب",
  },
} as const;

const NOTIFICATION_TEMPLATE_LABELS = {
  en: {
    quote_approved: "Quote approved",
    quote_rejected: "Quote rejected",
    quote_sent: "Quote sent",
    complaint_replied: "Complaint replied",
    complaint_submitted: "Complaint submitted",
    complaint_status_changed: "Complaint status changed",
    feedback_submitted: "Feedback submitted",
    job_completed: "Job completed",
    job_status_changed: "Job status changed",
    job_updated: "Job updated",
    billing_event: "Billing event",
    vehicle_safety_critical: "Vehicle safety warning",
  },
  ar: {
    quote_approved: "تم اعتماد عرض السعر",
    quote_rejected: "تم رفض عرض السعر",
    quote_sent: "تم إرسال عرض السعر",
    complaint_replied: "تمت الرد على الشكوى",
    complaint_submitted: "تم إرسال شكوى",
    complaint_status_changed: "تم تغيير حالة الشكوى",
    feedback_submitted: "تم إرسال الملاحظات",
    job_completed: "اكتملت المهمة",
    job_status_changed: "تم تغيير حالة المهمة",
    job_updated: "تم تحديث المهمة",
    billing_event: "حدث فوترة",
    vehicle_safety_critical: "تحذير سلامة للمركبة",
  },
} as const;

const RETAINER_CUSTOMER_TYPE_LABELS = {
  en: {
    individual: "Individual",
    fleet: "Fleet",
    corporate: "Corporate",
    government: "Government",
    insurance_partner: "Insurance partner",
  },
  ar: {
    individual: "فردي",
    fleet: "أسطول",
    corporate: "شركة",
    government: "حكومي",
    insurance_partner: "شريك تأمين",
  },
} as const;

const RETAINER_SERVICE_CATEGORY_LABELS = {
  en: {
    general_workshop_maintenance: "General workshop maintenance",
    detailing: "Detailing",
    tire_services: "Tire services",
    inspection_package: "Inspection package",
    fleet_maintenance: "Fleet maintenance",
    custom: "Custom",
  },
  ar: {
    general_workshop_maintenance: "صيانة الورشة العامة",
    detailing: "التفصيل",
    tire_services: "خدمات الإطارات",
    inspection_package: "حزمة الفحص",
    fleet_maintenance: "صيانة الأسطول",
    custom: "مخصص",
  },
} as const;

const RETAINER_STATUS_LABELS = {
  en: {
    draft: "Draft",
    active: "Active",
    archived: "Archived",
    converted_to_quote: "Converted to quote",
  },
  ar: {
    draft: "مسودة",
    active: "نشط",
    archived: "مؤرشف",
    converted_to_quote: "تم تحويله إلى عرض سعر",
  },
} as const;

const RETAINER_BILLING_CYCLE_LABELS = {
  en: {
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annual",
  },
  ar: {
    monthly: "شهري",
    quarterly: "ربع سنوي",
    annual: "سنوي",
  },
} as const;

const RETAINER_SLA_LABELS = {
  en: {
    standard: "Standard",
    priority: "Priority",
    vip: "VIP",
  },
  ar: {
    standard: "قياسي",
    priority: "أولوية",
    vip: "كبار الشخصيات",
  },
} as const;

const RETAINER_ROUNDING_LABELS = {
  en: {
    none: "None",
    nearest_10: "Nearest 10",
    nearest_50: "Nearest 50",
    nearest_100: "Nearest 100",
    psychological: "Psychological",
  },
  ar: {
    none: "بدون",
    nearest_10: "أقرب 10",
    nearest_50: "أقرب 50",
    nearest_100: "أقرب 100",
    psychological: "نفسي",
  },
} as const;

const COMMON_LABELS = {
  en: {
    none: "—",
    unknown: "Unknown",
    unavailable: "Unavailable",
    enabled: "Enabled",
    disabled: "Disabled",
    included: "Included",
    notIncluded: "Not included",
    configuredInStripe: "Configured in Stripe",
    updated: "Updated",
    due: "Due",
    noDueDate: "No due date",
  },
  ar: {
    none: "—",
    unknown: "غير معروف",
    unavailable: "غير متاح",
    enabled: "مفعّل",
    disabled: "معطّل",
    included: "مشمول",
    notIncluded: "غير مشمول",
    configuredInStripe: "مُعد في Stripe",
    updated: "تم التحديث",
    due: "مستحق",
    noDueDate: "لا يوجد موعد",
  },
} as const;

const BILLING_PLAN_LABELS = {
  en: {
    starter: "Starter",
    professional: "Professional",
    business: "Business",
    enterprise: "Enterprise",
  },
  ar: {
    starter: "البداية",
    professional: "الاحترافية",
    business: "الأعمال",
    enterprise: "المؤسسات",
  },
} as const;

const BILLING_FEATURE_LABELS = {
  en: {
    customer_management: "Customer management",
    jobs: "Jobs",
    quotations: "Quotations",
    documents: "Documents",
    analytics: "Analytics",
    notifications: "Notifications",
    billing: "Billing",
    team_members: "Team members",
    branches: "Branches",
    ai_assistant: "AI assistant",
    priority_support: "Priority support",
  },
  ar: {
    customer_management: "إدارة العملاء",
    jobs: "المهام",
    quotations: "عروض الأسعار",
    documents: "المستندات",
    analytics: "التحليلات",
    notifications: "الإشعارات",
    billing: "الفوترة",
    team_members: "أعضاء الفريق",
    branches: "الفروع",
    ai_assistant: "مساعد الذكاء الاصطناعي",
    priority_support: "دعم أولوية",
  },
} as const;

const BILLING_LIMIT_UNIT_LABELS = {
  en: {
    customers: "customers",
    jobs: "jobs",
    quotes: "quotes",
    messages: "messages",
    members: "members",
    branches: "branches",
    credits: "credits",
  },
  ar: {
    customers: "عميل",
    jobs: "مهمة",
    quotes: "عرض سعر",
    messages: "رسالة",
    members: "عضو",
    branches: "فرع",
    credits: "رصيد",
  },
} as const;

const LANGUAGE_LABELS = {
  en: {
    en: "English",
    ar: "Arabic",
  },
  ar: {
    en: "الإنجليزية",
    ar: "العربية",
  },
} as const;

const COUNTRY_LABELS = {
  en: {
    AE: "United Arab Emirates",
    SA: "Saudi Arabia",
    US: "United States",
  },
  ar: {
    AE: "الإمارات العربية المتحدة",
    SA: "المملكة العربية السعودية",
    US: "الولايات المتحدة",
  },
} as const;

const ROLE_LABELS = {
  en: {
    customer: "Customer",
    business_owner: "Owner",
    super_admin: "Super admin",
    employee: "Employee",
    manager: "Manager",
    owner: "Owner",
    platform_admin: "Platform admin",
    teammate: "Teammate",
    service_advisor: "Service advisor",
  },
  ar: {
    customer: "عميل",
    business_owner: "مالك",
    super_admin: "مشرف أعلى",
    employee: "موظف",
    manager: "مدير",
    owner: "مالك",
    platform_admin: "مشرف المنصة",
    teammate: "زميل",
    service_advisor: "مستشار خدمة",
  },
} as const;

export function getJobStatusLabel(status: JobStatus, locale: AppLocale = "en"): string {
  return getLabel(JOB_STATUS_LABELS, status, locale);
}

export function getQuoteStatusLabel(status: QuoteStatus, locale: AppLocale = "en"): string {
  return getLabel(QUOTE_STATUS_LABELS, status, locale);
}

export function getComplaintStatusLabel(
  status: ComplaintStatus,
  locale: AppLocale = "en",
): string {
  return getLabel(COMPLAINT_STATUS_LABELS, status, locale);
}

export function getComplaintSeverityLabel(
  severity: ComplaintSeverity,
  locale: AppLocale = "en",
): string {
  return getLabel(COMPLAINT_SEVERITY_LABELS, severity, locale);
}

export function getBillingInvoiceStatusLabel(
  status: keyof typeof BILLING_INVOICE_STATUS_LABELS.en,
  locale: AppLocale = "en",
): string {
  return BILLING_INVOICE_STATUS_LABELS[locale][status] ?? COMMON_LABELS[locale].unknown;
}

export function getNotificationStatusLabel(
  status: string,
  locale: AppLocale = "en",
): string {
  return (
    NOTIFICATION_STATUS_LABELS[locale][
      status as keyof typeof NOTIFICATION_STATUS_LABELS.en
    ] ?? COMMON_LABELS[locale].unknown
  );
}

export function getNotificationTemplateLabel(templateKey: string, locale: AppLocale = "en"): string {
  const key = templateKey.toLowerCase();
  for (const [template, label] of Object.entries(NOTIFICATION_TEMPLATE_LABELS[locale])) {
    if (key.includes(template)) return label;
  }
  return COMMON_LABELS[locale].unknown;
}

export function getCommonLabel(
  key: keyof typeof COMMON_LABELS.en,
  locale: AppLocale = "en",
): string {
  return COMMON_LABELS[locale][key];
}

export function getLanguageLabel(language: keyof typeof LANGUAGE_LABELS.en, locale: AppLocale = "en"): string {
  return LANGUAGE_LABELS[locale][language] ?? COMMON_LABELS[locale].unknown;
}

export function getCountryLabel(country: keyof typeof COUNTRY_LABELS.en, locale: AppLocale = "en"): string {
  return COUNTRY_LABELS[locale][country] ?? country;
}

export function getRoleLabel(role: keyof typeof ROLE_LABELS.en, locale: AppLocale = "en"): string {
  return ROLE_LABELS[locale][role] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerCustomerTypeLabel(
  value: keyof typeof RETAINER_CUSTOMER_TYPE_LABELS.en,
  locale: AppLocale = "en",
): string {
  return RETAINER_CUSTOMER_TYPE_LABELS[locale][value] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerServiceCategoryLabel(
  value: keyof typeof RETAINER_SERVICE_CATEGORY_LABELS.en,
  locale: AppLocale = "en",
): string {
  return RETAINER_SERVICE_CATEGORY_LABELS[locale][value] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerStatusLabel(
  value: keyof typeof RETAINER_STATUS_LABELS.en,
  locale: AppLocale = "en",
): string {
  return RETAINER_STATUS_LABELS[locale][value] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerBillingCycleLabel(
  value: keyof typeof RETAINER_BILLING_CYCLE_LABELS.en,
  locale: AppLocale = "en",
): string {
  return RETAINER_BILLING_CYCLE_LABELS[locale][value] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerSlaLabel(
  value: keyof typeof RETAINER_SLA_LABELS.en,
  locale: AppLocale = "en",
): string {
  return RETAINER_SLA_LABELS[locale][value] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerRoundingLabel(
  value: keyof typeof RETAINER_ROUNDING_LABELS.en,
  locale: AppLocale = "en",
): string {
  return RETAINER_ROUNDING_LABELS[locale][value] ?? COMMON_LABELS[locale].unknown;
}

export function getRetainerInsightLabel(value: string, locale: AppLocale = "en"): string {
  const key = value.trim().toLowerCase();
  const map = {
    en: {
      overhead_high: "High overhead risk",
      fleet_tier: "Fleet tier",
      prepaid_strategy: "Prepay strategy",
      trim_overhead: "Reduce overhead",
      use_fleet_pricing: "Use fleet pricing",
      consider_prepay_discount: "Consider prepay discount",
      viable: "Viable",
      complaint_submitted: "Complaint submitted",
      none: "None",
    },
    ar: {
      overhead_high: "ارتفاع المصاريف التشغيلية",
      fleet_tier: "فئة الأسطول",
      prepaid_strategy: "استراتيجية الدفع المسبق",
      trim_overhead: "خفض المصروفات",
      use_fleet_pricing: "استخدام تسعير الأسطول",
      consider_prepay_discount: "النظر في خصم الدفع المسبق",
      viable: "قابل للتنفيذ",
      complaint_submitted: "تم إرسال شكوى",
      none: "بدون",
    },
  } as const;

  return map[locale][key as keyof typeof map.en] ?? COMMON_LABELS[locale].unknown;
}

export function getUnknownVehicleLabel(locale: AppLocale = "en"): string {
  return locale === "ar" ? "مركبة غير معروفة" : "Unknown vehicle";
}

function normalizeLookup(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function getBillingPlanLabel(value: string, locale: AppLocale = "en"): string {
  const key = normalizeLookup(value);
  return BILLING_PLAN_LABELS[locale][key as keyof typeof BILLING_PLAN_LABELS.en] ?? value;
}

export function getBillingFeatureLabel(value: string, locale: AppLocale = "en"): string {
  const key = normalizeLookup(value);
  return BILLING_FEATURE_LABELS[locale][key as keyof typeof BILLING_FEATURE_LABELS.en] ?? value;
}

export function getBillingLimitUnitLabel(value: string, locale: AppLocale = "en"): string {
  const key = normalizeLookup(value);
  return BILLING_LIMIT_UNIT_LABELS[locale][key as keyof typeof BILLING_LIMIT_UNIT_LABELS.en] ?? value;
}
