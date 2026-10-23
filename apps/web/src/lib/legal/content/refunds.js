// Refund & Cancellation Policy — DRAFT pending review by qualified UAE counsel.
//
// Applies to Revora's own subscription fees (billed via Stripe). Workshop ↔
// customer invoices are outside Revora's contract and are deliberately
// carved out. Commercial choices flagged for the Operator: no money-back
// window is promised; refunds are limited to billing errors, prolonged
// outage, and legal requirement.
//
// Tokens: {entityName} {email}. Section counts MUST match between locales.

/** @type {import("../types").LegalContent} */
export const refunds = {
  en: {
    title: "Refund and Cancellation Policy",
    updated: "2026-09-12",
    intro: [
      "This policy explains how cancellations and refunds work for Revora subscription plans purchased from {entityName}. It forms part of our Terms of Service.",
    ],
    sections: [
      {
        heading: "1. What this policy covers",
        paragraphs: [
          "This policy covers only the subscription fees Workshops pay to Revora. It does not cover quotations, invoices or payments between a Workshop and its customers: those are governed by the Workshop's own terms and by UAE consumer-protection law, and Revora is not a party to them. Customers with a question about a workshop invoice should contact the Workshop directly.",
        ],
      },
      {
        heading: "2. Cancelling a subscription",
        paragraphs: [
          "You can cancel at any time from Billing in your Revora workspace, which opens the Stripe billing portal. Cancellation takes effect at the end of the current billing period; you keep access until then and are not charged again. We do not charge cancellation fees. After the period ends your workspace becomes read-only and you may request a data export within 30 days, after which data may be deleted as described in the Privacy Policy.",
        ],
      },
      {
        heading: "3. Refunds",
        paragraphs: [
          "Subscription fees are paid in advance for each billing period and, except as set out below, are non-refundable, including for partially used periods, unused features or seats, or plan downgrades. We will refund a charge, in full or in part, where:",
        ],
        bullets: [
          "you were charged more than once for the same period or otherwise charged in error;",
          "the Service was unavailable to you for more than 72 consecutive hours because of a fault on our side, in which case we will refund or credit the affected days on request;",
          "we withdraw a paid feature you relied on without the notice promised in the Terms of Service;",
          "a refund is required by applicable UAE law.",
        ],
      },
      {
        heading: "4. How to request a refund",
        paragraphs: [
          "Email {email} from the account owner's address within 30 days of the charge, stating the invoice number and the reason. We respond within 10 business days. Approved refunds are returned to the original payment method through Stripe and usually appear within 5–10 business days depending on your bank.",
        ],
      },
      {
        heading: "5. Trials and price changes",
        paragraphs: [
          "If a plan is offered with a free trial, you will not be charged until the trial ends, and you can cancel before then at no cost. If we change the price of your plan we will notify you at least 30 days before the next renewal so you can cancel before the new price applies.",
        ],
      },
      {
        heading: "6. Contact",
        paragraphs: ["Billing questions: {email}."],
      },
    ],
  },
  ar: {
    title: "سياسة الاسترداد والإلغاء",
    updated: "2026-09-12",
    intro: [
      "توضح هذه السياسة كيفية عمل الإلغاء والاسترداد لخطط اشتراك ريفورا المشتراة من {entityName}. وهي تشكّل جزءاً من شروط الخدمة الخاصة بنا.",
    ],
    sections: [
      {
        heading: "1. نطاق هذه السياسة",
        paragraphs: [
          "تغطي هذه السياسة فقط رسوم الاشتراك التي تدفعها الورش لريفورا. ولا تغطي عروض الأسعار أو الفواتير أو المدفوعات بين الورشة وعملائها: فتلك تخضع لشروط الورشة الخاصة ولقانون حماية المستهلك في الإمارات، وريفورا ليست طرفاً فيها. وعلى العملاء الذين لديهم استفسار بشأن فاتورة ورشة التواصل مع الورشة مباشرةً.",
        ],
      },
      {
        heading: "2. إلغاء الاشتراك",
        paragraphs: [
          "يمكنك الإلغاء في أي وقت من صفحة الفوترة في مساحة عمل ريفورا، والتي تفتح بوابة فوترة Stripe. ويسري الإلغاء في نهاية فترة الفوترة الحالية؛ وتحتفظ بالوصول حتى ذلك الحين ولا يتم تحصيل رسوم منك مرة أخرى. ولا نفرض رسوم إلغاء. وبعد انتهاء الفترة تصبح مساحة عملك للقراءة فقط ويمكنك طلب تصدير بياناتك خلال 30 يوماً، وبعدها قد تُحذف البيانات كما هو موضح في سياسة الخصوصية.",
        ],
      },
      {
        heading: "3. الاسترداد",
        paragraphs: [
          "تُدفع رسوم الاشتراك مقدماً عن كل فترة فوترة، وباستثناء ما هو مبين أدناه فهي غير قابلة للاسترداد، بما في ذلك الفترات المستخدمة جزئياً أو الميزات أو المقاعد غير المستخدمة أو تخفيض الخطة. وسنسترد أي رسوم، كلياً أو جزئياً، في الحالات التالية:",
        ],
        bullets: [
          "إذا تم تحصيل الرسوم منك أكثر من مرة عن الفترة نفسها أو تم تحصيلها خطأً؛",
          "إذا لم تكن الخدمة متاحة لك لأكثر من 72 ساعة متواصلة بسبب خلل من جانبنا، وفي هذه الحالة سنسترد أو نضيف رصيداً عن الأيام المتأثرة عند الطلب؛",
          "إذا سحبنا ميزة مدفوعة كنت تعتمد عليها دون الإشعار المنصوص عليه في شروط الخدمة؛",
          "إذا كان الاسترداد مطلوباً بموجب قانون الإمارات المعمول به.",
        ],
      },
      {
        heading: "4. كيفية طلب الاسترداد",
        paragraphs: [
          "راسلنا على {email} من عنوان بريد مالك الحساب خلال 30 يوماً من تاريخ التحصيل، مع ذكر رقم الفاتورة والسبب. ونرد خلال 10 أيام عمل. وتُعاد المبالغ المعتمدة إلى وسيلة الدفع الأصلية عبر Stripe وتظهر عادةً خلال 5 إلى 10 أيام عمل حسب بنكك.",
        ],
      },
      {
        heading: "5. الفترات التجريبية وتغييرات الأسعار",
        paragraphs: [
          "إذا عُرضت خطة مع فترة تجريبية مجانية، فلن يتم تحصيل رسوم منك حتى انتهاء الفترة التجريبية، ويمكنك الإلغاء قبل ذلك دون أي تكلفة. وإذا غيّرنا سعر خطتك فسنخطرك قبل 30 يوماً على الأقل من التجديد التالي لتتمكن من الإلغاء قبل تطبيق السعر الجديد.",
        ],
      },
      {
        heading: "6. التواصل",
        paragraphs: ["استفسارات الفوترة: {email}."],
      },
    ],
  },
};
