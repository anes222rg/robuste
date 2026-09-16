ROBUSTE — حزمة التحديث
=======================

كيف ترفع:
  انسخ الملفات إلى جذر موقعك مع الحفاظ على البنية (مجلد images داخل images).

الملفات:
  product-107.html    صفحة المنتج الجديد
  index.html          الصفحة الرئيسية — قسم العروض الخاصة محدّث
  product-4.html      الفريتوز 1.5 لتر — "غير متوفر حالياً"
  product-200.html    باك DUO — "غير متوفر حالياً"
  product-201.html    SUMMER PACK — "غير متوفر حالياً"
  products.json       41 منتج
  sitemap.xml         مع رابط وصورة المنتج الجديد
  images/FRITEUSE INOX 3L.webp      الصورة الرئيسية
  images/FRITEUSE INOX 3L 2.webp    لوحة التحكم
  images/FRITEUSE INOX 3L 3.webp    العلبة


ما تغيّر
--------

1) منتج جديد — المعرّف 107
   FRITEUSE ELECTRIQUE INOX 3L 2000W  (الموديل FEI3L)
   السعر 8,600 دج  (قديم 9,500 — شارة -9%)
   مخزون 10 | تصنيف cuisine | شارة Nouveau
   وصف عربي وفرنسي كامل + 11 ميزة

2) قسم العروض الخاصة في الصفحة الرئيسية
   الفريتوز DF 900 W (1.5 لتر) استُبدل بالإينوكس 3 لتر
   الصور الثلاث + الرابط + العنوان + السعر

3) نفد المخزون — ثلاثة منتجات
   id   4   FRITEUSE DF 900 W (1.5 لتر)
   id 200   PACK DUO — 2x FRITEUSE DF 900W
   id 201   SUMMER PACK — GRILL 1000W + FRITEUSE DF 900W

   لكل واحد: stock = 0 في products.json
             الصفحة تعرض "غير متوفر حالياً"
             JSON-LD = OutOfStock (جوجل يتوقف عن عرضه كمتوفر)

4) تعديلات سابقة وافقت عليها (داخل products.json)
   PETRIN PRO MAX    → 18,500 دج
   ASPIRATEUR BALAI  →  9,500 دج
   PANINEUSE 2000W   → إصلاح صورة مكسورة


غير مُدرج (حسب طلبك)
--------------------
  product-25.html
    صفحة البترين — HTML الثابت ما زال 18,200 بينما products.json فيه 18,500.
    الجافاسكريبت يصححه للزائر، لكن جوجل يقرأ 18,200.
    اطلبه وأرسله لك.

  cloudflare-worker.js + admin.html
    مؤجّلة. الشحن عبر Ecotrack يبقى معطّلاً (401) حتى تُنشر.
    وتحتاج إضافة سر ADMIN_EMAIL = anescareer@gmail.com في Cloudflare.
