/* ROBUSTE eulma — Phase 1 interface i18n (AR / EN / FR)
   Translates UI chrome only. Product names/descriptions stay as-is (Phase 2).
   No HTML edits needed beyond including this script. */
(function () {
  "use strict";

  // [arabic source, english, french]
  var ROWS = [
    // ---- added 2026-08-16 (batch 2) ----
    [`(للمنزل)`, `(Home)`, `(À domicile)`],
    [`اختر الولاية أولاً`, `Select your wilaya first`, `Choisissez d'abord votre wilaya`],
    [`تم إرسال رسالتك بنجاح! سوف نتواصل معك قريباً.`, `Your message has been sent! We will contact you soon..`, `Votre message a été envoyé ! Nous vous contacterons bientôt..`],
    [`جاري معالجة طلبك...`, `Processing your order...`, `Traitement de votre commande...`],
    [`حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.`, `Unexpected error. Please try again.`, `Erreur inattendue. Veuillez réessayer.`],
    [`شكراً لك! تم إرسال تقييمك بنجاح`, `Thank you! Your review has been sent`, `Merci ! Votre avis a bien été envoyé`],
    [`صورة مصغرة للمنتج`, `Product thumbnail`, `Miniature du produit`],
    [`لقد استلمنا هذا الطلب بالفعل، سنتواصل معك قريباً`, `We already received this order, we will contact you shortly`, `Nous avons déjà reçu cette commande, nous vous contacterons bientôt`],
    [`لم يتم تقديمه`, `Not provided`, `Non renseigné`],
    [`متجر متخصص في الأجهزة المنزلية عالية الجودة بأسعار تنافسية في الجزائر.`, `A store specialised in high-quality home appliances at competitive prices in Algeria..`, `Une boutique spécialisée en appareils ménagers de haute qualité à prix compétitifs en Algérie..`],
    [`منتج في السلة`, `item in cart`, `article dans le panier`],
    [`يرجى إدخال الاسم واللقب (كلمة أو كلمتان)`, `Please enter your name (one or two words)`, `Veuillez saisir votre nom (un ou deux mots)`],
    [`يرجى إدخال العنوان بشكل واضح`, `Please enter a clear address`, `Veuillez saisir une adresse claire`],
    [`يرجى اختيار البلدية`, `Please select your commune`, `Veuillez choisir votre commune`],
    [`يرجى اختيار طريقة الدفع`, `Please choose a payment method`, `Veuillez choisir un mode de paiement`],
    // ---- added 2026-08-16: strings that were still showing in Arabic ----
    [`(مكتب)`, `(desk)`, `(bureau)`],
    [`(منزل)`, `(home)`, `(domicile)`],
    [`آراء حقيقية 100%`, `100% genuine reviews`, `Avis 100% authentiques`],
    [`أضف رأيك`, `Add your review`, `Ajoutez votre avis`],
    [`إرجاع خلال 7 أيام`, `7-day returns`, `Retour sous 7 jours`],
    [`إرسال التقييم`, `Submit review`, `Envoyer l'avis`],
    [`اجمعي الأجهزة التي تحتاجينها في باك واحد. اختاري الباك وأضيفيه مباشرة إلى السلة.`, `Bundle the appliances you need into one pack. Pick a pack and add it straight to your cart.`, `Réunissez les appareils dont vous avez besoin dans un seul pack. Choisissez un pack et ajoutez-le directement au panier.`],
    [`اسحبي لاكتشاف الباكات`, `Swipe to explore the packs`, `Faites glisser pour découvrir les packs`],
    [`اسم البلدية`, `Commune name`, `Nom de la commune`],
    [`اضغط للتكبير`, `Tap to zoom`, `Cliquez pour agrandir`],
    [`اطلب الآن`, `Order now`, `Commander maintenant`],
    [`الاسم *`, `Name *`, `Nom *`],
    [`البلدية`, `Commune`, `Commune`],
    [`الدفع عند الاستلام • التوصيل لكل الولايات`, `Cash on delivery • delivery to all wilayas`, `Paiement à la livraison • livraison dans toutes les wilayas`],
    [`العنوان *`, `Address *`, `Adresse *`],
    [`باكات مختارة، في عرض واحد`, `Selected packs, one single offer`, `Packs sélectionnés, une seule offre`],
    [`تأكيد توصيل الطلب مع شكر الزبونة`, `Delivery confirmed, with the customer's thanks`, `Livraison confirmée, avec les remerciements de la cliente`],
    [`تقييمك *`, `Your rating *`, `Votre note *`],
    [`جودة المنتجات`, `Product quality`, `Qualité des produits`],
    [`رأيك في المنتج *`, `Your review *`, `Votre avis *`],
    [`زبونة استلمت طلبها وشكرت المتجر`, `A customer received her order and thanked the store`, `Une cliente a reçu sa commande et a remercié la boutique`],
    [`زبونة جرّبت الفريتوز: ولله أحسن ماركة والنتيجة روعة`, `A customer tried the air fryer: honestly the best brand, the result is amazing`, `Une cliente a essayé la friteuse : franchement la meilleure marque, résultat superbe`],
    [`زبونة راضية وطلبت فريتوز إضافية للعائلة`, `A happy customer ordered another air fryer for her family`, `Une cliente satisfaite a commandé une autre friteuse pour sa famille`],
    [`شعار ROBUSTE`, `ROBUSTE logo`, `Logo ROBUSTE`],
    [`صور حقيقية من محادثات زبائننا بعد استلامهم وتجربتهم للفريتوز`, `Real screenshots from our customers' chats after they received and tried the air fryer`, `Captures réelles des conversations de nos clients après réception et essai de la friteuse`],
    [`صورة المنتج`, `Product image`, `Image du produit`],
    [`صورة روز`, `Photo of Rose`, `Photo de Rose`],
    [`صورة روز بلانش`, `Photo of Rose Blanche`, `Photo de Rose Blanche`],
    [`صورة عمر`, `Photo of Omar`, `Photo d'Omar`],
    [`صورة محمد`, `Photo of Mohamed`, `Photo de Mohamed`],
    [`ضمان المنتجات`, `Product warranty`, `Garantie des produits`],
    [`طريقة التوصيل *`, `Delivery method *`, `Mode de livraison *`],
    [`عرض المنتجات`, `View products`, `Voir les produits`],
    [`عروض خاصة`, `Special offers`, `Offres spéciales`],
    [`متوفر في المخزون`, `In stock`, `En stock`],
    [`مجاني إلى المكتب`, `Free to pickup desk`, `Gratuit au bureau`],
    [`يرجى إدخال البلدية`, `Please enter your commune`, `Veuillez saisir votre commune`],
    // ---- top bar promo + form messages (added) ----
    // ---- missing UI strings (added 2026-08-10) ----
    [`الدفع عند الاستلام — توصيل`, `Cash on delivery — shipping to`, `Paiement à la livraison — livraison dans`],
    [`58 ولاية`, `58 wilayas`, `58 wilayas`],
    [`خلال 24–72 ساعة`, `within 24–72 hours`, `sous 24–72 heures`],
    [`توصيل 58 ولاية`, `Delivery to 58 wilayas`, `Livraison dans 58 wilayas`],
    [`ضمان سنة`, `1-year warranty`, `Garantie 1 an`],
    [`🎁 باكات التوفير`, `🎁 Value packs`, `🎁 Packs éco`],
    [`باكات التوفير`, `Value packs`, `Packs éco`],
    [`PACK وفر`, `SAVER PACK`, `PACK ÉCO`],
    [`تفعيل وضع الظلام`, `Switch to dark mode`, `Activer le mode sombre`],
    [`تفعيل وضع النهار`, `Switch to light mode`, `Activer le mode clair`],
    [`اكتب اسم بلديتك`, `Enter your commune`, `Saisissez votre commune`],
    [`أدخل عنوانك بالتفصيل (الحي، الشارع، رقم المنزل)`, `Full address (district, street, house number)`, `Adresse complète (quartier, rue, numéro)`],
    [`الحي، الشارع، رقم المنزل...`, `District, street, house number...`, `Quartier, rue, numéro...`],
    [`اتركه فارغاً`, `Leave this empty`, `Laissez vide`],
    [`تيك توك`, `TikTok`, `TikTok`],
    [`إنستغرام`, `Instagram`, `Instagram`],
    [`أضف رأيك هنا`, `Add your review`, `Ajoutez votre avis`],
    [`شارك تجربتك مع المنتج وساعد عملاءنا الآخرين`, `Share your experience and help our other customers`, `Partagez votre expérience et aidez nos autres clients`],
    [`دفع آمن 100% · الدفع عند الاستلام أو ببطاقة الذهب`, `100% secure payment · cash on delivery or Edahabia card`, `Paiement 100% sécurisé · à la livraison ou par carte Edahabia`],
    [`عرض خاص مؤقّت`, `Limited-time offer`, `Offre à durée limitée`],
    [`لا تفوّت الفرصة`, `Don't miss out`, `Ne manquez pas l'occasion`],
    [`واتساب`, `WhatsApp`, `WhatsApp`],
    [`يرجى إدخال العنوان`, `Please enter your address`, `Veuillez saisir votre adresse`],
    [`رقم الهاتف لازم 10 أرقام يبدأ بـ 05 أو 06 أو 07`, `Phone must be 10 digits starting with 05, 06 or 07`, `Le numéro doit comporter 10 chiffres et commencer par 05, 06 ou 07`],
    [`يرجى إدخال الاسم واللقب`, `Please enter your full name`, `Veuillez saisir votre nom complet`],
    // ---- PETRIN PRO MAX 25 + conversion UI (added) ----
    [`عجّانة احترافية 1800 واط · وعاء 8 لتر · خطّافان مزدوجان للعجين الثقيل`, `Professional 1800 W stand mixer · 8 L bowl · Double hook for heavy dough`, `Pétrin professionnel 1800 W · Bol 8 L · Double crochet pour pâtes lourdes`],
    [`عجّانة PETRIN PRO MAX بقوة 1800 واط ووعاء ستانلس 8 لتر، مصمّمة للعائلات الكبيرة وللاستعمال الاحترافي. تأتي بتصميم Double Crochet بخطّافين مزدوجين يعجنان العجين الثقيل دون جهد، وـ 8 سرعات متغيرة تغطّي كل الاستعمالات من خبز الدار والمسمن إلى الحلويات والكريمة. تضمّ ثلاثة ملحقات: خطّاف العجين، مضرب البيض، ومخفقة مسطحة. الدفع عند الاستلام في كل الولايات.`, `The PETRIN PRO MAX delivers 1800 W of power with an 8 L stainless steel bowl, built for large families and professional use. Its Double Crochet design uses twin hooks that knead heavy dough effortlessly, while 8 variable speeds cover everything from home bread and msemen to pastries and whipped cream. Includes three attachments: dough hook, egg whisk and flat beater. Cash on delivery to every wilaya.`, `Le PETRIN PRO MAX développe 1800 W avec un bol en inox de 8 L, conçu pour les grandes familles et l'usage professionnel. Sa conception Double Crochet pétrit sans effort les pâtes les plus lourdes, et ses 8 vitesses variables couvrent tout, du pain maison et du msemen aux pâtisseries et à la crème fouettée. Livré avec trois accessoires : crochet à pâte, fouet à œufs et batteur plat. Paiement à la livraison dans toutes les wilayas.`],
    [`قوة 1800 واط — تعجن الثقيل دون توقف`, `1800 W of power — kneads heavy dough without stalling`, `1800 W de puissance — pétrit les pâtes lourdes sans caler`],
    [`وعاء ستانلس 8 لتر — يكفي العائلة الكبيرة`, `8 L stainless steel bowl — enough for a large family`, `Bol inox 8 L — suffisant pour une grande famille`],
    [`خطّافان مزدوجان Double Crochet`, `Twin hooks — Double Crochet design`, `Double crochet — conception Double Crochet`],
    [`8 سرعات متغيرة + وضعية نبض`, `8 variable speeds + pulse mode`, `8 vitesses variables + mode pulse`],
    [`3 ملحقات: عجين · بيض · خلط`, `3 attachments: dough · whisk · beater`, `3 accessoires : pâte · fouet · batteur`],
    [`الدفع عند الاستلام · 58 ولاية`, `Cash on delivery · 58 wilayas`, `Paiement à la livraison · 58 wilayas`],
    [`PETRIN PRO MAX 8L 1800W`, `PETRIN PRO MAX 8L 1800W`, `PETRIN PRO MAX 8L 1800W`],
    [`وفّر`, `Save`, `Économisez`],
    [`بقيت`, `Only`, `Il ne reste que`],
    [`قطع فقط بهذا السعر`, `left at this price`, `pièces à ce prix`],
    [`طلب سريع · دقيقة واحدة`, `Quick order · one minute`, `Commande rapide · une minute`],
    [`🛒 أؤكّد الطلب الآن`, `🛒 Confirm my order now`, `🛒 Je confirme ma commande`],
    [`الدفع عند الاستلام · توصيل لكل الولايات`, `Cash on delivery · delivery to all wilayas`, `Paiement à la livraison · livraison dans toutes les wilayas`],
    [`ضمان 12 شهر · تجربة المنتج قبل الشحن · حق التبديل خلال 7 أيام إذا وُجد خلل`, `12-month warranty · product tested before shipping · right of exchange within 7 days if defective`, `Garantie 12 mois · produit testé avant expédition · droit d'échange sous 7 jours en cas de défaut`],
    [`أو اطلب عبر واتساب`, `Or order via WhatsApp`, `Ou commandez via WhatsApp`],
    [`توصيل سريع`, `Fast delivery`, `Livraison rapide`],
    [`منتج أصلي`, `Authentic product`, `Produit authentique`],
    [`إرجاع 7 أيام`, `7-day returns`, `Retour sous 7 jours`],
    [`اطلب الآن · الدفع عند الاستلام`, `Order now · cash on delivery`, `Commander · paiement à la livraison`],
    [`دفع آمن عند الاستلام`, `Secure payment on delivery`, `Paiement sécurisé à la livraison`],
    [`منتج أصلي 100%`, `100% authentic product`, `Produit 100% authentique`],
    [`إرجاع سهل خلال 7 أيام`, `Easy returns within 7 days`, `Retour facile sous 7 jours`],
    [`توصيل سريع لكل الولايات`, `Fast delivery to all wilayas`, `Livraison rapide dans toutes les wilayas`],
    [`متوفر · توصيل سريع`, `In stock · fast delivery`, `En stock · livraison rapide`],
    [`الاسم الكامل *`, `Full name *`, `Nom complet *`],
    [`رقم الهاتف *`, `Phone number *`, `Numéro de téléphone *`],
    [`اختر الولاية`, `Select your wilaya`, `Choisissez la wilaya`],
    [`البلدية *`, `Commune *`, `Commune *`],
    [`العنوان (الحي/الشارع) *`, `Address (district / street) *`, `Adresse (quartier / rue) *`],
    [`🏠 للمنزل`, `🏠 Home`, `🏠 À domicile`],
    [`🏢 للمكتب`, `🏢 Pickup desk`, `🏢 Au bureau`],
    [`التوصيل:`, `Delivery:`, `Livraison :`],
    [`الإجمالي:`, `Total:`, `Total :`],
    [`أضف للسلة`, `Add to cart`, `Ajouter au panier`],
    [`شراء فوري`, `Buy now`, `Acheter maintenant`],
    [`وصف المنتج`, `Product description`, `Description du produit`],

    // ---- Nav / chrome ----
    [`الرئيسية`, `Home`, `Accueil`],
    [`المنتجات`, `Products`, `Produits`],
    [`آراء العملاء`, `Reviews`, `Avis clients`],
    [`اتصل بنا`, `Contact us`, `Contactez-nous`],
    [`الوضع المظلم`, `Dark mode`, `Mode sombre`],
    [`القائمة`, `Menu`, `Menu`],
    [`إغلاق`, `Close`, `Fermer`],
    [`السابق`, `Previous`, `Précédent`],
    [`التالي`, `Next`, `Suivant`],
    [`صورة 1`, `Image 1`, `Image 1`],
    [`صورة 2`, `Image 2`, `Image 2`],
    [`صورة 3`, `Image 3`, `Image 3`],
    [`صورة 4`, `Image 4`, `Image 4`],
    [`صورة 5`, `Image 5`, `Image 5`],
    [`فيسبوك`, `Facebook`, `Facebook`],
    [`واتساب`, `WhatsApp`, `WhatsApp`],

    // ---- Page titles ----
    [`ROBUSTE eulma - المتجر الرسمي`, `ROBUSTE eulma - Official Store`, `ROBUSTE eulma - Boutique officielle`],
    [`ROBUSTE | تفاصيل المنتج`, `ROBUSTE | Product details`, `ROBUSTE | Détails du produit`],

    // ---- Hero ----
    [`أجهزة منزلية تجعل حياتك أسهل`, `Home appliances that make your life easier`, `Des appareils ménagers qui vous simplifient la vie`],
    [`جودة عالية بأسعار تنافسية لكل منزل جزائري مع خدمة توصيل سريعة وضمان سنة واحدة`, `High quality at competitive prices for every Algerian home, with fast delivery and a 1-year warranty`, `Une haute qualité à prix compétitifs pour chaque foyer algérien, avec livraison rapide et garantie de 1 an`],
    [`تسوق الآن`, `Shop now`, `Acheter maintenant`],

    // ---- Trust bar ----
    [`توصيل حتى باب البيت`, `Door-to-door delivery`, `Livraison à domicile`],
    [`إلى جميع الولايات`, `To all provinces`, `Vers toutes les wilayas`],
    [`إلى 58 ولاية`, `To 58 provinces`, `Vers 58 wilayas`],
    [`ضمان عام`, `Warranty included`, `Garantie incluse`],
    [`جودة مضمونة`, `Guaranteed quality`, `Qualité garantie`],
    [`منتجات أصلية`, `Authentic products`, `Produits authentiques`],
    [`خدمة ما بعد الشراء`, `After-sales service`, `Service après-vente`],
    [`دعم دائم لك`, `Always here to help`, `Toujours à votre service`],
    [`دعم متواصل`, `Continuous support`, `Support continu`],
    [`دفع يد بيد`, `Pay on delivery`, `Paiement à la livraison`],
    [`ادفع عند الاستلام`, `Pay upon receipt`, `Payez à la réception`],
    [`عند الاستلام`, `Upon receipt`, `À la réception`],

    // ---- Offers ----
    [`🔥 عروض حصرية 🔥`, `🔥 Exclusive offers 🔥`, `🔥 Offres exclusives 🔥`],
    [`استفد من عروضنا الاستثنائية مع تخفيضات تصل إلى 30% على أفضل الأجهزة المنزلية. العرض محدود زمنياً!`, `Take advantage of our exceptional offers with discounts up to 30% on the best home appliances. Limited-time offer!`, `Profitez de nos offres exceptionnelles avec jusqu'à 30% de réduction sur les meilleurs appareils. Offre à durée limitée !`],
    [`⏳ ينتهي العرض خلال :`, `⏳ Offer ends in:`, `⏳ L'offre se termine dans :`],
    [`أيام`, `Days`, `Jours`],
    [`ساعات`, `Hours`, `Heures`],
    [`دقائق`, `Minutes`, `Minutes`],
    [`ثواني`, `Seconds`, `Secondes`],
    [`الأكثر مبيعاً`, `Best seller`, `Meilleure vente`],
    [`الأعلى مبيعاً`, `Top seller`, `Top des ventes`],
    [`جديد`, `New`, `Nouveau`],
    [`عرض خاص`, `Special offer`, `Offre spéciale`],
    [`اشتر الآن`, `Buy now`, `Acheter`],

    // ---- Products / categories ----
    [`أحدث منتجاتنا`, `Our latest products`, `Nos derniers produits`],
    [`الكل`, `All`, `Tous`],
    [`العناية بالشعر`, `Hair care`, `Soin des cheveux`],
    [`أجهزة المطبخ`, `Kitchen appliances`, `Électroménager cuisine`],
    [`العناية الشخصية`, `Personal care`, `Soin personnel`],
    [`الأجهزة المنزلية`, `Home appliances`, `Électroménager`],
    [`الحديقة`, `Garden`, `Jardin`],
    [`آلات القهوة`, `Coffee machines`, `Machines à café`],
    [`متوفر`, `In stock`, `En stock`],
    [`غير متوفر`, `Out of stock`, `En rupture`],
    [`منتج بدون اسم`, `Unnamed product`, `Produit sans nom`],

    // ---- Reviews ----
    [`عمر`, `Omar`, `Omar`],
    [`روز بلانش`, `Rose Blanche`, `Rose Blanche`],
    [`محمد`, `Mohamed`, `Mohamed`],
    [`"جودة المنتج ممتازة والتوصيل كان في الموعد، شكراً لفريق ROBUSTE!"`, `"Excellent product quality and delivery was right on time. Thank you, ROBUSTE team!"`, `"Excellente qualité du produit et livraison à l'heure. Merci à l'équipe ROBUSTE !"`],
    [`"أنا سعيدة بعلامة ROBUSTE، أستخدم منتجاتكم منذ سنوات عديدة."`, `"I'm happy with the ROBUSTE brand; I've been using your products for many years."`, `"Je suis satisfaite de la marque ROBUSTE ; j'utilise vos produits depuis de nombreuses années."`],
    [`"الدفع عند الاستلام مريح جداً، والمنتج يعمل بكفاءة عالية، أنصح بالتعامل معهم."`, `"Cash on delivery is very convenient and the product works great. I recommend them."`, `"Le paiement à la livraison est très pratique et le produit fonctionne très bien. Je les recommande."`],

    // ---- Order modal ----
    [`طلب منتج`, `Order product`, `Commander le produit`],
    [`ملخص الطلب`, `Order summary`, `Résumé de la commande`],
    [`الاسم واللقب`, `Full name`, `Nom complet`],
    [`الاسم الكامل *`, `Full name *`, `Nom complet *`],
    [`رقم الهاتف`, `Phone number`, `Numéro de téléphone`],
    [`رقم الهاتف *`, `Phone number *`, `Numéro de téléphone *`],
    [`مثال: 0551234566`, `Example: 0551234566`, `Exemple : 0551234566`],
    [`البريد الإلكتروني (اختياري)`, `Email (optional)`, `E-mail (optionnel)`],
    [`البريد الإلكتروني`, `Email`, `E-mail`],
    [`الولاية`, `Province`, `Wilaya`],
    [`الولاية *`, `Province *`, `Wilaya *`],
    [`اختر ولايتك`, `Choose your province`, `Choisissez votre wilaya`],
    [`اختر الولاية`, `Choose province`, `Choisir la wilaya`],
    [`العنوان`, `Address`, `Adresse`],
    [`طريقة الدفع`, `Payment method`, `Mode de paiement`],
    [`الدفع عند الاستلام`, `Cash on delivery`, `Paiement à la livraison`],
    [`الدفع عبر الإنترنت`, `Online payment`, `Paiement en ligne`],
    [`إلغاء`, `Cancel`, `Annuler`],
    [`تأكيد الطلب`, `Confirm order`, `Confirmer la commande`],
    [`جاري المعالجة...`, `Processing...`, `Traitement...`],
    [`جاري الإرسال...`, `Sending...`, `Envoi...`],

    // ---- Contact ----
    [`معلومات الاتصال`, `Contact information`, `Coordonnées`],
    [`الهاتف`, `Phone`, `Téléphone`],
    [`ساعات العمل`, `Working hours`, `Horaires`],
    [`يومياً من 07:00 إلى 16:00`, `Daily from 07:00 to 16:00`, `Tous les jours de 07:00 à 16:00`],
    [`تابعنا على`, `Follow us`, `Suivez-nous`],
    [`أرسل لنا رسالة`, `Send us a message`, `Envoyez-nous un message`],
    [`اسمك`, `Your name`, `Votre nom`],
    [`بريدك الإلكتروني`, `Your email`, `Votre e-mail`],
    [`رسالتك`, `Your message`, `Votre message`],
    [`إرسال الرسالة`, `Send message`, `Envoyer le message`],
    [`موقع المتجر`, `Store location`, `Emplacement du magasin`],

    // ---- Footer ----
    [`نبذة عن ROBUSTE`, `About ROBUSTE`, `À propos de ROBUSTE`],
    [`متجر متخصص في الأجهزة المنزلية عالية الجودة بأسعار تنافسية. نقدم أفضل المنتجات مع توصيل سريع.`, `A store specialized in high-quality home appliances at competitive prices. We offer the best products with fast delivery.`, `Une boutique spécialisée dans l'électroménager de haute qualité à prix compétitifs. Nous offrons les meilleurs produits avec une livraison rapide.`],
    [`روابط سريعة`, `Quick links`, `Liens rapides`],
    [`خدمة العملاء`, `Customer service`, `Service client`],
    [`الأسئلة الشائعة`, `FAQ`, `FAQ`],
    [`طرق الدفع`, `Payment methods`, `Moyens de paiement`],
    [`شروط الضمان`, `Warranty terms`, `Conditions de garantie`],
    [`اشترك في صفحتنا`, `Follow our page`, `Suivez notre page`],
    [`اشترك لتصلك أحدث العروض`, `Subscribe for the latest offers`, `Abonnez-vous pour les dernières offres`],
    [`اشترك الآن`, `Subscribe now`, `S'abonner`],
    [`© 2025 ROBUSTE. جميع الحقوق محفوظة.`, `© 2025 ROBUSTE. All rights reserved.`, `© 2025 ROBUSTE. Tous droits réservés.`],
    [`© 2025 ROBUSTE — جميع الحقوق محفوظة`, `© 2025 ROBUSTE — All rights reserved`, `© 2025 ROBUSTE — Tous droits réservés`],
    [`الدفع متاح ببطاقة الذهب`, `Payment available with the Edahabia card`, `Paiement par carte Edahabia`],

    // ---- Cart ----
    [`السلة`, `Cart`, `Panier`],
    [`سلة التسوق`, `Shopping cart`, `Panier`],
    [`سلة التسوق فارغة`, `Your cart is empty`, `Votre panier est vide`],
    [`سلة المشتريات فارغة`, `Your cart is empty`, `Votre panier est vide`],
    [`لم تقم بإضافة أي منتجات إلى السلة بعد`, `You haven't added any products to the cart yet`, `Vous n'avez encore ajouté aucun produit au panier`],
    [`استكشف منتجاتنا وأضف ما يناسبك`, `Explore our products and add what suits you`, `Découvrez nos produits et ajoutez ce qui vous convient`],
    [`استكشف المنتجات`, `Explore products`, `Découvrir les produits`],
    [`تصفح المنتجات`, `Browse products`, `Parcourir les produits`],
    [`المجموع:`, `Total:`, `Total :`],
    [`إنهاء الطلب`, `Checkout`, `Finaliser la commande`],
    [`إتمام الشراء`, `Complete purchase`, `Finaliser l'achat`],

    // ---- Product page ----
    [`أضف للسلة`, `Add to cart`, `Ajouter au panier`],
    [`شراء فوري`, `Buy now`, `Achat immédiat`],
    [`طلب سريع`, `Quick order`, `Commande rapide`],
    [`متوفر · توصيل سريع`, `In stock · Fast delivery`, `En stock · Livraison rapide`],
    [`وصف المنتج`, `Product description`, `Description du produit`],
    [`قد يعجبك أيضاً`, `You may also like`, `Vous aimerez aussi`],
    [`المنتج غير موجود`, `Product not found`, `Produit introuvable`],
    [`فشل تحميل المنتج`, `Failed to load product`, `Échec du chargement du produit`],
    [`جودة عالية`, `High quality`, `Haute qualité`],
    [`ضمان سنتان`, `2-year warranty`, `Garantie 2 ans`],
    [`توصيل سريع`, `Fast delivery`, `Livraison rapide`],
    [`منتج عالي الجودة من ROBUSTE`, `A high-quality product by ROBUSTE`, `Un produit de haute qualité de ROBUSTE`],

    // ---- Success overlay / toasts ----
    [`تم تأكيد طلبكم`, `Your order is confirmed`, `Votre commande est confirmée`],
    [`سنتواصل معكم قريباً على رقمكم الخاص`, `We'll contact you soon on your number`, `Nous vous contacterons bientôt sur votre numéro`],
    [`شكراً لثقتكم بنا`, `Thank you for your trust`, `Merci de votre confiance`],
    [`تواصل عبر واتساب`, `Contact via WhatsApp`, `Contacter via WhatsApp`],
    [`تم إزالة المنتج`, `Item removed`, `Article retiré`],
    [`السلة فارغة`, `Cart is empty`, `Panier vide`],
    [`يرجى ملء جميع الحقول المطلوبة`, `Please fill in all required fields`, `Veuillez remplir tous les champs requis`],
    [`الرجاء ملء جميع الحقول المطلوبة`, `Please fill in all required fields`, `Veuillez remplir tous les champs requis`],
    [`يرجى ملء البيانات`, `Please fill in the details`, `Veuillez remplir les informations`],
    [`رقم هاتف غير صحيح`, `Invalid phone number`, `Numéro de téléphone invalide`],
    [`حدث خطأ، حاول مجدداً`, `An error occurred, please try again`, `Une erreur s'est produite, réessayez`],
    [`حدث خطأ`, `An error occurred`, `Une erreur s'est produite`],

    // ---- Added: order tracking / delivery / totals / footer ----
    [`تتبع طلبي`, `Track my order`, `Suivre ma commande`],
    [`طريقة التوصيل`, `Delivery method`, `Mode de livraison`],
    [`🏠 للمنزل`, `🏠 Home`, `🏠 À domicile`],
    [`🏢 للمكتب`, `🏢 Pickup desk`, `🏢 Au bureau`],
    [`المجموع الفرعي`, `Subtotal`, `Sous-total`],
    [`المجموع الفرعي:`, `Subtotal:`, `Sous-total :`],
    [`سعر التوصيل`, `Delivery cost`, `Frais de livraison`],
    [`التوصيل:`, `Delivery:`, `Livraison :`],
    [`المجموع الإجمالي`, `Grand total`, `Total général`],
    [`عرض الكل`, `View all`, `Tout afficher`],
    [`سياسة الخصوصية`, `Privacy policy`, `Politique de confidentialité`],
    [`الاشتراك في فيسبوك`, `Follow on Facebook`, `Suivre sur Facebook`],
    [`فتح الموقع على الخريطة`, `Open location on map`, `Ouvrir l'emplacement sur la carte`],
    [`موقع متجر ROBUSTE EL EULMA`, `ROBUSTE EL EULMA store location`, `Emplacement du magasin ROBUSTE EL EULMA`],
    [`العلمة، ولاية سطيف، الجزائر`, `El Eulma, Sétif Province, Algeria`, `El Eulma, Wilaya de Sétif, Algérie`]
  ];

  var T = {};
  for (var i = 0; i < ROWS.length; i++) { T[normKey(ROWS[i][0])] = { en: ROWS[i][1], fr: ROWS[i][2] }; }

  var NAMES = { ar: "العربية", en: "English", fr: "Français" };
  var ATTRS = ["placeholder", "title", "aria-label", "alt"];
  var origText = new WeakMap();
  var origAttr = new WeakMap();
  var docTitleOrig = null;
  var CUR = detect();
  var observer = null;
  var pending = false;
  var bsLink = null, bsOrigHref = null;

  function detect() {
    // 1) an explicit choice made with the globe switcher always wins
    try { var s = localStorage.getItem("site_lang"); if (s === "ar" || s === "en" || s === "fr") return s; } catch (e) {}
    // 2) otherwise follow the visitor's own browser / phone language
    try {
      var list = (navigator.languages && navigator.languages.length)
        ? navigator.languages
        : [navigator.language || navigator.userLanguage || ""];
      for (var i = 0; i < list.length; i++) {
        var c = String(list[i] || "").toLowerCase();
        if (c.indexOf("ar") === 0) return "ar";
        if (c.indexOf("fr") === 0) return "fr";
        if (c.indexOf("en") === 0) return "en";
      }
    } catch (e) {}
    // 3) unknown language -> Arabic
    return "ar";
  }

  function normKey(s) {
    s = String(s);
    try { s = s.normalize("NFKC"); } catch (e) {}
    return s
      .replace(/[\uFE00-\uFE0F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "")
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tr(text, lang) {
    var key = text.trim();
    if (!key) return text;
    var lead = (text.match(/^\s*/) || [""])[0];
    var trail = (text.match(/\s*$/) || [""])[0];
    var out = key;
    var e = T[normKey(text)];
    if (lang !== "ar" && e && e[lang] != null) out = e[lang];
    if (lang !== "ar") out = out.replace(/د\.ج/g, "DA").replace(/دج/g, "DA");
    return lead + out + trail;
  }

  function translateNode(node, lang) {
    if (!origText.has(node)) origText.set(node, node.nodeValue);
    var o = origText.get(node);
    var v = tr(o, lang);
    if (node.nodeValue !== v) node.nodeValue = v;
  }

  function translateEl(el, lang) {
    var store = origAttr.get(el);
    if (!store) { store = {}; origAttr.set(el, store); }
    for (var k = 0; k < ATTRS.length; k++) {
      var a = ATTRS[k];
      if (el.hasAttribute(a)) {
        if (!(a in store)) store[a] = el.getAttribute(a);
        var v = tr(store[a], lang);
        if (el.getAttribute(a) !== v) el.setAttribute(a, v);
      }
    }
  }

  function findBootstrap() {
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute("href") || "";
      if (/bootstrap(\.rtl)?\.min\.css/.test(href)) {
        bsLink = links[i]; bsOrigHref = href; return;
      }
    }
  }

  function setDir(lang) {
    var rtl = (lang === "ar");
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", rtl ? "rtl" : "ltr");
    if (bsLink && bsOrigHref) {
      var want = rtl
        ? bsOrigHref.replace("bootstrap.min.css", "bootstrap.rtl.min.css")
        : bsOrigHref.replace("bootstrap.rtl.min.css", "bootstrap.min.css");
      if (bsLink.getAttribute("href") !== want) bsLink.setAttribute("href", want);
    }
  }

  function inSwitcher(node) {
    var el = node.nodeType === 1 ? node : node.parentNode;
    // Dynamic Packs cards translate themselves after the language event.
    // Everything else keeps the normal i18n.js behavior.
    return !!(el && el.closest && el.closest("#i18nSwitcher,[data-i18n-skip]"));
  }

  function applyLang(lang) {
    CUR = lang;
    try { localStorage.setItem("site_lang", lang); } catch (e) {}
    setDir(lang);
    if (docTitleOrig == null) docTitleOrig = document.title;
    document.title = tr(docTitleOrig, lang).trim();
    if (observer) observer.disconnect();
    try {
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode: function (n) {
          var p = n.parentNode;
          if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName;
          if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
          if (inSwitcher(p)) return NodeFilter.FILTER_REJECT;
          if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        }
      });
      var nodes = [], cur;
      while ((cur = walker.nextNode())) nodes.push(cur);
      for (var i = 0; i < nodes.length; i++) translateNode(nodes[i], lang);
      var els = document.querySelectorAll("[placeholder],[title],[aria-label],[alt]");
      for (var j = 0; j < els.length; j++) { if (!inSwitcher(els[j])) translateEl(els[j], lang); }
    } catch (e) { /* never break the page */ }
    updateSwitcherLabel(lang);
    window.dispatchEvent(new CustomEvent("robuste:languagechange", { detail: { lang: lang } }));
    if (observer) connectObserver();
  }

  function connectObserver() {
    if (observer && document.body) observer.observe(document.body, { childList: true, subtree: true });
  }

  function buildSwitcher() {
    if (document.getElementById("i18nSwitcher")) return;
    var style = document.createElement("style");
    style.textContent =
      "#i18nSwitcher{position:relative;display:inline-block;margin-inline-end:8px;}" +
      "#i18nSwitcher .i18n-btn{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 12px;border-radius:22px;border:1px solid rgba(0,0,0,.12);background:rgba(0,0,0,.05);color:inherit;font-weight:700;font-size:.88rem;cursor:pointer;line-height:1;}" +
      "#i18nSwitcher .i18n-btn:hover{background:var(--primary,#FF6B35);color:#fff;}" +
      "#i18nSwitcher .i18n-menu{position:absolute;top:52px;inset-inline-end:0;min-width:150px;background:var(--light,#fff);border:1px solid rgba(0,0,0,.1);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.18);padding:6px;display:none;z-index:4000;}" +
      "#i18nSwitcher.open .i18n-menu{display:block;}" +
      "#i18nSwitcher .i18n-menu button{display:block;width:100%;text-align:start;padding:10px 12px;border:none;background:none;border-radius:8px;cursor:pointer;font-weight:600;color:var(--dark,#333);font-size:.9rem;}" +
      "#i18nSwitcher .i18n-menu button:hover{background:rgba(255,107,53,.12);}" +
      "#i18nSwitcher .i18n-menu button.active{background:var(--primary,#FF6B35);color:#fff;}";
    document.head.appendChild(style);

    var wrap = document.createElement("div");
    wrap.id = "i18nSwitcher";
    wrap.innerHTML =
      '<button type="button" class="i18n-btn" id="i18nBtn" aria-haspopup="true" aria-expanded="false" aria-label="Language"><i class="bi bi-globe2"></i> <span id="i18nCur"></span></button>' +
      '<div class="i18n-menu" id="i18nMenu" role="menu">' +
      '<button type="button" role="menuitem" data-lang="ar">العربية</button>' +
      '<button type="button" role="menuitem" data-lang="en">English</button>' +
      '<button type="button" role="menuitem" data-lang="fr">Français</button>' +
      "</div>";

    var tgl = document.getElementById("themeToggle");
    if (tgl && tgl.parentNode) { tgl.parentNode.insertBefore(wrap, tgl); }
    else {
      var nav = document.querySelector(".navbar .container") || document.body;
      nav.appendChild(wrap);
    }

    var btn = wrap.querySelector("#i18nBtn");
    var menu = wrap.querySelector("#i18nMenu");
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = wrap.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function () {
      wrap.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    });
    var items = menu.querySelectorAll("button");
    for (var i = 0; i < items.length; i++) {
      items[i].addEventListener("click", function (e) {
        e.stopPropagation();
        wrap.classList.remove("open");
        applyLang(this.getAttribute("data-lang"));
      });
    }
  }

  function updateSwitcherLabel(lang) {
    var cur = document.getElementById("i18nCur");
    if (cur) cur.textContent = NAMES[lang] || lang;
    var items = document.querySelectorAll("#i18nMenu button");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("active", items[i].getAttribute("data-lang") === lang);
    }
  }

  function init() {
    try { findBootstrap(); } catch (e) {}
    try { buildSwitcher(); } catch (e) {}
    observer = new MutationObserver(function (muts) {
      if (CUR === "ar") return;
      var relevant = false;
      for (var i = 0; i < muts.length; i++) {
        if (!inSwitcher(muts[i].target)) { relevant = true; break; }
      }
      if (!relevant || pending) return;
      pending = true;
      (window.requestAnimationFrame || window.setTimeout)(function () {
        pending = false;
        applyLang(CUR);
      }, 50);
    });
    applyLang(CUR);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
