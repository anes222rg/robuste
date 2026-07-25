/* ROBUSTE i18n — AR (default) / FR switcher.
   Injects #i18nSwitcher into the navbar (styled by robuste.css overrides;
   closed on scroll by main.js). Translates static UI strings via dictionary;
   product data (titles/descriptions from products.json) is already French and
   is left untouched. Layout stays RTL in both languages. */
(function () {
  'use strict';
  var KEY = 'rbLang';
  var LANGS = { ar: 'العربية', fr: 'Français' };

  /* ---------- dictionary: exact (trimmed) text-node matches ---------- */
  var FR = {
    // navbar
    'الرئيسية': 'Accueil', 'المنتجات': 'Produits', 'آراء العملاء': 'Avis clients',
    'تتبع طلبي': 'Suivre ma commande', 'اتصل بنا': 'Contact',
    'ROBUSTE': 'ROBUSTE',
    // index top strip (split around <b>)
    'الدفع عند الاستلام — توصيل': 'Paiement à la livraison — Livraison',
    '58 ولاية': '58 wilayas',
    'خلال 24–72 ساعة': 'sous 24–72h',
    // hero (index)
    'أجهزة منزلية تجعل حياتك أسهل': 'Des appareils électroménagers qui simplifient votre vie',
    'جودة عالية بأسعار تنافسية لكل منزل جزائري مع خدمة توصيل سريعة وضمان سنة واحدة':
      "Haute qualité à prix compétitifs pour chaque foyer algérien, avec livraison rapide et garantie d'un an",
    'تسوق الآن': 'Achetez maintenant', 'ضمان سنة': 'Garantie 1 an',
    'توصيل 58 ولاية': 'Livraison 58 wilayas', 'الدفع عند الاستلام': 'Paiement à la livraison',
    // common buttons
    'أضف للسلة': 'Ajouter au panier', 'شراء فوري': 'Achat immédiat',
    'تأكيد الطلب': 'Confirmer la commande', 'إتمام الشراء': "Finaliser l'achat",
    'إلغاء': 'Annuler', 'طلب سريع': 'Commande rapide',
    'أضف رأيك هنا': 'Donnez votre avis ici', 'إرسال التقييم': "Envoyer l'avis",
    'استكشف المنتجات': 'Voir les produits', 'تصفح المنتجات': 'Voir les produits',
    // product page
    'متوفر في المخزون': 'En stock', 'متوفر · توصيل سريع': 'En stock · Livraison rapide',
    'جديد': 'Nouveau', 'وصف المنتج': 'Description du produit',
    'قد يعجبك أيضاً': 'Vous aimerez aussi', 'متوفر': 'Disponible', 'غير متوفر': 'Indisponible',
    'متوفر • توصيل سريع': 'En stock • Livraison rapide',
    'الدفع عند الاستلام • التوصيل لكل الولايات': 'Paiement à la livraison • Livraison dans toutes les wilayas',
    'شارك تجربتك مع المنتج وساعد عملاءنا الآخرين': 'Partagez votre expérience et aidez nos autres clients',
    // trust items
    'توصيل حتى باب البيت': 'Livraison à domicile', 'إلى 58 ولاية': 'Vers 58 wilayas',
    'ضمان عام': 'Garantie 1 an', 'منتجات أصلية': 'Produits originaux',
    'خدمة ما بعد الشراء': 'Service après-vente', 'دعم متواصل': 'Support continu',
    'دفع يد بيد': 'Paiement main à main', 'عند الاستلام': 'À la livraison',
    'دفع آمن عند الاستلام': 'Paiement sécurisé à la livraison', 'توصيل سريع': 'Livraison rapide',
    'إرجاع خلال 7 أيام': 'Retour sous 7 jours', 'منتج أصلي 100%': 'Produit 100% original',
    'إرجاع سهل خلال 7 أيام': 'Retour facile sous 7 jours',
    'توصيل سريع لكل الولايات': 'Livraison rapide dans toutes les wilayas',
    // cart + order forms
    'سلة التسوق': 'Panier', 'السلة': 'Panier', 'سلة التسوق فارغة': 'Votre panier est vide',
    'لم تقم بإضافة أي منتجات إلى السلة بعد': "Vous n'avez encore ajouté aucun produit",
    'استكشف منتجاتنا وأضف ما يناسبك': 'Explorez nos produits et ajoutez vos favoris',
    'المجموع:': 'Total :', 'المجموع الفرعي:': 'Sous-total :', 'التوصيل:': 'Livraison :',
    'الإجمالي:': 'Total :', 'الولاية': 'Wilaya', 'الولاية *': 'Wilaya *',
    'البلدية *': 'Commune *', 'البلدية': 'Commune', 'العنوان *': 'Adresse *',
    'الاسم الكامل *': 'Nom complet *', 'رقم الهاتف *': 'Numéro de téléphone *',
    'اختر الولاية': 'Choisir la wilaya', 'اختر البلدية': 'Choisir la commune',
    'اختر الولاية أولاً': "Choisissez d'abord la wilaya",
    '🏠 للمنزل': '🏠 À domicile', '🏢 للمكتب': '🏢 Au bureau',
    'طريقة التوصيل *': 'Mode de livraison *', 'سعر التوصيل': 'Frais de livraison',
    'المجموع الفرعي': 'Sous-total', 'المجموع الإجمالي': 'Total général',
    'الاسم *': 'Nom *', 'تقييمك *': 'Votre note *', 'رأيك في المنتج *': 'Votre avis sur le produit *',
    'أضف رأيك': 'Donnez votre avis',
    // footer / misc
    'دفع آمن 100% · الدفع عند الاستلام أو ببطاقة الذهب': 'Paiement 100% sécurisé · à la livraison ou par carte Edahabia',
    '© 2025 ROBUSTE — جميع الحقوق محفوظة': '© 2025 ROBUSTE — Tous droits réservés',
    'عروض خاصة': 'Offres spéciales', 'الكل': 'Tous', 'الأكثر مبيعاً': 'Meilleures ventes',
    'أرسل رسالة': 'Envoyer un message', 'البريد الإلكتروني': 'E-mail', 'رسالتك': 'Votre message',
    'إرسال الرسالة': 'Envoyer', 'السابق': 'Précédent', 'التالي': 'Suivant'
  };
  /* attribute translations (placeholder / title / aria-label) */
  var FR_ATTR = {
    'الاسم الكامل *': 'Nom complet *', 'رقم الهاتف *': 'Numéro de téléphone *',
    'البلدية *': 'Commune *', 'العنوان (الحي/الشارع) *': 'Adresse (quartier/rue) *',
    'اكتب اسم بلديتك': 'Votre commune', 'اسم البلدية': 'Nom de la commune',
    'الحي، الشارع، رقم المنزل...': 'Quartier, rue, n° de maison...',
    'الوضع المظلم': 'Mode sombre', 'سلة التسوق': 'Panier', 'القائمة': 'Menu',
    'صورة المنتج': 'Image du produit'
  };
  /* token pass for dynamic price strings (e.g. #topBarText) */
  var FR_TOKENS = [
    ['الدفع عند الاستلام', 'Paiement à la livraison'],
    ['وفّر', 'Économisez'], ['د.ج', 'DA'], ['دج', 'DA']
  ];

  var saved = new WeakMap();  // node -> original value
  var savedAttrs = new WeakMap(); // el -> {attr: original}
  var current = 'ar';

  function txNode(n) {
    var raw = n.nodeValue; if (!raw) return;
    var t = raw.trim(); if (!t) return;
    var out = null;
    if (FR.hasOwnProperty(t)) out = FR[t];
    else if (/[0-9٠-٩]/.test(t) && /(دج|د\.ج)/.test(t)) {
      out = t;
      for (var i = 0; i < FR_TOKENS.length; i++) out = out.split(FR_TOKENS[i][0]).join(FR_TOKENS[i][1]);
      if (out === t) out = null;
    }
    if (out != null) {
      if (!saved.has(n)) saved.set(n, raw);
      n.nodeValue = raw.replace(t, out);
    }
  }
  function txAttrs(el) {
    ['placeholder', 'title', 'aria-label'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (v && FR_ATTR.hasOwnProperty(v.trim())) {
        var m = savedAttrs.get(el) || {}; if (!(a in m)) { m[a] = v; savedAttrs.set(el, m); }
        el.setAttribute(a, FR_ATTR[v.trim()]);
      }
    });
  }
  function walk(root, fn, attrFn) {
    if (root.nodeType === 3) { fn(root); return; }
    if (root.nodeType !== 1) return;
    var tag = root.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
    if (root.hasAttribute && (root.hasAttribute('data-i18n-skip') || root.id === 'i18nSwitcher')) return;
    attrFn(root);
    for (var c = root.firstChild; c; c = c.nextSibling) walk(c, fn, attrFn);
  }
  function translateTree(root) { walk(root, txNode, txAttrs); }
  function restoreAll() {
    // re-walk DOM; restore anything we changed
    walk(document.body, function (n) { if (saved.has(n)) { n.nodeValue = saved.get(n); saved.delete(n); } },
      function (el) { var m = savedAttrs.get(el); if (m) { for (var a in m) el.setAttribute(a, m[a]); savedAttrs.delete(el); } });
  }

  var mo = null;
  function observe() {
    if (mo) return;
    mo = new MutationObserver(function (muts) {
      if (current !== 'fr') return;
      muts.forEach(function (m) {
        for (var i = 0; i < m.addedNodes.length; i++) translateTree(m.addedNodes[i]);
        if (m.type === 'characterData' && m.target) txNode(m.target);
      });
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function apply(lang) {
    current = (lang === 'fr') ? 'fr' : 'ar';
    if (current === 'fr') { translateTree(document.body); observe(); }
    else restoreAll();
    document.documentElement.lang = current;
    document.documentElement.setAttribute('data-lang', current);
    try { localStorage.setItem(KEY, current); } catch (e) {}
    var cur = document.getElementById('i18nCur');
    if (cur) cur.textContent = current === 'fr' ? 'FR' : 'ع';
    var sw = document.getElementById('i18nSwitcher');
    if (sw) sw.querySelectorAll('.i18n-menu button').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-lang') === current);
    });
  }

  function injectCss() {
    var s = document.createElement('style');
    s.textContent =
      '#i18nSwitcher{position:relative;display:inline-flex;margin-inline-end:8px}' +
      '#i18nSwitcher .i18n-btn{display:inline-flex;align-items:center;gap:6px;height:40px;padding:0 12px;border-radius:12px;border:1px solid #E3E6EB;background:#EFF1F4;color:#0E1116;cursor:pointer;font-weight:700;font-size:.9rem;line-height:1}' +
      '#i18nSwitcher .i18n-menu{position:absolute;top:calc(100% + 8px);inset-inline-end:0;min-width:150px;background:#fff;border:1px solid #E3E6EB;border-radius:12px;padding:6px;display:none;z-index:1200;box-shadow:0 10px 30px rgba(0,0,0,.12)}' +
      '#i18nSwitcher.open .i18n-menu{display:block}' +
      'html[data-lang="fr"] .rb-topstrip,html[data-lang="fr"] .top-cod-bar{direction:ltr}' +
      '#i18nSwitcher .i18n-menu button{display:block;width:100%;text-align:start;background:none;border:0;padding:9px 12px;border-radius:8px;cursor:pointer;font-weight:600;font-size:.95rem}';
    document.head.appendChild(s);
  }

  function injectSwitcher() {
    if (document.getElementById('i18nSwitcher')) return;
    var host = document.querySelector('.glass-navbar .d-flex.align-items-center');
    if (!host) return;
    var w = document.createElement('div');
    w.id = 'i18nSwitcher';
    w.innerHTML =
      '<button type="button" id="i18nBtn" class="i18n-btn" aria-haspopup="true" aria-expanded="false" title="اللغة / Langue">' +
      '<i class="bi bi-globe2"></i><span id="i18nCur">ع</span></button>' +
      '<div class="i18n-menu" role="menu">' +
      Object.keys(LANGS).map(function (k) {
        return '<button type="button" data-lang="' + k + '" role="menuitem">' + LANGS[k] + '</button>';
      }).join('') + '</div>';
    host.insertBefore(w, host.firstChild);
    var btn = w.querySelector('#i18nBtn');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = w.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    w.querySelectorAll('.i18n-menu button').forEach(function (b) {
      b.addEventListener('click', function () {
        w.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
        apply(b.getAttribute('data-lang'));
      });
    });
    document.addEventListener('click', function (e) {
      if (w.classList.contains('open') && !w.contains(e.target)) {
        w.classList.remove('open'); btn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function init() {
    injectCss();
    injectSwitcher();
    var l = 'ar';
    try { l = localStorage.getItem(KEY) || 'ar'; } catch (e) {}
    if (l === 'fr') apply('fr'); else apply('ar');
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
