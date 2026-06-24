export const NOTIFICATION_CHANNELS = ["email", "sms"];

export const NOTIFICATION_TEMPLATE_KEYS = [
  "quote_sent",
  "quote_approved",
  "quote_rejected",
  "job_status_changed",
  "job_completed",
  "complaint_submitted",
  "complaint_status_changed",
  "feedback_submitted",
  "vehicle_safety_critical",
];

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

const TEMPLATES = {
  quote_sent: {
    en: {
      subject: "Quote {{quoteNumber}} is ready",
      body:
        "Hello {{customerName}}, {{businessName}} has sent quote {{quoteNumber}} for review. Open your Revora portal to approve or decline it.",
      sms:
        "{{businessName}} sent quote {{quoteNumber}}. Open your Revora portal to review it.",
    },
    ar: {
      subject: "عرض السعر {{quoteNumber}} جاهز",
      body:
        "مرحباً {{customerName}}، أرسل {{businessName}} عرض السعر {{quoteNumber}} للمراجعة. افتح بوابة Revora للموافقة أو الرفض.",
      sms:
        "أرسل {{businessName}} عرض السعر {{quoteNumber}}. افتح بوابة Revora للمراجعة.",
    },
  },
  quote_approved: {
    en: {
      subject: "Quote {{quoteNumber}} was approved",
      body: "Quote {{quoteNumber}} was approved by {{customerName}}.",
      sms: "Quote {{quoteNumber}} was approved by {{customerName}}.",
    },
    ar: {
      subject: "تمت الموافقة على عرض السعر {{quoteNumber}}",
      body: "تمت الموافقة على عرض السعر {{quoteNumber}} بواسطة {{customerName}}.",
      sms: "تمت الموافقة على عرض السعر {{quoteNumber}} بواسطة {{customerName}}.",
    },
  },
  quote_rejected: {
    en: {
      subject: "Quote {{quoteNumber}} was declined",
      body: "Quote {{quoteNumber}} was declined by {{customerName}}.",
      sms: "Quote {{quoteNumber}} was declined by {{customerName}}.",
    },
    ar: {
      subject: "تم رفض عرض السعر {{quoteNumber}}",
      body: "تم رفض عرض السعر {{quoteNumber}} بواسطة {{customerName}}.",
      sms: "تم رفض عرض السعر {{quoteNumber}} بواسطة {{customerName}}.",
    },
  },
  job_status_changed: {
    en: {
      subject: "Job update: {{jobTitle}}",
      body:
        "Hello {{customerName}}, {{businessName}} updated {{jobTitle}} to {{statusLabel}}. Check your Revora portal for details.",
      sms:
        "{{businessName}} updated {{jobTitle}} to {{statusLabel}}. Check your Revora portal.",
    },
    ar: {
      subject: "تحديث المهمة: {{jobTitle}}",
      body:
        "مرحباً {{customerName}}، حدّث {{businessName}} المهمة {{jobTitle}} إلى {{statusLabel}}. تحقق من بوابة Revora للتفاصيل.",
      sms:
        "حدّث {{businessName}} المهمة {{jobTitle}} إلى {{statusLabel}}. تحقق من بوابة Revora.",
    },
  },
  job_completed: {
    en: {
      subject: "Job completed: {{jobTitle}}",
      body:
        "Hello {{customerName}}, {{businessName}} marked {{jobTitle}} as completed. Your service record is available in Revora.",
      sms:
        "{{businessName}} marked {{jobTitle}} as completed. Check Revora for the service record.",
    },
    ar: {
      subject: "اكتملت المهمة: {{jobTitle}}",
      body:
        "مرحباً {{customerName}}، وضع {{businessName}} المهمة {{jobTitle}} كمنجزة. سجل الخدمة متاح في Revora.",
      sms:
        "وضع {{businessName}} المهمة {{jobTitle}} كمنجزة. تحقق من Revora لسجل الخدمة.",
    },
  },
  complaint_submitted: {
    en: {
      subject: "Complaint received: {{subject}}",
      body:
        "Revora recorded complaint {{subject}} for {{customerName}}. The team can review it in the notification center.",
      sms: "Complaint received: {{subject}}.",
    },
    ar: {
      subject: "تم استلام الشكوى: {{subject}}",
      body:
        "سجلت Revora الشكوى {{subject}} للعميل {{customerName}}. يمكن للفريق مراجعتها في مركز الإشعارات.",
      sms: "تم استلام الشكوى: {{subject}}.",
    },
  },
  complaint_status_changed: {
    en: {
      subject: "Complaint update: {{subject}}",
      body:
        "Hello {{customerName}}, {{businessName}} updated your complaint {{subject}} to {{statusLabel}}.",
      sms:
        "{{businessName}} updated your complaint {{subject}} to {{statusLabel}}.",
    },
    ar: {
      subject: "تحديث الشكوى: {{subject}}",
      body:
        "مرحباً {{customerName}}، حدّث {{businessName}} شكواك {{subject}} إلى {{statusLabel}}.",
      sms:
        "حدّث {{businessName}} شكواك {{subject}} إلى {{statusLabel}}.",
    },
  },
  feedback_submitted: {
    en: {
      subject: "Feedback received: {{title}}",
      body:
        "Revora received feedback {{title}} from {{customerName}}. Review it in the feedback inbox.",
      sms: "Feedback received: {{title}}.",
    },
    ar: {
      subject: "تم استلام الملاحظات: {{title}}",
      body:
        "استلمت Revora الملاحظة {{title}} من {{customerName}}. راجعها في صندوق الملاحظات.",
      sms: "تم استلام الملاحظات: {{title}}.",
    },
  },
  vehicle_safety_critical: {
    en: {
      subject: "Safety-critical vehicle warning",
      body:
        "Hello {{customerName}}, {{businessName}} recorded a safety-critical warning for {{vehicleLabel}}. Do not ignore safety warnings; contact the workshop.",
      sms:
        "{{businessName}} recorded a safety-critical warning for {{vehicleLabel}}. Contact the workshop.",
    },
    ar: {
      subject: "تحذير سلامة حرج للمركبة",
      body:
        "مرحباً {{customerName}}، سجل {{businessName}} تحذير سلامة حرج للمركبة {{vehicleLabel}}. لا تتجاهل تحذيرات السلامة وتواصل مع الورشة.",
      sms:
        "سجل {{businessName}} تحذير سلامة حرج للمركبة {{vehicleLabel}}. تواصل مع الورشة.",
    },
  },
};

export function normalizeNotificationLocale(locale) {
  return locale === "ar" ? "ar" : "en";
}

export function redactNotificationText(value, replacement = "record") {
  return String(value ?? "").replace(UUID_PATTERN, replacement);
}

function cleanValue(value) {
  const text = redactNotificationText(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177).trim()}...` : text;
}

export function isNotificationChannel(value) {
  return NOTIFICATION_CHANNELS.includes(value);
}

export function getNotificationTemplate(templateKey, locale = "en") {
  const template = TEMPLATES[templateKey];
  if (!template) return null;
  return template[normalizeNotificationLocale(locale)] ?? template.en;
}

export function renderNotificationTemplate({
  channel = "email",
  locale = "en",
  templateKey,
  variables = {},
}) {
  const template = getNotificationTemplate(templateKey, locale);
  if (!template) {
    return {
      body:
        normalizeNotificationLocale(locale) === "ar"
          ? "لديك تحديث جديد في Revora."
          : "You have a new update in Revora.",
      subject:
        normalizeNotificationLocale(locale) === "ar"
          ? "تحديث من Revora"
          : "Revora update",
    };
  }

  const sourceBody = channel === "sms" ? template.sms : template.body;
  const apply = (value) =>
    redactNotificationText(String(value).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_match, key) =>
      cleanValue(variables[key] ?? ""),
    ));

  return {
    body: apply(sourceBody),
    subject: apply(template.subject),
  };
}
