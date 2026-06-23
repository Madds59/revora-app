const IMPORT_TEMPLATES = [
  {
    slug: "branches",
    fileName: "branches.csv",
    title: { en: "Branches", ar: "الفروع" },
    description: {
      en: "Use one row per branch and keep branch_name stable.",
      ar: "استخدم صفًا واحدًا لكل فرع واحفظ branch_name بشكل ثابت.",
    },
    tips: {
      en: [
        "Use one row per branch.",
        "Keep branch_name stable and unique.",
        "Use international phone format where possible.",
      ],
      ar: [
        "استخدم صفًا واحدًا لكل فرع.",
        "اجعل branch_name ثابتًا وفريدًا.",
        "استخدم صيغة الهاتف الدولية كلما أمكن.",
      ],
    },
    headers: ["branch_name", "phone", "email", "address", "city", "manager_email"],
  },
  {
    slug: "team_members",
    fileName: "team_members.csv",
    title: { en: "Team members", ar: "أعضاء الفريق" },
    description: {
      en: "Use one row per staff member and match branch_name to your branches sheet.",
      ar: "استخدم صفًا واحدًا لكل عضو فريق وابقِ branch_name مطابقًا لملف الفروع.",
    },
    tips: {
      en: [
        "Use one row per person.",
        "Role should match a valid team role.",
        "branch_name must match the branches template.",
      ],
      ar: [
        "استخدم صفًا واحدًا لكل شخص.",
        "يجب أن يطابق role دورًا صالحًا.",
        "يجب أن يطابق branch_name ملف الفروع.",
      ],
    },
    headers: ["full_name", "email", "phone", "role", "branch_name"],
  },
  {
    slug: "customers",
    fileName: "customers.csv",
    title: { en: "Customers", ar: "العملاء" },
    description: {
      en: "Use one row per customer and avoid duplicate phone numbers.",
      ar: "استخدم صفًا واحدًا لكل عميل وتجنب تكرار أرقام الهاتف.",
    },
    tips: {
      en: [
        "Use one row per customer.",
        "Avoid duplicate phone numbers.",
        "Preferred language should be en or ar.",
      ],
      ar: [
        "استخدم صفًا واحدًا لكل عميل.",
        "تجنب تكرار أرقام الهاتف.",
        "preferred_language يجب أن تكون en أو ar.",
      ],
    },
    headers: ["full_name", "phone", "email", "preferred_language", "branch_name", "notes"],
  },
  {
    slug: "vehicles",
    fileName: "vehicles.csv",
    title: { en: "Vehicles", ar: "المركبات" },
    description: {
      en: "Use customer_email or customer_phone to connect each vehicle.",
      ar: "استخدم customer_email أو customer_phone لربط كل مركبة.",
    },
    tips: {
      en: [
        "VIN is optional but recommended.",
        "Plate number is recommended.",
        "Use customer_email or customer_phone to link vehicles to customers.",
      ],
      ar: [
        "VIN اختياري لكنه موصى به.",
        "رقم اللوحة موصى به.",
        "استخدم customer_email أو customer_phone لربط المركبات بالعملاء.",
      ],
    },
    headers: [
      "customer_email",
      "customer_phone",
      "make",
      "model",
      "year",
      "vin",
      "plate_number",
      "color",
      "mileage",
      "branch_name",
      "notes",
    ],
  },
  {
    slug: "services",
    fileName: "services.csv",
    title: { en: "Services", ar: "الخدمات" },
    description: {
      en: "Use one row per service and keep pricing numeric.",
      ar: "استخدم صفًا واحدًا لكل خدمة واحفظ السعر كقيمة رقمية.",
    },
    tips: {
      en: ["Use one row per service.", "Keep default_price numeric."],
      ar: ["استخدم صفًا واحدًا لكل خدمة.", "اجعل default_price رقمًا."],
    },
    headers: [
      "service_name",
      "category",
      "default_price",
      "estimated_duration_minutes",
      "description",
    ],
  },
  {
    slug: "quotation_items",
    fileName: "quotation_items.csv",
    title: { en: "Quotation items", ar: "بنود عروض الأسعار" },
    description: {
      en: "Prepare standard quotation line items for import later.",
      ar: "جهّز بنود عروض الأسعار القياسية للاستيراد لاحقًا.",
    },
    tips: {
      en: ["Use one row per line item.", "Keep quantity and unit_price numeric."],
      ar: ["استخدم صفًا واحدًا لكل بند.", "اجعل quantity و unit_price أرقامًا."],
    },
    headers: ["item_name", "type", "quantity", "unit_price", "tax_rate", "description"],
  },
];

const TEMPLATE_MAP = new Map(IMPORT_TEMPLATES.map((template) => [template.slug, template]));

function getImportTemplate(slug) {
  return TEMPLATE_MAP.get(slug) ?? null;
}

function buildImportTemplateCsv(slug) {
  const template = getImportTemplate(slug);
  if (!template) return null;
  return `${template.headers.join(",")}\n`;
}

export { IMPORT_TEMPLATES, buildImportTemplateCsv, getImportTemplate };
