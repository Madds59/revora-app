// Privacy Policy — DRAFT pending review by qualified UAE counsel.
//
// Every factual statement here is taken from the verified data flows of this
// codebase (see docs/security/PRIVACY_IMPACT_ASSESSMENT.md and the 2026-09-12
// audit): Supabase (Seoul region), Vercel, Stripe, OpenAI, NHTSA vPIC, and
// Resend/Twilio when live sending is enabled. No analytics or advertising
// trackers exist. If a data flow changes, this document must change with it.
//
// Tokens: {entityName} {address} {email} — replaced at render from
// lib/legal/business.js. Section counts MUST match between locales (tested).

/** @type {import("../types").LegalContent} */
export const privacy = {
  en: {
    title: "Privacy Policy",
    updated: "2026-09-12",
    intro: [
      "This Privacy Policy explains how {entityName} (\"Revora\", \"we\", \"us\") collects, uses, stores and shares personal data when you use the Revora platform, the customer portal and related services (the \"Service\").",
      "Revora is a platform used by automotive service businesses (\"Workshops\") to manage their customers, vehicles, quotations, jobs, invoices and complaints. Depending on who you are, Revora acts in different roles, which we explain in Section 1.",
    ],
    sections: [
      {
        heading: "1. Who is responsible for your data",
        paragraphs: [
          "For the accounts of Workshop owners, managers, staff and customer-portal users (email address, name, password, preferences, sign-in records), {entityName} is the data controller.",
          "For the customer, vehicle, quotation, job, invoice, complaint and document records that a Workshop enters into Revora about its own customers, the Workshop is the data controller and Revora is a data processor acting on the Workshop's instructions. If you are a customer of a Workshop, the Workshop decides why and how your data is used; please direct questions about that use to the Workshop first. Revora will assist the Workshop in responding.",
        ],
      },
      {
        heading: "2. What personal data we process",
        paragraphs: ["We process only the data needed to run the Service:"],
        bullets: [
          "Account data: name, email address, hashed password, preferred language, account type, multi-factor authentication settings, and the date and version of the terms you accepted.",
          "Business data: workshop name, legal name, address, branches, services, logo, Tax Registration Number (TRN) and team membership roles.",
          "Customer records entered by Workshops: customer name, phone, email, address, preferred language and marketing-consent flag.",
          "Vehicle data: make, model, year, plate number, VIN, colour, odometer readings, service history and maintenance reminders.",
          "Quotations and approvals: quotation contents, the typed name you use to approve a quotation, the time of approval, the browser identifier (user agent) of the device used, and any note you add.",
          "Jobs, invoices, appointments, complaints, feedback and ratings, including messages exchanged with the Workshop.",
          "Files you or a Workshop upload, such as photos of vehicles or damage, documents and business logos. These may contain personal data (for example a licence plate or a person in a photo).",
          "Vehicle Intelligence inputs: symptom descriptions, warning lights, mileage, diagnostic trouble codes and VIN that you submit for AI-assisted guidance.",
          "Notification records: which emails or SMS messages were queued, sent or skipped, and your notification preferences.",
          "Technical data: IP address, browser type, device type, pages requested and timestamps, kept in hosting and security logs.",
        ],
      },
      {
        heading: "3. Why we process data and on what basis",
        paragraphs: ["We rely on the following bases under the UAE Personal Data Protection Law (Federal Decree-Law No. 45 of 2021) and, where it applies, other data-protection law:"],
        bullets: [
          "Performing our contract with you: providing the Service, authenticating you, recording quotation approvals, issuing invoices and sending transactional notifications.",
          "Legitimate interests: securing the Service, preventing fraud and abuse, keeping audit logs, and improving reliability. We do not use your data for advertising.",
          "Consent: marketing communications, optional notification channels, and processing of vehicle symptom text by our AI provider where consent is required. You can withdraw consent at any time.",
          "Legal obligations: keeping tax and accounting records required by UAE law (including VAT record-keeping), responding to lawful requests from authorities, and honouring your data-protection rights.",
        ],
      },
      {
        heading: "4. Who we share data with (sub-processors)",
        paragraphs: [
          "We do not sell personal data and we do not share it with advertisers. The Service does not load third-party analytics, advertising or social-media trackers. We share data only with the service providers below, each bound by contractual terms limiting use to the purposes we specify:",
        ],
        bullets: [
          "Supabase, Inc. — database, authentication, file storage and access control. Data is hosted in the Republic of Korea (Seoul region).",
          "Vercel, Inc. — application hosting, edge network and request logs (United States).",
          "Stripe, Inc. — subscription billing for Workshop accounts. Card details are entered on Stripe's hosted pages and are never stored by Revora.",
          "OpenAI, L.L.C. — AI-assisted vehicle guidance. We send only the vehicle symptom text, warning lights, mileage, diagnostic codes and VIN-derived make/model/year. We do not send customer names, phone numbers or email addresses.",
          "United States National Highway Traffic Safety Administration (NHTSA) vPIC — a public API used to decode a VIN into make, model and year. Only the VIN is sent.",
          "Resend (email) and Twilio (SMS) — delivery of notifications, only when a Workshop has enabled live sending. These providers receive the recipient's email address or phone number and the message text.",
          "Professional advisers, auditors and authorities where required by law or to protect legal rights.",
        ],
      },
      {
        heading: "5. International transfers",
        paragraphs: [
          "Our providers store and process data outside the United Arab Emirates, including in the Republic of Korea and the United States. Where UAE law requires it, we transfer personal data only under appropriate safeguards such as contractual data-protection commitments with the provider, or with your explicit consent after informing you of the risks. You can ask us at {email} for information about the safeguards in place.",
        ],
      },
      {
        heading: "6. How long we keep data",
        paragraphs: [
          "We keep account data for as long as your account is active and for a short grace period afterwards so it can be recovered. Workshops' customer, vehicle, quotation, job and invoice records are kept for as long as the Workshop's subscription is active and for the period UAE commercial and tax law requires financial records to be retained (currently five years). Signed approvals, invoices and audit logs are treated as legal records and are not routinely deleted. Notification logs are kept for a limited operational period and then anonymised or deleted. Uploaded files follow the retention of the record they belong to.",
        ],
      },
      {
        heading: "7. Your rights",
        paragraphs: [
          "Subject to applicable law, you may ask to access, correct, delete or receive a copy of your personal data, to restrict or object to certain processing, and to withdraw consent. Requests are currently handled manually: email {email} from the address linked to your account. We will verify your identity and respond within the time required by law. If you are a customer of a Workshop, we may need to involve that Workshop as the controller of your record. You also have the right to lodge a complaint with the UAE Data Office or another competent authority.",
        ],
      },
      {
        heading: "8. Security",
        paragraphs: [
          "Every record is isolated per Workshop using database row-level security, so one Workshop can never read another's data. Data is encrypted in transit. Private files are served only through short-lived signed links. Multi-factor authentication is enforced for platform administrators and available to all accounts. No system is perfectly secure; if we become aware of a breach affecting your data we will notify you and the relevant authority as required by law.",
        ],
      },
      {
        heading: "9. Cookies",
        paragraphs: [
          "Revora uses only strictly necessary cookies: your sign-in session, your language preference and your currently selected workshop. There are no analytics or advertising cookies, so no cookie consent banner is shown. Details are in our Cookie Policy.",
        ],
      },
      {
        heading: "10. Notifications and marketing",
        paragraphs: [
          "Workshops may send you transactional notifications about quotations, jobs, appointments, invoices, complaints and maintenance reminders by email or SMS. You can turn each channel off in the customer portal under Settings, or ask the Workshop to do so. Marketing messages are sent only where you have given consent, which the Workshop records against your customer profile, and every marketing message includes a way to opt out.",
        ],
      },
      {
        heading: "11. AI-assisted features",
        paragraphs: [
          "Vehicle Intelligence features produce advisory guidance generated with the help of an AI model. The output is not a professional inspection and must be reviewed by a qualified workshop or service advisor. Inputs and outputs are stored with the related vehicle record so the Workshop can review them, and are shared with our AI provider only as described in Section 4.",
        ],
      },
      {
        heading: "12. Children",
        paragraphs: [
          "The Service is intended for businesses and adult customers. We do not knowingly collect personal data from anyone under 18. If you believe a child has provided data to us, contact {email} and we will delete it.",
        ],
      },
      {
        heading: "13. Changes to this policy",
        paragraphs: [
          "We will update this policy when our data practices change. The date at the top shows the latest version. For material changes we will notify account holders by email or an in-app notice before the change takes effect.",
        ],
      },
      {
        heading: "14. Contact",
        paragraphs: [
          "{entityName}, {address}. Privacy enquiries: {email}.",
        ],
      },
    ],
  },
  ar: {
    title: "سياسة الخصوصية",
    updated: "2026-09-12",
    intro: [
      "توضح سياسة الخصوصية هذه كيف تقوم {entityName} (\"ريفورا\"، \"نحن\") بجمع البيانات الشخصية واستخدامها وتخزينها ومشاركتها عند استخدامك لمنصة ريفورا وبوابة العملاء والخدمات المرتبطة بها (\"الخدمة\").",
      "ريفورا منصة تستخدمها منشآت خدمات السيارات (\"الورش\") لإدارة عملائها ومركباتها وعروض الأسعار وأوامر العمل والفواتير والشكاوى. وبحسب صفتك، تعمل ريفورا بأدوار مختلفة نوضحها في القسم 1.",
    ],
    sections: [
      {
        heading: "1. من المسؤول عن بياناتك",
        paragraphs: [
          "بالنسبة لحسابات مالكي الورش والمديرين والموظفين ومستخدمي بوابة العملاء (البريد الإلكتروني، الاسم، كلمة المرور، التفضيلات، سجلات تسجيل الدخول)، تكون {entityName} هي المتحكم في البيانات.",
          "أما سجلات العملاء والمركبات وعروض الأسعار وأوامر العمل والفواتير والشكاوى والمستندات التي تُدخلها الورشة في ريفورا عن عملائها، فالورشة هي المتحكم في البيانات وريفورا معالج للبيانات يعمل وفق تعليمات الورشة. إذا كنت عميلاً لدى ورشة، فإن الورشة هي من يقرر سبب وطريقة استخدام بياناتك؛ يرجى توجيه استفساراتك بشأن هذا الاستخدام إلى الورشة أولاً، وستساعد ريفورا الورشة في الرد.",
        ],
      },
      {
        heading: "2. البيانات الشخصية التي نعالجها",
        paragraphs: ["نعالج فقط البيانات اللازمة لتشغيل الخدمة:"],
        bullets: [
          "بيانات الحساب: الاسم، البريد الإلكتروني، كلمة المرور (مشفرة)، اللغة المفضلة، نوع الحساب، إعدادات المصادقة متعددة العوامل، وتاريخ ونسخة الشروط التي وافقت عليها.",
          "بيانات المنشأة: اسم الورشة، الاسم القانوني، العنوان، الفروع، الخدمات، الشعار، رقم التسجيل الضريبي (TRN)، وأدوار أعضاء الفريق.",
          "سجلات العملاء التي تُدخلها الورش: اسم العميل، الهاتف، البريد الإلكتروني، العنوان، اللغة المفضلة، ومؤشر الموافقة التسويقية.",
          "بيانات المركبة: الصانع، الطراز، السنة، رقم اللوحة، رقم الهيكل (VIN)، اللون، قراءات العداد، سجل الصيانة وتذكيرات الصيانة.",
          "عروض الأسعار والموافقات: محتوى عرض السعر، الاسم الذي تكتبه للموافقة على عرض السعر، وقت الموافقة، معرّف المتصفح (user agent) للجهاز المستخدم، وأي ملاحظة تضيفها.",
          "أوامر العمل والفواتير والمواعيد والشكاوى والملاحظات والتقييمات، بما في ذلك الرسائل المتبادلة مع الورشة.",
          "الملفات التي ترفعها أنت أو الورشة، مثل صور المركبات أو الأضرار والمستندات وشعارات المنشآت. وقد تحتوي على بيانات شخصية (مثل لوحة المركبة أو شخص في الصورة).",
          "مدخلات ذكاء المركبات: وصف الأعراض، أضواء التحذير، المسافة المقطوعة، رموز الأعطال ورقم الهيكل التي تقدمها للحصول على إرشادات بمساعدة الذكاء الاصطناعي.",
          "سجلات الإشعارات: رسائل البريد أو الرسائل النصية التي تم وضعها في قائمة الانتظار أو إرسالها أو تخطيها، وتفضيلات الإشعارات الخاصة بك.",
          "البيانات التقنية: عنوان IP، نوع المتصفح، نوع الجهاز، الصفحات المطلوبة والأوقات، وتُحفظ في سجلات الاستضافة والأمان.",
        ],
      },
      {
        heading: "3. لماذا نعالج البيانات وعلى أي أساس",
        paragraphs: ["نستند إلى الأسس التالية بموجب قانون حماية البيانات الشخصية في دولة الإمارات (المرسوم بقانون اتحادي رقم 45 لسنة 2021) وقوانين حماية البيانات الأخرى حيثما تنطبق:"],
        bullets: [
          "تنفيذ عقدنا معك: تقديم الخدمة، التحقق من هويتك، تسجيل الموافقات على عروض الأسعار، إصدار الفواتير، وإرسال الإشعارات التشغيلية.",
          "المصالح المشروعة: تأمين الخدمة، منع الاحتيال وإساءة الاستخدام، حفظ سجلات التدقيق، وتحسين الموثوقية. لا نستخدم بياناتك لأغراض إعلانية.",
          "الموافقة: الرسائل التسويقية، قنوات الإشعار الاختيارية، ومعالجة نص أعراض المركبة لدى مزود الذكاء الاصطناعي حيثما تُشترط الموافقة. يمكنك سحب موافقتك في أي وقت.",
          "الالتزامات القانونية: حفظ السجلات الضريبية والمحاسبية التي يتطلبها قانون الإمارات (بما في ذلك سجلات ضريبة القيمة المضافة)، والاستجابة للطلبات القانونية من الجهات المختصة، والوفاء بحقوقك في حماية البيانات.",
        ],
      },
      {
        heading: "4. مع من نشارك البيانات (المعالجون من الباطن)",
        paragraphs: [
          "لا نبيع البيانات الشخصية ولا نشاركها مع المعلنين. لا تقوم الخدمة بتحميل أدوات تحليل أو إعلانات أو متتبعات لوسائل التواصل الاجتماعي من أطراف ثالثة. نشارك البيانات فقط مع مزودي الخدمة أدناه، وكل منهم ملزم بشروط تعاقدية تقصر الاستخدام على الأغراض التي نحددها:",
        ],
        bullets: [
          "Supabase, Inc. — قاعدة البيانات والمصادقة وتخزين الملفات والتحكم في الوصول. تُستضاف البيانات في جمهورية كوريا (منطقة سيول).",
          "Vercel, Inc. — استضافة التطبيق وشبكة التوزيع وسجلات الطلبات (الولايات المتحدة).",
          "Stripe, Inc. — فوترة الاشتراكات لحسابات الورش. تُدخل بيانات البطاقة على صفحات Stripe المستضافة ولا تخزنها ريفورا أبداً.",
          "OpenAI, L.L.C. — الإرشادات المتعلقة بالمركبات بمساعدة الذكاء الاصطناعي. نرسل فقط نص الأعراض وأضواء التحذير والمسافة المقطوعة ورموز الأعطال والصانع/الطراز/السنة المستخرجة من رقم الهيكل. لا نرسل أسماء العملاء أو أرقام هواتفهم أو عناوين بريدهم الإلكتروني.",
          "الإدارة الوطنية لسلامة المرور على الطرق السريعة الأمريكية (NHTSA) vPIC — واجهة برمجية عامة تُستخدم لفك ترميز رقم الهيكل إلى صانع وطراز وسنة. يُرسل رقم الهيكل فقط.",
          "Resend (البريد الإلكتروني) وTwilio (الرسائل النصية) — إيصال الإشعارات، فقط عندما تُفعّل الورشة الإرسال المباشر. يتلقى هذان المزودان عنوان البريد الإلكتروني أو رقم هاتف المستلم ونص الرسالة.",
          "المستشارون المهنيون والمدققون والجهات المختصة حيثما يقتضي القانون أو لحماية الحقوق القانونية.",
        ],
      },
      {
        heading: "5. النقل الدولي للبيانات",
        paragraphs: [
          "يقوم مزودونا بتخزين البيانات ومعالجتها خارج دولة الإمارات العربية المتحدة، بما في ذلك في جمهورية كوريا والولايات المتحدة. وحيثما يشترط قانون الإمارات ذلك، ننقل البيانات الشخصية فقط بموجب ضمانات مناسبة مثل الالتزامات التعاقدية لحماية البيانات مع المزود، أو بموافقتك الصريحة بعد إبلاغك بالمخاطر. يمكنك طلب معلومات عن الضمانات المعمول بها عبر {email}.",
        ],
      },
      {
        heading: "6. مدة الاحتفاظ بالبيانات",
        paragraphs: [
          "نحتفظ ببيانات الحساب طوال فترة نشاط حسابك ولفترة سماح قصيرة بعد ذلك لإتاحة استعادته. ونحتفظ بسجلات عملاء الورش ومركباتهم وعروض الأسعار وأوامر العمل والفواتير طوال فترة اشتراك الورشة وللمدة التي يشترطها القانون التجاري والضريبي في الإمارات للاحتفاظ بالسجلات المالية (خمس سنوات حالياً). وتُعامل الموافقات الموقعة والفواتير وسجلات التدقيق كسجلات قانونية ولا تُحذف بشكل روتيني. وتُحفظ سجلات الإشعارات لفترة تشغيلية محدودة ثم تُجهّل أو تُحذف. وتتبع الملفات المرفوعة مدة الاحتفاظ بالسجل الذي تنتمي إليه.",
        ],
      },
      {
        heading: "7. حقوقك",
        paragraphs: [
          "وفقاً للقانون المعمول به، يمكنك طلب الوصول إلى بياناتك الشخصية أو تصحيحها أو حذفها أو الحصول على نسخة منها، وتقييد بعض المعالجة أو الاعتراض عليها، وسحب موافقتك. تُعالج الطلبات حالياً يدوياً: راسلنا على {email} من عنوان البريد المرتبط بحسابك. سنتحقق من هويتك ونرد خلال المدة التي يشترطها القانون. وإذا كنت عميلاً لدى ورشة، فقد نحتاج إلى إشراك تلك الورشة بصفتها المتحكم في سجلك. كما يحق لك تقديم شكوى إلى مكتب البيانات الإماراتي أو أي جهة مختصة أخرى.",
        ],
      },
      {
        heading: "8. الأمان",
        paragraphs: [
          "يُعزل كل سجل لكل ورشة على حدة باستخدام أمان مستوى الصف في قاعدة البيانات، بحيث لا يمكن لورشة قراءة بيانات ورشة أخرى أبداً. تُشفّر البيانات أثناء النقل. وتُقدَّم الملفات الخاصة فقط عبر روابط موقعة قصيرة الأجل. وتُفرض المصادقة متعددة العوامل على مسؤولي المنصة وهي متاحة لجميع الحسابات. لا يوجد نظام آمن تماماً؛ وإذا علمنا بخرق يؤثر على بياناتك فسنخطرك أنت والجهة المختصة وفقاً لما يقتضيه القانون.",
        ],
      },
      {
        heading: "9. ملفات تعريف الارتباط",
        paragraphs: [
          "تستخدم ريفورا ملفات تعريف الارتباط الضرورية فقط: جلسة تسجيل الدخول، تفضيل اللغة، والورشة المحددة حالياً. لا توجد ملفات تعريف ارتباط للتحليلات أو الإعلانات، ولذلك لا تُعرض لافتة موافقة على ملفات تعريف الارتباط. التفاصيل في سياسة ملفات تعريف الارتباط.",
        ],
      },
      {
        heading: "10. الإشعارات والتسويق",
        paragraphs: [
          "قد ترسل لك الورش إشعارات تشغيلية بشأن عروض الأسعار وأوامر العمل والمواعيد والفواتير والشكاوى وتذكيرات الصيانة عبر البريد الإلكتروني أو الرسائل النصية. يمكنك إيقاف كل قناة من بوابة العملاء ضمن الإعدادات، أو الطلب من الورشة القيام بذلك. ولا تُرسل الرسائل التسويقية إلا بموافقتك التي تسجلها الورشة في ملفك، وتتضمن كل رسالة تسويقية وسيلة لإلغاء الاشتراك.",
        ],
      },
      {
        heading: "11. الميزات المدعومة بالذكاء الاصطناعي",
        paragraphs: [
          "تنتج ميزات ذكاء المركبات إرشادات استشارية بمساعدة نموذج ذكاء اصطناعي. والمخرجات ليست فحصاً مهنياً ويجب مراجعتها من قبل ورشة أو مستشار خدمة مؤهل. تُخزن المدخلات والمخرجات مع سجل المركبة ذي الصلة ليتسنى للورشة مراجعتها، ولا تُشارك مع مزود الذكاء الاصطناعي إلا كما هو موضح في القسم 4.",
        ],
      },
      {
        heading: "12. الأطفال",
        paragraphs: [
          "الخدمة موجهة للمنشآت والعملاء البالغين. لا نجمع عن قصد بيانات شخصية من أي شخص دون 18 عاماً. إذا كنت تعتقد أن طفلاً قدم بيانات لنا، فراسلنا على {email} وسنقوم بحذفها.",
        ],
      },
      {
        heading: "13. التغييرات على هذه السياسة",
        paragraphs: [
          "سنحدّث هذه السياسة عند تغيّر ممارساتنا في البيانات. ويوضح التاريخ في الأعلى أحدث نسخة. وبالنسبة للتغييرات الجوهرية، سنخطر أصحاب الحسابات عبر البريد الإلكتروني أو إشعار داخل التطبيق قبل سريان التغيير.",
        ],
      },
      {
        heading: "14. التواصل",
        paragraphs: [
          "{entityName}، {address}. استفسارات الخصوصية: {email}.",
        ],
      },
    ],
  },
};
