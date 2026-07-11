/* ROBUSTE Packs showcase — uses existing products.json and cart */
(function () {
  'use strict';
  function escapeHtml(value) {
    return String(value || '').replace(/[&<>'"]/g, function (c) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c];
    });
  }
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
        root.innerHTML = packs.map(function (p, index) {
          var images = (p.images || []).slice(0, 4);
          var members = titleParts(p);
          var count = members.length || images.length;
          var mosaic = images.map(function (src, i) {
            return '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(p.title) + ' — produit ' + (i + 1) + '" loading="lazy" decoding="async">';
          }).join('');
          return '<article class="pack-card pack-card--' + (index + 1) + '" tabindex="0" data-pack-id="' + p.id + '">' +
            '<a class="pack-visual" href="product-' + p.id + '.html" aria-label="Voir ' + escapeHtml(p.title) + '">' +
              '<span class="pack-ribbon"><i class="bi bi-gift-fill"></i> PACK</span>' +
              '<span class="pack-count">' + count + ' appareils</span>' +
              '<div class="pack-mosaic pack-mosaic--' + Math.min(Math.max(images.length, 1), 4) + '">' + mosaic + '</div>' +
              '<span class="pack-spark pack-spark--one">✦</span><span class="pack-spark pack-spark--two">✦</span>' +
            '</a>' +
            '<div class="pack-body">' +
              '<p class="pack-kicker">Offre groupée</p>' +
              '<h3>' + escapeHtml(p.title.replace(/^PACK\s+|^MEGA PACK\s+—\s*/i, '')) + '</h3>' +
              '<div class="pack-members">' + members.map(function (x) { return '<span>' + escapeHtml(x) + '</span>'; }).join('') + '</div>' +
              '<div class="pack-buy-row"><div><small>Le pack</small><strong dir="ltr">' + Number(p.price).toLocaleString('en-US') + ' DA</strong></div>' +
              '<button class="pack-add add-to-cart-btn" data-id="' + p.id + '" type="button" aria-label="Ajouter ' + escapeHtml(p.title) + ' au panier"><i class="bi bi-cart-plus"></i><span>Ajouter</span></button></div>' +
            '</div></article>';
        }).join('');
      }).catch(function () { root.hidden = true; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render); else render();
}());
