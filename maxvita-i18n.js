/* Product 109 copy. The shared language switcher also uses these on catalog cards. */
(function () {
  'use strict';
  var rows = [
    ['عصارة الحمضيات ROBUSTE maxVita 600','ROBUSTE maxVita 600 Citrus Juicer','Presse-agrumes ROBUSTE maxVita 600'],
    ['عصارة الحمضيات ROBUSTE maxVita 600 | ROBUSTE','ROBUSTE maxVita 600 Citrus Juicer | ROBUSTE','Presse-agrumes ROBUSTE maxVita 600 | ROBUSTE'],
    ['عصارة الحمضيات','Citrus juicer','Presse-agrumes'],
    ['عصارة كهربائية','ELECTRIC JUICER','PRESSE-AGRUMES ÉLECTRIQUE'],
    ['عصير طازج تحضّرو في دارك. عصارة كهربائية بسعة 0.6 لتر ودوران في اتجاهين، للبرتقال والليمون والجريب فروت والرمان.','Fresh juice, made at home. A 0.6 L electric juicer with two-way rotation for oranges, lemons, grapefruit and pomegranates.','Du jus frais, préparé chez vous. Un presse-agrumes électrique de 0,6 L à double sens de rotation pour les oranges, citrons, pamplemousses et grenades.'],
    ['ابدأ نهارك بطعم العصير الطازج مع ROBUSTE maxVita 600. للبرتقال والليمون والجريب فروت والرمان، مع دوران في اتجاهين وإبريق مدرّج بسعة 0.6 لتر ومقبض وفوهة للصب. تأتي بغطاء لحفظ نكهة العصير وبقدرة 30 واط. حضّر الثمرة واعصرها حسب تعليمات الجهاز.','Start your day with fresh juice from the ROBUSTE maxVita 600. For oranges, lemons, grapefruit and pomegranates, with two-way rotation and a graduated 0.6 L jug with a handle and pouring spout. Includes a cover to preserve the flavour of your juice and a 30 W motor. Prepare and press the fruit as directed in the manual.','Commencez la journée avec le jus frais du ROBUSTE maxVita 600. Pour les oranges, citrons, pamplemousses et grenades, avec double sens de rotation et pichet gradué de 0,6 L, poignée et bec verseur. Livré avec un couvercle pour préserver la saveur du jus et un moteur de 30 W. Préparez et pressez les fruits selon la notice.'],
    ['بداية نهارك،','Start your day,','Commencez la journée,'],
    ['بطعم طازج.','with a fresh taste.','avec une touche de fraîcheur.'],
    ['حمضيات تختارها. عصير تحضّرو في دارك.','Your choice of citrus. Your juice, made at home.','Vos agrumes préférés. Votre jus, fait maison.'],
    ['سعة 0.6 لتر · إبريق مدرّج','0.6 L capacity · graduated jug','Capacité de 0,6 L · pichet gradué'],
    ['دوران في اتجاهين: يمين / يسار','Two-way rotation: left / right','Rotation dans les deux sens : gauche / droite'],
    ['للحمضيات والرمان','For citrus fruits and pomegranates','Pour les agrumes et les grenades'],
    ['قدرة 30 واط · غطاء مرفق','30 W power · cover included','Puissance de 30 W · couvercle inclus'],
    ['مصاريف التوصيل حسب الولاية','Delivery fees depend on your wilaya','Frais de livraison selon la wilaya'],
    ['العرض ينتهي في 31 أكتوبر 2026','Offer ends on 31 October 2026','Offre valable jusqu’au 31 octobre 2026'],
    ['عرض خاص','Special offer','Offre spéciale'],
    ['وفّر','Save','Économisez'],
    ['مواصفات موضّحة','Clear product specifications','Caractéristiques détaillées'],
    ['عصيرك الطازج يبدأ هنا','Your fresh juice starts here','Votre jus frais commence ici'],
    ['اطلب maxVita','Order maxVita','Commandez maxVita'],
    ['املأ معلوماتك، اختر التوصيل وشاهد المجموع.','Enter your details, choose delivery and review your total.','Renseignez vos coordonnées, choisissez la livraison et consultez le total.'],
    ['الاسم الكامل','Full name','Nom complet'],
    ['الاسم','Name','Nom'],
    ['رقم الهاتف','Phone number','Numéro de téléphone'],
    ['الولاية','Wilaya','Wilaya'],
    ['البلدية','Commune','Commune'],
    ['العنوان','Address','Adresse'],
    ['الكمية','Quantity','Quantité'],
    ['أهم المواصفات','Key specifications','Caractéristiques principales'],
    ['سعة الإبريق','Jug capacity','Capacité du pichet'],
    ['قدرة المحرك','Motor power','Puissance du moteur'],
    ['اتجاهان','Two directions','Deux sens'],
    ['دوران يمين ويسار','Left and right rotation','Rotation gauche et droite'],
    ['غطاء','Cover','Couvercle'],
    ['مرفق مع العصارة','Included with the juicer','Inclus avec l’appareil'],
    ['من الثمرة للكأس','FROM FRUIT TO GLASS','DU FRUIT AU VERRE'],
    ['البرتقال اللي تحبّه،','The oranges you love,','Les oranges que vous aimez,'],
    ['بالطعم اللي تعرفه.','the taste you know.','le goût que vous connaissez.'],
    ['لفطور الصباح أو كأس على مهل، حضّر عصيرك من الحمضيات اللي تختارها. نكهة البرتقال وفيتامين C الطبيعي، في روتين بسيط في دارك.','For breakfast or a quiet moment, prepare juice from the citrus fruits you choose. Orange flavour and naturally occurring vitamin C, in a simple routine at home.','Au petit-déjeuner ou pour une pause, préparez votre jus avec les agrumes de votre choix. Le goût de l’orange et sa vitamine C naturelle, dans un rituel simple à la maison.'],
    ['دوران في اتجاهين','Two-way rotation','Double sens de rotation'],
    ['الرأس يدور يمين ويسار للمساعدة على عصر الثمرة.','The cone rotates left and right to help extract the juice.','Le cône tourne à gauche et à droite pour faciliter l’extraction du jus.'],
    ['صبّ العصير بسهولة','Pour with ease','Versez facilement'],
    ['مقبض وفوهة صبّ لنقل العصير من الإبريق إلى كأسك.','A handle and pouring spout to transfer juice from the jug to your glass.','Une poignée et un bec verseur pour passer du pichet au verre.'],
    ['اطلب عصارتك','Order your juicer','Commandez votre presse-agrumes'],
    ['لحظة طازجة، كل يوم','A FRESH MOMENT, EVERY DAY','UN MOMENT DE FRAÎCHEUR, CHAQUE JOUR'],
    ['كأس عصير.','A glass of juice.','Un verre de jus.'],
    ['وبداية على ذوقك.','A start that suits you.','Un début de journée à votre goût.'],
    ['إبريق مدرّج تشوف فيه الكمية، مقبض للصب وغطاء مرفق. تفاصيل بسيطة من التحضير حتى التقديم.','A graduated jug to see the quantity, a handle for pouring and an included cover. Simple details, from preparation to serving.','Un pichet gradué pour voir la quantité, une poignée pour verser et un couvercle inclus. Des détails simples, de la préparation au service.'],
    ['طريقة الاستعمال','HOW TO USE IT','MODE D’EMPLOI'],
    ['حضّرها. اعصرها. استمتع.','Prepare. Press. Enjoy.','Préparez. Pressez. Savourez.'],
    ['حضّر الحمضيات','Prepare the fruit','Préparez les fruits'],
    ['اغسل الثمرة واقطعها إلى نصفين، ثم حضّر الجهاز حسب الدليل.','Wash the fruit and cut it in half, then prepare the appliance according to the manual.','Lavez le fruit et coupez-le en deux, puis préparez l’appareil selon la notice.'],
    ['ابدأ العصر','Start juicing','Commencez à presser'],
    ['انزع الغطاء واضغط نصف الثمرة على الرأس حسب تعليمات دليل الجهاز.','Remove the cover and press half the fruit onto the cone as directed in the manual.','Retirez le couvercle et pressez un demi-fruit sur le cône selon la notice.'],
    ['صبّ وقدّم','Pour and serve','Versez et servez'],
    ['بعد الانتهاء، افصل الجهاز عن الكهرباء وصبّ العصير. نظّف الأجزاء حسب الدليل.','When finished, unplug the appliance and pour the juice. Clean the parts according to the manual.','Une fois terminé, débranchez l’appareil et versez le jus. Nettoyez les pièces selon la notice.'],
    ['تعرّف على عصارتك','GET TO KNOW YOUR JUICER','DÉCOUVREZ VOTRE APPAREIL'],
    ['maxVita 600، بالتفصيل.','maxVita 600, in detail.','maxVita 600, en détail.'],
    ['المواصفات المكتوبة على علبة ROBUSTE maxVita 600','Specifications printed on the ROBUSTE maxVita 600 box','Caractéristiques indiquées sur la boîte ROBUSTE maxVita 600'],
    ['الموديل','Model','Modèle'],['السعة','Capacity','Capacité'],['القدرة','Power','Puissance'],
    ['الدوران','Rotation','Rotation'],['الكهرباء','Power supply','Alimentation'],['الغطاء','Cover','Couvercle'],
    ['0.6 لتر / 600 مل','0.6 L / 600 ml','0,6 L / 600 ml'],['30 واط','30 W','30 W'],
    ['في اتجاهين: يمين ويسار','Two directions: left and right','Deux sens : gauche et droite'],
    ['غطاء مرفق لحفظ نكهة العصير','Included cover to preserve the flavour of your juice','Couvercle inclus pour préserver la saveur du jus'],
    ['شاهد المواصفات على العلبة','View the specifications on the box','Voir les caractéristiques sur la boîte'],
    ['عندك سؤال؟','HAVE A QUESTION?','UNE QUESTION ?'],
    ['قبل ما تطلب.','Before you order.','Avant de commander.'],
    ['تواصل معنا عبر واتساب ←','Contact us on WhatsApp →','Contactez-nous sur WhatsApp →'],
    ['واش نقدر نعصر بها؟','Which fruits can I juice?','Quels fruits peut-on presser ?'],
    ['يمكنك عصر البرتقال والليمون الأصفر والأخضر والجريب فروت والرمان.','You can juice oranges, lemons, limes, grapefruit and pomegranates.','Vous pouvez presser des oranges, citrons jaunes et verts, pamplemousses et grenades.'],
    ['واش يجي معها؟','What is included?','Que contient la boîte ?'],
    ['العصارة بإبريق 0.6 لتر وغطاء. اتبع الدليل المرفق لتركيب الأجزاء واستعمالها.','The juicer with a 0.6 L jug and cover. Follow the included manual to assemble and use the parts.','Le presse-agrumes avec pichet de 0,6 L et couvercle. Suivez la notice fournie pour assembler et utiliser les pièces.'],
    ['كيفاش ننظّفها؟','How do I clean it?','Comment le nettoyer ?'],
    ['افصل الكهرباء أولاً واتبع تعليمات تفكيك وتنظيف الأجزاء في دليل الجهاز. لا تغمر قاعدة المحرك في الماء.','Unplug it first and follow the manual’s instructions for disassembly and cleaning. Do not immerse the motor base in water.','Débranchez-le d’abord et suivez la notice pour le démontage et le nettoyage. Ne plongez pas la base moteur dans l’eau.'],
    ['وقتاش نخلّص؟','When do I pay?','Quand dois-je payer ?'],
    ['الدفع عند استلام الطلب. نتواصل معك لتأكيد معلومات الطلب والتوصيل.','Pay when your order arrives. We contact you to confirm your order and delivery details.','Payez à la réception. Nous vous contactons pour confirmer les informations de commande et de livraison.'],
    ['خلّي الطازج جزءًا من نهارك.','Make freshness part of your day.','Faites une place à la fraîcheur dans votre journée.'],
    ['اختر ولايتك وشوف المجموع قبل تأكيد الطلب.','Choose your wilaya and review the total before confirming.','Choisissez votre wilaya et consultez le total avant de confirmer.'],
    ['اطلب maxVita الآن','Order maxVita now','Commandez maxVita maintenant'],
    ['جرّبت maxVita؟ شاركنا تجربتك.','Tried maxVita? Share your experience.','Vous avez essayé maxVita ? Partagez votre expérience.'],
    ['عصر نصف برتقالة بعصارة ROBUSTE maxVita','Pressing half an orange with the ROBUSTE maxVita juicer','Pressage d’une demi-orange avec le ROBUSTE maxVita'],
    ['عصارة maxVita وكأس عصير برتقال على طاولة المطبخ','The maxVita juicer and a glass of orange juice on a kitchen counter','Le presse-agrumes maxVita et un verre de jus d’orange dans une cuisine'],
    ['تفاصيل رأس العصر والمصفاة والإبريق','Details of the pressing cone, strainer and jug','Détails du cône, du filtre et du pichet'],
    ['تغيير المظهر','Change theme','Changer le thème'],['فتح القائمة','Open menu','Ouvrir le menu'],
    ['اختر كمية بين 1 و20','Choose a quantity from 1 to 20','Choisissez une quantité de 1 à 20'],
    ['اسألنا عن توفر المنتج','Ask us about availability','Demandez-nous la disponibilité'],
    ['المنتج غير متوفر حالياً','This product is currently unavailable','Ce produit est actuellement indisponible']
  ];
  for(var n=1;n<=4;n++) {
    rows.push(['عرض الصورة '+n,'View image '+n,'Voir l’image '+n]);
    rows.push(['صورة '+n+' لعصارة maxVita','Image '+n+' of the maxVita juicer','Image '+n+' du presse-agrumes maxVita']);
  }
  window.RB_I18N_ROWS=(window.RB_I18N_ROWS||[]).concat(rows);
  // Keep search and social metadata in the same language as the selected page.
  function translate(text,lang){var row=rows.find(function(r){return r[0]===text;});return row ? row[lang==='fr'?2:lang==='en'?1:0] : text;}
  window.addEventListener('robuste:languagechange',function(event){
    if(window.RB_PID!==109)return;
    var lang=event.detail.lang;
    var product=(window.RB_ALL||[]).find(function(p){return p.id===109;});
    var name=translate(rows[0][0],lang);
    document.title=name+' | ROBUSTE';
    ['og:title','twitter:title','og:image:alt'].forEach(function(key){var el=document.querySelector('meta[property="'+key+'"],meta[name="'+key+'"]');if(el)el.content=name;});
    if(product){
      var desc=translate(product.description_short,lang);
      ['description','og:description','twitter:description'].forEach(function(key){var el=document.querySelector('meta[property="'+key+'"],meta[name="'+key+'"]');if(el)el.content=desc;});
      var schema=document.getElementById('product-jsonld');
      if(schema){try{var data=JSON.parse(schema.textContent);data.name=name;data.description=translate(product.description_long,lang);schema.textContent=JSON.stringify(data);}catch(_){}}
    }
    var locale=document.querySelector('meta[property="og:locale"]');if(locale)locale.content=lang==='fr'?'fr_DZ':lang==='en'?'en_GB':'ar_DZ';
  });
})();
