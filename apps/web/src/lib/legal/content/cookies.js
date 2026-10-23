// Cookie Policy — DRAFT pending review by qualified UAE counsel.
//
// The cookie inventory below is the complete set written by this app as of
// 2026-09-12: Supabase Auth session cookies (@supabase/ssr), the next-intl
// locale cookie, and ACTIVE_BUSINESS_COOKIE (lib/auth.ts). No analytics,
// advertising or third-party cookies exist. Adding any tracker means this
// policy AND the consent model must change first.
//
// Tokens: {entityName} {email}. Section counts MUST match between locales.

/** @type {import("../types").LegalContent} */
export const cookies = {
  en: {
    title: "Cookie Policy",
    updated: "2026-09-12",
    intro: [
      "This Cookie Policy explains which cookies the Revora platform operated by {entityName} sets on your device and why. It supplements our Privacy Policy.",
    ],
    sections: [
      {
        heading: "1. What cookies are",
        paragraphs: [
          "Cookies are small text files a website stores in your browser. Similar technologies (such as local storage) can serve the same purpose; we use the word \"cookies\" for all of them.",
        ],
      },
      {
        heading: "2. Cookies we use",
        paragraphs: [
          "Revora uses only strictly necessary cookies, meaning cookies without which the Service cannot work. We do not use analytics, advertising, social-media or cross-site tracking cookies, and we do not load third-party scripts that would set them.",
        ],
        bullets: [
          "Sign-in session (names beginning with \"sb-\"): keeps you signed in and refreshes your session securely. Set when you sign in; removed when you sign out or the session expires.",
          "Language preference (\"NEXT_LOCALE\"): remembers whether you chose English or Arabic so pages load in your language. Kept for up to one year.",
          "Active workshop (\"revora_active_business_id\"): remembers which workshop you last selected when your account belongs to more than one. Kept for the duration of your session.",
          "Theme preference: stored in your browser's local storage (not a cookie) to remember light or dark mode. It never leaves your device.",
        ],
      },
      {
        heading: "3. Consent",
        paragraphs: [
          "Because every cookie we set is strictly necessary to provide the Service you asked for, applicable law does not require us to ask for consent before setting them, and no cookie banner is shown. If we ever introduce non-essential cookies we will ask for your consent first and update this policy.",
        ],
      },
      {
        heading: "4. Managing cookies",
        paragraphs: [
          "You can delete or block cookies in your browser settings. Blocking the sign-in session cookie will prevent you from using the Service while signed in; blocking the language cookie means the default language will be used.",
        ],
      },
      {
        heading: "5. Third-party services",
        paragraphs: [
          "When a Workshop uses Stripe's hosted billing portal, Stripe may set its own cookies on Stripe's domain under Stripe's privacy policy. Revora pages themselves do not embed third-party content.",
        ],
      },
      {
        heading: "6. Changes and contact",
        paragraphs: [
          "We will update this policy if the cookies we use change. Questions: {email}.",
        ],
      },
    ],
  },
  ar: {
    title: "سياسة ملفات تعريف الارتباط",
    updated: "2026-09-12",
    intro: [
      "توضح سياسة ملفات تعريف الارتباط هذه ما تضعه منصة ريفورا التي تشغّلها {entityName} من ملفات تعريف ارتباط على جهازك ولماذا. وهي مكمّلة لسياسة الخصوصية الخاصة بنا.",
    ],
    sections: [
      {
        heading: "1. ما هي ملفات تعريف الارتباط",
        paragraphs: [
          "ملفات تعريف الارتباط هي ملفات نصية صغيرة يخزنها الموقع في متصفحك. ويمكن للتقنيات المشابهة (مثل التخزين المحلي) أن تؤدي الغرض نفسه؛ ونستخدم مصطلح \"ملفات تعريف الارتباط\" للإشارة إليها جميعاً.",
        ],
      },
      {
        heading: "2. ملفات تعريف الارتباط التي نستخدمها",
        paragraphs: [
          "تستخدم ريفورا ملفات تعريف الارتباط الضرورية فقط، أي التي لا يمكن للخدمة أن تعمل بدونها. لا نستخدم ملفات تعريف ارتباط للتحليلات أو الإعلانات أو وسائل التواصل الاجتماعي أو التتبع عبر المواقع، ولا نحمّل نصوصاً برمجية من أطراف ثالثة قد تضعها.",
        ],
        bullets: [
          "جلسة تسجيل الدخول (أسماء تبدأ بـ \"sb-\"): تبقيك مسجلاً للدخول وتجدد جلستك بأمان. تُضبط عند تسجيل الدخول وتُزال عند تسجيل الخروج أو انتهاء الجلسة.",
          "تفضيل اللغة (\"NEXT_LOCALE\"): يتذكر ما إذا اخترت العربية أو الإنجليزية لتُحمَّل الصفحات بلغتك. يُحفظ لمدة تصل إلى سنة واحدة.",
          "الورشة النشطة (\"revora_active_business_id\"): تتذكر آخر ورشة اخترتها عندما ينتمي حسابك إلى أكثر من ورشة. تُحفظ طوال مدة جلستك.",
          "تفضيل المظهر: يُخزن في التخزين المحلي لمتصفحك (وليس ملف تعريف ارتباط) لتذكر الوضع الفاتح أو الداكن. ولا يغادر جهازك أبداً.",
        ],
      },
      {
        heading: "3. الموافقة",
        paragraphs: [
          "نظراً لأن كل ملف تعريف ارتباط نضعه ضروري تماماً لتقديم الخدمة التي طلبتها، فإن القانون المعمول به لا يلزمنا بطلب موافقتك قبل وضعه، ولا تُعرض لافتة ملفات تعريف الارتباط. وإذا أدخلنا يوماً ملفات تعريف ارتباط غير ضرورية فسنطلب موافقتك أولاً ونحدّث هذه السياسة.",
        ],
      },
      {
        heading: "4. إدارة ملفات تعريف الارتباط",
        paragraphs: [
          "يمكنك حذف ملفات تعريف الارتباط أو حظرها من إعدادات متصفحك. وسيمنعك حظر ملف جلسة تسجيل الدخول من استخدام الخدمة أثناء تسجيل الدخول؛ ويعني حظر ملف اللغة استخدام اللغة الافتراضية.",
        ],
      },
      {
        heading: "5. خدمات الأطراف الثالثة",
        paragraphs: [
          "عندما تستخدم الورشة بوابة الفوترة المستضافة لدى Stripe، قد تضع Stripe ملفات تعريف ارتباط خاصة بها على نطاق Stripe وفق سياسة خصوصية Stripe. ولا تُضمّن صفحات ريفورا نفسها أي محتوى من أطراف ثالثة.",
        ],
      },
      {
        heading: "6. التغييرات والتواصل",
        paragraphs: [
          "سنحدّث هذه السياسة إذا تغيرت ملفات تعريف الارتباط التي نستخدمها. للاستفسارات: {email}.",
        ],
      },
    ],
  },
};
