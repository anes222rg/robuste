/* ROBUSTE Packs showcase — uses existing products.json and cart */
(function () {
  'use strict';
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
    });
  }
  var UI = {
    ar: { pack: 'باك', appliances: 'أجهزة', offer: 'عرض مجمّع', price: 'سعر الباك', add: 'أضف للسلة', view: 'شاهد' },
    en: { pack: 'PACK', appliances: 'appliances', offer: 'Bundle offer', price: 'The pack', add: 'Add to cart', view: 'View' },
    fr: { pack: 'PACK', appliances: 'appareils', offer: 'Offre groupée', price: 'Le pack', add: 'Ajouter', view: 'Voir' }
  };
  // Campaign names stay identical in Arabic, English, and French.
  // The language switch translates only surrounding interface text.
  function language() { try { return localStorage.getItem('site_lang') || 'ar'; } catch (e) { return 'ar'; } }
  function displayName(pack) { return pack.title.replace(/^PACK\s+|^MEGA PACK\s+—\s*/i, ''); }
  function titleParts(pack) {
    var names = (pack.features || []).filter(function (x) {
      return !/\d[\d\s,]*\s*DA|الدفع|Pack|Mega/i.test(x);
    });
    return names.slice(0, 4);
  }
  function render() {
    var root = document.getElementById('packsShowcase');
    if (!root) return;
    fetch('products.json').then(function (r) { if (!r.ok) throw new Error('products'); return r.json(); })
      .then(function (all) {
        var packs = all.filter(function (p) { return p.category === 'packs'; });
        if (!packs.length) { root.hidden = true; return; }
        var lang = language();
        var copy = UI[lang] || UI.ar;
        root.innerHTML = packs.map(function (p, index) {
          var name = displayName(p);
          var images = (p.images || []).slice(0, 4);
          var members = titleParts(p);
          var count = members.length || images.length;
          var mosaic = images.map(function (src, i) {
            return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(name) + ' — ' + (i + 1) + '" loading="lazy" decoding="async">';
          }).join('');
          return '<article class="pack-card pack-card--' + (index + 1) + '" tabindex="0" data-pack-id="' + p.id + '">' +
            '<a class="pack-visual" href="product-' + p.id + '.html" aria-label="' + copy.view + ' ' + escapeHtml(name) + '">' +
              '<span class="pack-ribbon"><i class="bi bi-gift-fill"></i> ' + copy.pack + '</span>' +
              '<span class="pack-count">' + count + ' ' + copy.appliances + '</span>' +
              '<div class="pack-mosaic pack-mosaic--' + Math.min(Math.max(images.length, 1), 4) + '">' + mosaic + '</div>' +
              '<span class="pack-spark pack-spark--one">✦</span><span class="pack-spark pack-spark--two">✦</span>' +
            '</a>' +
            '<div class="pack-body">' +
              '<p class="pack-kicker">' + copy.offer + '</p>' +
              '<h3>' + escapeHtml(name) + '</h3>' +
              '<div class="pack-members">' + members.map(function (x) { return '<span>' + escapeHtml(x) + '</span>'; }).join('') + '</div>' +
              '<div class="pack-buy-row"><div><small>' + copy.price + '</small><strong dir="ltr">' + Number(p.price).toLocaleString('en-US') + ' DA</strong></div>' +
              '<button class="pack-add add-to-cart-btn" data-id="' + p.id + '" type="button" aria-label="' + copy.add + ' ' + escapeHtml(name) + '"><i class="bi bi-cart-plus"></i><span>' + copy.add + '</span></button></div>' +
            '</div></article>';
        }).join('');
      }).catch(function () { root.hidden = true; });
  }
  window.addEventListener('robuste:languagechange', render);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
}());
