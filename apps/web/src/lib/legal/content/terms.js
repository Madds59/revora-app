// Terms of Service — DRAFT pending review by qualified UAE counsel.
//
// Structure follows docs/security/TERMS_PRIVACY_REQUIRED_CLAUSES.md. Product
// behaviour described here (typed-name electronic approvals, AI advisory
// output, Stripe-hosted billing, workshop-managed notifications) matches the
// code as of 2026-09-12; keep it that way.
//
// Tokens: {entityName} {address} {email}. Section counts MUST match between
// locales (tested).

/** @type {import("../types").LegalContent} */
export const terms = {
  en: {
    title: "Terms of Service",
    updated: "2026-09-12",
    intro: [
      "These Terms of Service (\"Terms\") are a legal agreement between you and {entityName} (\"Revora\", \"we\", \"us\") governing your use of the Revora platform, the customer portal, and related services (the \"Service\"). By creating an account or using the Service you agree to these Terms and to our Privacy Policy.",
      "If you are accepting on behalf of a business, you confirm that you are authorised to bind that business, and \"you\" refers to the business.",
    ],
    sections: [
      {
        heading: "1. Who may use the Service",
        paragraphs: [
          "You must be at least 18 years old and able to enter into a binding contract. The Service is offered to (a) automotive service businesses and their authorised staff (\"Workshops\"), and (b) customers of Workshops who are invited to use the customer portal (\"Customers\"). Platform administrator access is granted only by Revora.",
        ],
      },
      {
        heading: "2. Accounts and security",
        paragraphs: [
          "You are responsible for keeping your credentials confidential and for all activity under your account. Use a strong password, enable multi-factor authentication where offered, and tell us at {email} immediately if you suspect unauthorised access. Workshop owners are responsible for the staff they invite and for removing access when staff leave.",
        ],
      },
      {
        heading: "3. Workshop responsibilities for customer data",
        paragraphs: [
          "When a Workshop enters or uploads information about its customers, vehicles, jobs or invoices, the Workshop is the controller of that data and Revora processes it on the Workshop's behalf. The Workshop must: have a lawful basis for collecting and using each customer's data; give customers the notices required by law; obtain and record consent before sending marketing messages; keep records accurate; and only invite customers to the portal who are genuinely its customers. The data-processing terms in our Data Processing Addendum form part of these Terms for Workshops.",
        ],
      },
      {
        heading: "4. Customer portal and electronic approvals",
        paragraphs: [
          "Customers use the portal to review quotations, approve or decline them, track jobs, view invoices and documents, request appointments and submit complaints or feedback.",
          "When you approve a quotation you tick an acknowledgement and type your name. That typed name, the time of approval and your device's browser identifier are recorded and constitute your electronic signature under Federal Decree-Law No. 46 of 2021 on Electronic Transactions and Trust Services. An approval is your instruction to the Workshop to carry out the quoted work at the quoted price and is intended to be binding between you and the Workshop.",
          "Revora provides the platform only. Revora is not a party to any contract between a Workshop and its Customer, does not perform vehicle work, and is not responsible for the quality, pricing, timing or outcome of any service, or for any invoice issued by a Workshop.",
        ],
      },
      {
        heading: "5. Subscriptions, fees and billing",
        paragraphs: [
          "Workshop plans are billed by subscription through Stripe. Fees, billing cycle and included features are shown when you subscribe. Subscriptions renew automatically at the end of each billing period unless cancelled through the billing portal before renewal. Prices exclude VAT unless stated; applicable VAT will be added. We may change prices with at least 30 days' notice before the next renewal. Cancellation and refund terms are set out in our Refund Policy, which forms part of these Terms.",
        ],
      },
      {
        heading: "6. Acceptable use",
        paragraphs: ["You must not:"],
        bullets: [
          "use the Service to send unsolicited or unlawful messages, or to contact people who have not consented where consent is required;",
          "upload content that is unlawful, infringing, defamatory, or that you do not have the right to share (including photos of people or documents without permission);",
          "attempt to access another Workshop's or Customer's data, probe or bypass security controls, or overload the Service;",
          "reverse engineer, resell or sublicense the Service without our written agreement;",
          "use AI-assisted features to seek instructions for disabling or bypassing vehicle safety systems.",
        ],
      },
      {
        heading: "7. Your content",
        paragraphs: [
          "You keep ownership of the data and files you upload (\"Your Content\"). You grant Revora a worldwide, non-exclusive licence to host, store, process, display and transmit Your Content solely to provide and secure the Service and as permitted by the Privacy Policy. You are responsible for Your Content and confirm you have all rights and consents needed to upload it, including for business logos, vehicle photos and any personal data it contains.",
        ],
      },
      {
        heading: "8. Vehicle Intelligence (AI-assisted features)",
        paragraphs: [
          "Vehicle Intelligence features (symptom diagnosis, diagnostic code decoding, VIN decoding, health checks, quote drafts) produce advisory output generated in part by an AI model and by public vehicle databases. This output may be incomplete or wrong. It is not a professional inspection, not a diagnosis, and not a substitute for examination by a qualified technician. Where output indicates a possible safety-critical condition, stop driving and contact a workshop. Workshops must review AI output before relying on it or presenting it to a Customer. To the fullest extent permitted by law, Revora accepts no liability for decisions made in reliance on AI-assisted output.",
        ],
      },
      {
        heading: "9. Invoices and tax documents",
        paragraphs: [
          "Revora provides tools that help Workshops issue quotations and invoices, including fields for a Tax Registration Number and per-line VAT. The Workshop is solely responsible for ensuring that any invoice it issues meets the requirements of the UAE Federal Tax Authority and other applicable law, for the accuracy of tax amounts, and for its own record-keeping and filings. Revora does not certify that generated documents are compliant tax invoices.",
        ],
      },
      {
        heading: "10. Notifications",
        paragraphs: [
          "Workshops control whether email and SMS notifications are sent to their Customers and are responsible for having the consents required by UAE telecommunications and data-protection rules, including for marketing content and sender registration. Customers can disable each channel in the portal. Revora may suspend notification sending for any account that generates complaints, bounces or apparent spam.",
        ],
      },
      {
        heading: "11. Intellectual property",
        paragraphs: [
          "The Service, including its software, design, brand and documentation, is owned by Revora or its licensors and is protected by intellectual-property law. Except for the limited right to use the Service under these Terms, no rights are granted to you. Feedback you give us may be used without obligation to you.",
        ],
      },
      {
        heading: "12. Availability and changes",
        paragraphs: [
          "We aim to keep the Service available but do not guarantee uninterrupted or error-free operation. We may modify, add or remove features, and may mark some features as beta, preview or coming soon; those features may change or be withdrawn without notice. We will give reasonable notice of changes that materially reduce core functionality of a paid plan.",
        ],
      },
      {
        heading: "13. Disclaimers and limitation of liability",
        paragraphs: [
          "Except as expressly stated in these Terms, the Service is provided \"as is\" and \"as available\", and we disclaim all implied warranties to the extent permitted by law.",
          "To the fullest extent permitted by UAE law: (a) Revora is not liable for indirect, consequential, special or punitive losses, or for loss of profit, business, data or goodwill; (b) Revora's total liability arising out of or relating to the Service in any 12-month period is limited to the fees you paid to Revora in that period, or AED 1,000 if you paid no fees; and (c) nothing in these Terms limits liability that cannot be limited by law, including for fraud or gross negligence.",
        ],
      },
      {
        heading: "14. Indemnity",
        paragraphs: [
          "Workshops will defend and indemnify Revora against third-party claims, fines and reasonable costs arising from the Workshop's breach of Section 3, 6, 7, 9 or 10, or from any dispute between the Workshop and its Customers.",
        ],
      },
      {
        heading: "15. Suspension and termination",
        paragraphs: [
          "You may stop using the Service at any time; Workshops cancel through the billing portal. We may suspend or terminate access for breach of these Terms, non-payment, legal requirement, or risk to the Service or other users, giving notice where reasonably possible. After termination a Workshop may request an export of its data within 30 days, after which we may delete it, subject to the retention periods described in the Privacy Policy.",
        ],
      },
      {
        heading: "16. Governing law and disputes",
        paragraphs: [
          "These Terms are governed by the laws of the United Arab Emirates as applicable in the jurisdiction where {entityName} is registered. Any dispute will be subject to the exclusive jurisdiction of the competent courts of that jurisdiction, without prejudice to any consumer rights that cannot be excluded under UAE law. Before starting proceedings, please contact {email}; we will try in good faith to resolve the matter.",
        ],
      },
      {
        heading: "17. Changes to these Terms",
        paragraphs: [
          "We may update these Terms. The date at the top shows the current version. For material changes we will notify account holders by email or an in-app notice at least 14 days before they take effect. Continued use after the effective date means you accept the updated Terms.",
        ],
      },
      {
        heading: "18. Contact",
        paragraphs: [
          "{entityName}, {address}. Legal enquiries: {email}.",
        ],
      },
    ],
  },
  ar: {
    title: "شروط الخدمة",
    updated: "2026-09-12",
    intro: [
      "تُشكّل شروط الخدمة هذه (\"الشروط\") اتفاقية قانونية بينك وبين {entityName} (\"ريفورا\"، \"نحن\") تنظم استخدامك لمنصة ريفورا وبوابة العملاء والخدمات المرتبطة بها (\"الخدمة\"). بإنشاء حساب أو باستخدام الخدمة فإنك توافق على هذه الشروط وعلى سياسة الخصوصية الخاصة بنا.",
      "إذا كنت توافق نيابةً عن منشأة، فإنك تؤكد أنك مخوّل بإلزام تلك المنشأة، وتشير كلمة \"أنت\" إلى المنشأة.",
    ],
    sections: [
      {
        heading: "1. من يحق له استخدام الخدمة",
        paragraphs: [
          "يجب أن يكون عمرك 18 عاماً على الأقل وأن تكون قادراً على إبرام عقد ملزم. تُقدَّم الخدمة إلى (أ) منشآت خدمات السيارات وموظفيها المخولين (\"الورش\")، و(ب) عملاء الورش الذين تتم دعوتهم لاستخدام بوابة العملاء (\"العملاء\"). ولا يُمنح وصول مسؤول المنصة إلا من قبل ريفورا.",
        ],
      },
      {
        heading: "2. الحسابات والأمان",
        paragraphs: [
          "أنت مسؤول عن الحفاظ على سرية بيانات اعتمادك وعن جميع الأنشطة التي تتم عبر حسابك. استخدم كلمة مرور قوية، وفعّل المصادقة متعددة العوامل حيثما تتوفر، وأبلغنا فوراً على {email} إذا اشتبهت في وصول غير مصرح به. ومالكو الورش مسؤولون عن الموظفين الذين يدعونهم وعن إلغاء وصولهم عند مغادرتهم.",
        ],
      },
      {
        heading: "3. مسؤوليات الورشة تجاه بيانات العملاء",
        paragraphs: [
          "عندما تُدخل الورشة أو ترفع معلومات عن عملائها أو مركباتهم أو أوامر العمل أو الفواتير، تكون الورشة هي المتحكم في تلك البيانات وتعالجها ريفورا نيابةً عنها. ويجب على الورشة: أن يكون لديها أساس قانوني لجمع واستخدام بيانات كل عميل؛ وأن تقدم للعملاء الإشعارات التي يقتضيها القانون؛ وأن تحصل على الموافقة وتسجلها قبل إرسال رسائل تسويقية؛ وأن تحافظ على دقة السجلات؛ وألا تدعو إلى البوابة إلا من هم عملاؤها فعلاً. وتُشكّل شروط معالجة البيانات في ملحق معالجة البيانات جزءاً من هذه الشروط بالنسبة للورش.",
        ],
      },
      {
        heading: "4. بوابة العملاء والموافقات الإلكترونية",
        paragraphs: [
          "يستخدم العملاء البوابة لمراجعة عروض الأسعار والموافقة عليها أو رفضها، ومتابعة أوامر العمل، وعرض الفواتير والمستندات، وطلب المواعيد، وتقديم الشكاوى أو الملاحظات.",
          "عند الموافقة على عرض سعر، تقوم بتحديد إقرار وكتابة اسمك. ويُسجَّل الاسم المكتوب ووقت الموافقة ومعرّف متصفح جهازك، ويشكّل ذلك توقيعك الإلكتروني بموجب المرسوم بقانون اتحادي رقم 46 لسنة 2021 بشأن المعاملات الإلكترونية وخدمات الثقة. والموافقة هي تعليماتك للورشة بتنفيذ العمل المعروض بالسعر المعروض، ويُقصد بها أن تكون ملزمة بينك وبين الورشة.",
          "تقدم ريفورا المنصة فقط. وريفورا ليست طرفاً في أي عقد بين الورشة وعميلها، ولا تنفذ أعمالاً على المركبات، وليست مسؤولة عن جودة أي خدمة أو تسعيرها أو توقيتها أو نتيجتها، ولا عن أي فاتورة تصدرها الورشة.",
        ],
      },
      {
        heading: "5. الاشتراكات والرسوم والفوترة",
        paragraphs: [
          "تُفوتر خطط الورش بالاشتراك عبر Stripe. وتُعرض الرسوم ودورة الفوترة والميزات المشمولة عند الاشتراك. وتتجدد الاشتراكات تلقائياً في نهاية كل فترة فوترة ما لم تُلغَ عبر بوابة الفوترة قبل التجديد. والأسعار لا تشمل ضريبة القيمة المضافة ما لم يُذكر خلاف ذلك؛ وتُضاف الضريبة المطبقة. ويجوز لنا تغيير الأسعار بإشعار لا يقل عن 30 يوماً قبل التجديد التالي. وترد شروط الإلغاء والاسترداد في سياسة الاسترداد التي تُشكّل جزءاً من هذه الشروط.",
        ],
      },
      {
        heading: "6. الاستخدام المقبول",
        paragraphs: ["يجب عليك ألا:"],
        bullets: [
          "تستخدم الخدمة لإرسال رسائل غير مرغوب فيها أو غير قانونية، أو للتواصل مع أشخاص لم يوافقوا حيثما تُشترط الموافقة؛",
          "ترفع محتوى غير قانوني أو منتهكاً للحقوق أو تشهيرياً أو لا يحق لك مشاركته (بما في ذلك صور الأشخاص أو المستندات دون إذن)؛",
          "تحاول الوصول إلى بيانات ورشة أو عميل آخر، أو فحص ضوابط الأمان أو تجاوزها، أو إثقال الخدمة؛",
          "تقوم بالهندسة العكسية للخدمة أو إعادة بيعها أو ترخيصها من الباطن دون موافقتنا الكتابية؛",
          "تستخدم الميزات المدعومة بالذكاء الاصطناعي لطلب تعليمات لتعطيل أنظمة سلامة المركبة أو تجاوزها.",
        ],
      },
      {
        heading: "7. المحتوى الخاص بك",
        paragraphs: [
          "تحتفظ بملكية البيانات والملفات التي ترفعها (\"محتواك\"). وتمنح ريفورا ترخيصاً عالمياً غير حصري لاستضافة محتواك وتخزينه ومعالجته وعرضه ونقله حصراً لتقديم الخدمة وتأمينها وبما تسمح به سياسة الخصوصية. وأنت مسؤول عن محتواك وتؤكد أن لديك جميع الحقوق والموافقات اللازمة لرفعه، بما في ذلك شعارات المنشآت وصور المركبات وأي بيانات شخصية يتضمنها.",
        ],
      },
      {
        heading: "8. ذكاء المركبات (الميزات المدعومة بالذكاء الاصطناعي)",
        paragraphs: [
          "تنتج ميزات ذكاء المركبات (تشخيص الأعراض، فك رموز الأعطال، فك ترميز رقم الهيكل، الفحوصات الصحية، مسودات عروض الأسعار) مخرجات استشارية مولدة جزئياً بواسطة نموذج ذكاء اصطناعي وقواعد بيانات مركبات عامة. وقد تكون هذه المخرجات ناقصة أو خاطئة. وهي ليست فحصاً مهنياً ولا تشخيصاً ولا بديلاً عن الفحص من قبل فني مؤهل. وإذا أشارت المخرجات إلى حالة قد تمس السلامة، فتوقف عن القيادة وتواصل مع ورشة. ويجب على الورش مراجعة مخرجات الذكاء الاصطناعي قبل الاعتماد عليها أو عرضها على العميل. وإلى أقصى حد يسمح به القانون، لا تتحمل ريفورا أي مسؤولية عن القرارات المتخذة اعتماداً على المخرجات المدعومة بالذكاء الاصطناعي.",
        ],
      },
      {
        heading: "9. الفواتير والمستندات الضريبية",
        paragraphs: [
          "توفر ريفورا أدوات تساعد الورش على إصدار عروض الأسعار والفواتير، بما في ذلك حقول لرقم التسجيل الضريبي وضريبة القيمة المضافة لكل بند. والورشة وحدها مسؤولة عن ضمان أن أي فاتورة تصدرها تستوفي متطلبات الهيئة الاتحادية للضرائب في الإمارات والقوانين الأخرى المعمول بها، وعن دقة المبالغ الضريبية، وعن حفظ سجلاتها وتقديم إقراراتها. ولا تشهد ريفورا بأن المستندات المولدة هي فواتير ضريبية متوافقة.",
        ],
      },
      {
        heading: "10. الإشعارات",
        paragraphs: [
          "تتحكم الورش فيما إذا كانت إشعارات البريد الإلكتروني والرسائل النصية تُرسل إلى عملائها، وهي مسؤولة عن الحصول على الموافقات التي تقتضيها قواعد الاتصالات وحماية البيانات في الإمارات، بما في ذلك للمحتوى التسويقي وتسجيل هوية المرسل. ويمكن للعملاء تعطيل كل قناة من البوابة. ويجوز لريفورا تعليق إرسال الإشعارات لأي حساب يولّد شكاوى أو رسائل مرتدة أو رسائل تبدو غير مرغوب فيها.",
        ],
      },
      {
        heading: "11. الملكية الفكرية",
        paragraphs: [
          "الخدمة، بما في ذلك برمجياتها وتصميمها وعلامتها التجارية ووثائقها، مملوكة لريفورا أو لمرخصيها ومحمية بقوانين الملكية الفكرية. وباستثناء الحق المحدود في استخدام الخدمة بموجب هذه الشروط، لا تُمنح لك أي حقوق. ويجوز استخدام الملاحظات التي تقدمها لنا دون أي التزام تجاهك.",
        ],
      },
      {
        heading: "12. التوافر والتغييرات",
        paragraphs: [
          "نسعى للحفاظ على توافر الخدمة لكننا لا نضمن تشغيلاً متواصلاً أو خالياً من الأخطاء. ويجوز لنا تعديل الميزات أو إضافتها أو إزالتها، وقد نصنّف بعض الميزات كتجريبية أو معاينة أو قادمة قريباً؛ وقد تتغير تلك الميزات أو تُسحب دون إشعار. وسنقدم إشعاراً معقولاً بالتغييرات التي تقلل جوهرياً من الوظائف الأساسية لخطة مدفوعة.",
        ],
      },
      {
        heading: "13. إخلاء المسؤولية وتحديدها",
        paragraphs: [
          "باستثناء ما هو منصوص عليه صراحةً في هذه الشروط، تُقدَّم الخدمة \"كما هي\" و\"حسب توافرها\"، ونخلي مسؤوليتنا عن جميع الضمانات الضمنية إلى الحد الذي يسمح به القانون.",
          "إلى أقصى حد يسمح به قانون الإمارات: (أ) لا تتحمل ريفورا المسؤولية عن الخسائر غير المباشرة أو التبعية أو الخاصة أو العقابية، أو عن خسارة الأرباح أو الأعمال أو البيانات أو السمعة؛ (ب) يقتصر إجمالي مسؤولية ريفورا الناشئة عن الخدمة أو المتعلقة بها في أي فترة 12 شهراً على الرسوم التي دفعتها لريفورا خلال تلك الفترة، أو 1,000 درهم إماراتي إذا لم تدفع أي رسوم؛ (ج) لا يوجد في هذه الشروط ما يحد من المسؤولية التي لا يمكن تحديدها بموجب القانون، بما في ذلك الاحتيال أو الإهمال الجسيم.",
        ],
      },
      {
        heading: "14. التعويض",
        paragraphs: [
          "تلتزم الورش بالدفاع عن ريفورا وتعويضها عن مطالبات الغير والغرامات والتكاليف المعقولة الناشئة عن إخلال الورشة بالقسم 3 أو 6 أو 7 أو 9 أو 10، أو عن أي نزاع بين الورشة وعملائها.",
        ],
      },
      {
        heading: "15. التعليق والإنهاء",
        paragraphs: [
          "يمكنك التوقف عن استخدام الخدمة في أي وقت؛ وتُلغي الورش اشتراكها عبر بوابة الفوترة. ويجوز لنا تعليق الوصول أو إنهاؤه بسبب الإخلال بهذه الشروط أو عدم السداد أو متطلب قانوني أو وجود خطر على الخدمة أو المستخدمين الآخرين، مع الإشعار حيثما أمكن ذلك بشكل معقول. وبعد الإنهاء يجوز للورشة طلب تصدير بياناتها خلال 30 يوماً، وبعدها يجوز لنا حذفها، مع مراعاة فترات الاحتفاظ الموضحة في سياسة الخصوصية.",
        ],
      },
      {
        heading: "16. القانون الواجب التطبيق والنزاعات",
        paragraphs: [
          "تخضع هذه الشروط لقوانين دولة الإمارات العربية المتحدة كما تُطبق في الاختصاص القضائي المسجلة فيه {entityName}. ويخضع أي نزاع للاختصاص الحصري للمحاكم المختصة في ذلك الاختصاص، دون الإخلال بأي حقوق للمستهلك لا يمكن استبعادها بموجب قانون الإمارات. وقبل بدء أي إجراءات، يرجى التواصل معنا على {email}؛ وسنسعى بحسن نية لحل المسألة.",
        ],
      },
      {
        heading: "17. التغييرات على هذه الشروط",
        paragraphs: [
          "يجوز لنا تحديث هذه الشروط. ويوضح التاريخ في الأعلى النسخة الحالية. وبالنسبة للتغييرات الجوهرية، سنخطر أصحاب الحسابات عبر البريد الإلكتروني أو إشعار داخل التطبيق قبل 14 يوماً على الأقل من سريانها. ويعني استمرار الاستخدام بعد تاريخ السريان قبولك للشروط المحدثة.",
        ],
      },
      {
        heading: "18. التواصل",
        paragraphs: [
          "{entityName}، {address}. الاستفسارات القانونية: {email}.",
        ],
      },
    ],
  },
};
