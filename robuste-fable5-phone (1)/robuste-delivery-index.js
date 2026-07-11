/* ROBUSTE — Delivery picker for index.html (mirrors product.html)
   Additive layer: does NOT modify main.js cart logic. Computes delivery fee
   for the chosen wilaya + home/office, in both the cart and the order modal. */
(function () {
  "use strict";

  // Exact fee table copied from product.html  ->  wilaya: [home, office]
  var deliveryFees = {"أدرار":[1200,600],"الشلف":[700,400],"الأغواط":[800,500],"أم البواقي":[700,400],"باتنة":[700,400],"بجاية":[650,400],"بسكرة":[800,470],"بشار":[1200,650],"البليدة":[650,350],"البويرة":[650,400],"تمنراست":[1600,800],"تبسة":[750,400],"تلمسان":[750,400],"تيارت":[750,400],"تيزي وزو":[650,400],"الجزائر":[500,350],"الجلفة":[800,470],"جيجل":[700,400],"سطيف":[500,350],"سعيدة":[750,400],"سكيكدة":[700,400],"سيدي بلعباس":[700,400],"عنابة":[650,400],"قالمة":[700,400],"قسنطينة":[650,400],"المدية":[700,400],"مستغانم":[700,400],"المسيلة":[700,400],"معسكر":[700,400],"ورقلة":[800,500],"وهران":[650,400],"البيض":[950,600],"إليزي":[1600,800],"برج بوعريريج":[650,400],"بومرداس":[600,400],"الطارف":[700,400],"تيندوف":[1200,600],"تيسمسيلت":[700,400],"الوادي":[800,500],"خنشلة":[750,400],"سوق أهراس":[750,400],"تيبازة":[650,400],"ميلة":[650,400],"عين الدفلى":[650,400],"النعامة":[900,600],"عين تموشنت":[700,400],"غرداية":[900,500],"غليزان":[700,400],"تيميمون":[1300,650],"أولاد جلال":[900,550],"بني عباس":[1300,650],"عين صالح":[1300,700],"توقرت":[850,600],"المغير":[850,null],"المنيعة":[900,500]};
  var wilayas = Object.keys(deliveryFees);

  function fmt(n) { try { return Number(n).toLocaleString("en-US"); } catch (e) { return "" + n; } }

  function deliveryFeeFor(w, t) {
    var f = deliveryFees[w];
    if (!f) return null;
    var home = f[0], office = f[1];
    if (t === "office") return (office == null ? home : office);
    return home;
  }
  window.deliveryFeeFor = deliveryFeeFor; // used by the order-submit hook in main.js

  function getCart() { try { return JSON.parse(localStorage.getItem("robuste_cart") || "[]") || []; } catch (e) { return []; } }
  function cartSubtotal() { return getCart().reduce(function (s, i) { return s + (i.price || 0) * (i.quantity || 0); }, 0); }

  function fillWilaya(sel, placeholderText, placeholderDisabled) {
    if (!sel) return;
    sel.innerHTML = "";
    var ph = document.createElement("option");
    ph.value = ""; ph.textContent = placeholderText; ph.selected = true;
    if (placeholderDisabled) ph.disabled = true;
    sel.appendChild(ph);
    wilayas.forEach(function (w) { var o = document.createElement("option"); o.value = w; o.textContent = w; sel.appendChild(o); });
  }

  // ---------- CART summary ----------
  function recalcCart() {
    var sub = cartSubtotal();
    var w = (document.getElementById("cartWilaya") || {}).value || "";
    var t = (document.querySelector('input[name="cartDeliveryType"]:checked') || {}).value || "office";
    var subEl = document.getElementById("cartSubtotal");
    var delEl = document.getElementById("cartDelivery");
    var totEl = document.getElementById("cartTotal");
    if (subEl) subEl.textContent = fmt(sub) + " د.ج";
    if (!w) { if (delEl) delEl.textContent = "اختر الولاية"; if (totEl) totEl.textContent = fmt(sub) + " د.ج"; return; }
    var na = (t === "office" && deliveryFees[w] && deliveryFees[w][1] == null);
    var fee = deliveryFeeFor(w, t); if (fee == null) fee = 0;
    if (delEl) delEl.textContent = fmt(fee) + " د.ج" + (na ? " (للمنزل)" : "");
    if (totEl) totEl.textContent = fmt(sub + fee) + " د.ج";
  }
  function onCartWilayaChange() { try { var w = (document.getElementById("cartWilaya") || {}).value; if (w) localStorage.setItem("robuste_wilaya", w); } catch (e) {} recalcCart(); }
  window.recalcCartDelivery = recalcCart;

  // ---------- MODAL summary ----------
  function recalcModal() {
    var sub = parseFloat((document.getElementById("productPriceValue") || {}).value) || 0;
    var w = (document.getElementById("wilaya") || {}).value || "";
    var t = (document.querySelector('#orderModal input[name="deliveryType"]:checked') || {}).value || "office";
    var s = document.getElementById("sumSubtotal");
    var d = document.getElementById("sumDelivery");
    var tt = document.getElementById("sumTotal");
    if (s) s.textContent = fmt(sub) + " د.ج";
    if (!w) { if (d) d.textContent = "اختر الولاية"; if (tt) tt.textContent = fmt(sub) + " د.ج"; return; }
    var na = (t === "office" && deliveryFees[w] && deliveryFees[w][1] == null);
    var fee = deliveryFeeFor(w, t); if (fee == null) fee = 0;
    if (d) d.textContent = fmt(fee) + " د.ج" + (na ? " (للمنزل)" : "");
    if (tt) tt.textContent = fmt(sub + fee) + " د.ج";
  }
  window.recalcModalDelivery = recalcModal;

  function syncModalFromCart() {
    try {
      var cw = (document.getElementById("cartWilaya") || {}).value;
      if (!cw) { try { cw = localStorage.getItem("robuste_wilaya") || ""; } catch (e) {} }
      var ws = document.getElementById("wilaya");
      if (cw && ws) ws.value = cw;
      var cdt = (document.querySelector('input[name="cartDeliveryType"]:checked') || {}).value || "office";
      var mr = document.querySelector('#orderModal input[name="deliveryType"][value="' + cdt + '"]');
      if (mr) mr.checked = true;
    } catch (e) {}
    recalcModal();
  }

  function init() {
    var cw = document.getElementById("cartWilaya");
    fillWilaya(cw, "اختر الولاية", true);
    // Re-fill the modal wilaya with the full 58-wilaya list (main.js only knows 48)
    var ws = document.getElementById("wilaya");
    fillWilaya(ws, "اختر ولايتك", false);

    try { var sv = localStorage.getItem("robuste_wilaya"); if (sv && cw) cw.value = sv; } catch (e) {}

    if (cw) cw.addEventListener("change", onCartWilayaChange);
    var cdts = document.querySelectorAll('input[name="cartDeliveryType"]');
    for (var i = 0; i < cdts.length; i++) cdts[i].addEventListener("change", recalcCart);
    if (ws) ws.addEventListener("change", recalcModal);
    var mdts = document.querySelectorAll('#orderModal input[name="deliveryType"]');
    for (var j = 0; j < mdts.length; j++) mdts[j].addEventListener("change", recalcModal);

    // Recompute the cart totals whenever main.js rebuilds the items list
    var items = document.getElementById("cartItems");
    if (items && window.MutationObserver) {
      new MutationObserver(function () { recalcCart(); }).observe(items, { childList: true, subtree: true });
    }

    // After main.js opens the order modal, sync the delivery choice from the cart
    if (typeof window.checkout === "function") {
      var orig = window.checkout;
      window.checkout = function () { var r = orig.apply(this, arguments); setTimeout(syncModalFromCart, 60); return r; };
    }

    recalcCart();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
