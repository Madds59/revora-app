import { z } from "zod";

const FEEDBACK_CATEGORIES = [
  "feedback",
  "suggestion",
  "feature_request",
  "report_problem",
  "onboarding_help",
  "support_request",
];

const FEEDBACK_SEVERITIES = ["low", "normal", "high", "urgent"];

const FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "planned",
  "in_progress",
  "resolved",
  "closed",
  "duplicate",
];

const FEEDBACK_PRIORITIES = ["low", "normal", "high", "urgent"];

const IMPLEMENTATION_STAGES = [
  "not_started",
  "discovery",
  "setup",
  "data_preparation",
  "pilot",
  "active",
  "blocked",
  "completed",
];

function getLabel(map, value, locale = "en") {
  return map[locale][value] ?? map.en[value] ?? value;
}

const FEEDBACK_CATEGORY_LABELS = {
  en: {
    feedback: "Feedback",
    suggestion: "Suggestion",
    feature_request: "Feature request",
    report_problem: "Report a problem",
    onboarding_help: "Onboarding help",
    support_request: "Support request",
  },
  ar: {
    feedback: "ملاحظات",
    suggestion: "اقتراح",
    feature_request: "طلب ميزة",
    report_problem: "الإبلاغ عن مشكلة",
    onboarding_help: "مساعدة في الإعداد",
    support_request: "طلب دعم",
  },
};

const FEEDBACK_SEVERITY_LABELS = {
  en: {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  },
  ar: {
    low: "منخفضة",
    normal: "عادية",
    high: "عالية",
    urgent: "عاجلة",
  },
};

const FEEDBACK_STATUS_LABELS = {
  en: {
    new: "New",
    triaged: "Triaged",
    planned: "Planned",
    in_progress: "In progress",
    resolved: "Resolved",
    closed: "Closed",
    duplicate: "Duplicate",
  },
  ar: {
    new: "جديدة",
    triaged: "تم فرزها",
    planned: "مخطط لها",
    in_progress: "قيد التنفيذ",
    resolved: "تم حلها",
    closed: "مغلقة",
    duplicate: "مكررة",
  },
};

const FEEDBACK_PRIORITY_LABELS = {
  en: {
    low: "Low",
    normal: "Normal",
    high: "High",
    urgent: "Urgent",
  },
  ar: {
    low: "منخفضة",
    normal: "عادية",
    high: "عالية",
    urgent: "عاجلة",
  },
};

const FEEDBACK_SOURCE_LABELS = {
  en: {
    web: "Web",
    dashboard: "Dashboard",
    portal: "Portal",
  },
  ar: {
    web: "الويب",
    dashboard: "لوحة التحكم",
    portal: "البوابة",
  },
};

const IMPLEMENTATION_STAGE_LABELS = {
  en: {
    not_started: "Not started",
    discovery: "Discovery",
    setup: "Setup",
    data_preparation: "Data preparation",
    pilot: "Pilot",
    active: "Active",
    blocked: "Blocked",
    completed: "Completed",
  },
  ar: {
    not_started: "لم يبدأ",
    discovery: "الاكتشاف",
    setup: "الإعداد",
    data_preparation: "تجهيز البيانات",
    pilot: "المرحلة التجريبية",
    active: "نشط",
    blocked: "معلّق",
    completed: "مكتمل",
  },
};

const DEFAULT_IMPLEMENTATION_CHECKLIST = {
  business_profile: false,
  branches: false,
  team: false,
  services: false,
  customers: false,
  vehicles: false,
  quotes: false,
  jobs: false,
  complaints: false,
  documents: false,
  customer_portal: false,
  notifications: false,
  billing: false,
};

const feedbackReportSubmissionSchema = z.object({
  businessId: z.string().uuid(),
  customerId: z.string().uuid().optional(),
  category: z.enum(FEEDBACK_CATEGORIES),
  severity: z.enum(FEEDBACK_SEVERITIES),
  title: z.string().trim().min(1).max(180),
  description: z.string().trim().min(1).max(5000),
  pageUrl: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .transform((value) => (value?.length ? value : undefined)),
  browserInfo: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => (value?.length ? value : undefined)),
  source: z.enum(["web", "dashboard", "portal"]).default("web"),
  locale: z.enum(["en", "ar"]).default("en"),
});

const feedbackReportUpdateSchema = z.object({
  feedbackReportId: z.string().uuid(),
  status: z.enum(FEEDBACK_STATUSES),
  priority: z.enum(FEEDBACK_PRIORITIES),
});

const implementationProgressSchema = z.object({
  businessId: z.string().uuid(),
  stage: z.enum(IMPLEMENTATION_STAGES),
  notes: z
    .string()
    .trim()
    .max(4000)
    .optional()
    .transform((value) => (value?.length ? value : undefined)),
});

function getFeedbackCategoryLabel(value, locale = "en") {
  return getLabel(FEEDBACK_CATEGORY_LABELS, value, locale);
}

function getFeedbackSeverityLabel(value, locale = "en") {
  return getLabel(FEEDBACK_SEVERITY_LABELS, value, locale);
}

function getFeedbackStatusLabel(value, locale = "en") {
  return getLabel(FEEDBACK_STATUS_LABELS, value, locale);
}

function getFeedbackPriorityLabel(value, locale = "en") {
  return getLabel(FEEDBACK_PRIORITY_LABELS, value, locale);
}

function getFeedbackSourceLabel(value, locale = "en") {
  return FEEDBACK_SOURCE_LABELS[locale][value] ?? FEEDBACK_SOURCE_LABELS[locale].web;
}

function getImplementationStageLabel(value, locale = "en") {
  return getLabel(IMPLEMENTATION_STAGE_LABELS, value, locale);
}

export {
  DEFAULT_IMPLEMENTATION_CHECKLIST,
  FEEDBACK_CATEGORIES,
  FEEDBACK_PRIORITIES,
  FEEDBACK_SEVERITIES,
  FEEDBACK_STATUSES,
  IMPLEMENTATION_STAGES,
  feedbackReportSubmissionSchema,
  feedbackReportUpdateSchema,
  getFeedbackCategoryLabel,
  getFeedbackPriorityLabel,
  getFeedbackSeverityLabel,
  getFeedbackSourceLabel,
  getFeedbackStatusLabel,
  getImplementationStageLabel,
  implementationProgressSchema,
};
