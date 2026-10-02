/* Live Assil tariffs and delivery locations. API token stays in the Worker.
 * Static prices remain a labelled fallback when the public reference is unavailable.
 */
(function () {
  "use strict";
  var reference = null, worker = "", lastError = "", scheduled = false;
  var wilayaIds = ["cartWilaya", "wilaya", "wilayaSelect", "expressWilaya"];
  function key(v) { return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^a-z0-9\u0600-\u06ff]/g, ""); }
  function ready() { return !!(reference && reference.pricesEnabled !== false && reference.available && reference.available.fees && reference.available.wilayas); }
  function code(value) {
    if (!reference) return 0;
    var n = Number(value);
    var w = reference.wilayas.find(function (x) { return x.code === n || key(x.name) === key(value) || key(x.arabic) === key(value); });
    return w ? w.code : 0;
  }
  function feeFor(value, type) {
    var n = code(value), row = reference && reference.fees[n];
    if (!n || !row || !row.delivery) return null;
    if (type !== "home" && reference.available.desks && !deskList(value).length) return null;
    return type === "home" ? row.delivery.home : row.delivery.office;
  }
  function deskList(value) {
    var n = code(value);
    return reference ? reference.desks.filter(function (d) { return d.wilaya === n; }) : [];
  }
  function mode(scope, id) {
    var name = id === "cartWilaya" ? "cartDeliveryType" : id === "expressWilaya" ? "expDeliveryType" : "deliveryType";
    var input = (id === "cartWilaya" ? document : scope).querySelector('input[name="' + name + '"]:checked');
    return input ? input.value : "home";
  }
  function fields(select) {
    var scope = select.closest("form") || select.closest(".modal") || select.parentElement.parentElement;
    var commune = scope && scope.querySelector('input[id*="baladiya" i],select[id*="baladiya" i],input[id*="commune" i],select[id*="commune" i],input[id*="municipality" i],select[id*="municipality" i]');
    return { scope: scope, commune: commune };
  }
  function hint(scope, text, error) {
    if (!scope) return;
    var node = scope.querySelector(".rb-eco-rate-hint");
    if (!node) { node = document.createElement("p"); node.className = "rb-eco-rate-hint"; scope.appendChild(node); }
    if (node.textContent !== text) node.textContent = text;
    node.style.cssText = "font-size:14px;line-height:1.6;margin:12px 0;color:" + (error ? "#a33425" : "#536173");
    node.setAttribute("role", error ? "alert" : "status");
  }
  function options(select, rows, selected, label) {
    var signature = rows.map(function (r) { return r.value; }).join("|");
    if (select.dataset.ecoOptions === signature && select.options.length === rows.length + 1 &&
        (!rows.length || (select.options[1] && select.options[1].dataset.eco === "1"))) return;
    select.textContent = "";
    var first = document.createElement("option"); first.value = ""; first.textContent = label; select.appendChild(first);
    rows.forEach(function (r) {
      var option = document.createElement("option"); option.value = r.value; option.textContent = r.label;
      option.dataset.eco = "1"; if (key(selected) === key(r.value)) option.selected = true; select.appendChild(option);
    });
    select.dataset.ecoOptions = signature;
  }
  function bindDesk(select, f) {
    if (!f.scope || !f.commune || select.id === "cartWilaya") return;
    var box = f.scope.querySelector('.rb-eco-desk[data-wilaya-id="' + select.id + '"]');
    if (!box) {
      box = document.createElement("div"); box.className = "rb-eco-desk"; box.dataset.wilayaId = select.id;
      box.style.cssText = "margin:12px 0";
      var label = document.createElement("label"); label.textContent = "مكتب Assil للاستلام / Stop Desk";
      label.style.cssText = "display:block;font-weight:600;margin-bottom:6px;font-size:14px";
      var picker = document.createElement("select"); picker.className = "form-select rb-eco-desk-select";
      picker.id = "rb-eco-desk-" + select.id; label.htmlFor = picker.id; picker.style.minHeight = "44px";
      var address = document.createElement("p"); address.className = "rb-eco-desk-address";
      address.style.cssText = "font-size:14px;margin-top:8px";
      box.appendChild(label); box.appendChild(picker); box.appendChild(address);
      f.commune.parentElement.insertAdjacentElement("afterend", box);
      picker.addEventListener("change", function () {
        var desks = deskList(select.value), d = desks[Number(picker.value)];
        if (!d || picker.value === "") { address.textContent = ""; return; }
        if (f.commune.tagName === "SELECT" && !Array.from(f.commune.options).some(function (o) { return o.value === d.commune; })) {
          var option = document.createElement("option"); option.value = d.commune; option.textContent = d.commune; f.commune.appendChild(option);
        }
        f.commune.value = d.commune; f.commune.dispatchEvent(new Event("change", { bubbles: true }));
        address.textContent = [d.name, d.address, d.phone].filter(Boolean).join(" · ");
      });
    }
    var office = mode(f.scope, select.id) === "office";
    box.hidden = !office;
    var picker = box.querySelector("select"), desks = deskList(select.value);
    var current = picker.value;
    options(picker, desks.map(function (d, i) { return { value: String(i), label: d.name + " — " + d.commune }; }),
      current, desks.length ? "اختر مكتب الاستلام" : "لا يوجد مكتب مؤكّد في هذه الولاية");
    picker.required = office && reference.available.desks;
    picker.disabled = !office || !desks.length;
  }
  function apply() {
    if (!ready()) return;
    wilayaIds.forEach(function (id) {
      var select = document.getElementById(id);
      if (!select || select.tagName !== "SELECT") return;
      var oldCode = code(select.value), rows = reference.wilayas.map(function (w) {
        return { value: w.arabic || w.name, label: w.arabic || w.name };
      });
      var old = reference.wilayas.find(function (w) { return w.code === oldCode; });
      options(select, rows, old ? old.arabic || old.name : "", "اختر الولاية");
      var f = fields(select), n = code(select.value), chosenMode = f.scope ? mode(f.scope, id) : "home";
      if (f.commune && f.commune.tagName === "SELECT" && reference.available.communes) {
        var current = f.commune.value;
        options(f.commune, reference.communes.filter(function (c) { return c.wilaya === n; })
          .map(function (c) { return { value: c.name, label: c.name }; }), current, "اختر بلدية متاحة لدى Assil");
      }
      if (f.commune && f.commune.tagName === "INPUT" && reference.available.communes) {
        var listId = "rb-eco-communes-" + id, list = document.getElementById(listId);
        if (!list) { list = document.createElement("datalist"); list.id = listId; f.commune.insertAdjacentElement("afterend", list); }
        f.commune.setAttribute("list", listId);
        var names = reference.communes.filter(function (c) { return c.wilaya === n; }).map(function (c) { return c.name; });
        var signature = names.join("|");
        if (list.dataset.signature !== signature) {
          list.textContent = "";
          names.forEach(function (name) { var option = document.createElement("option"); option.value = name; list.appendChild(option); });
          list.dataset.signature = signature;
        }
      }
      bindDesk(select, f);
      var radioName = id === "cartWilaya" ? "cartDeliveryType" : id === "expressWilaya" ? "expDeliveryType" : "deliveryType";
      var officeRadio = (id === "cartWilaya" ? document : f.scope).querySelector('input[name="' + radioName + '"][value="office"]');
      if (officeRadio) officeRadio.disabled = !!(n && reference.available.desks && !deskList(select.value).length);
      if (select.value && feeFor(select.value, chosenMode) == null)
        hint(f.scope, "هذه طريقة التوصيل غير متاحة في الولاية المختارة. اختر طريقة أخرى.", true);
      else hint(f.scope, "تعرفة حساب Assil — جُلبت " + new Date(reference.fetchedAt).toLocaleString("ar-DZ") +
        ". البيانات مخزّنة مؤقتاً ويظهر وقت جلبها هنا.", false);
      if (!select.dataset.ecoBound) {
        select.dataset.ecoBound = "1";
        select.addEventListener("change", schedule);
      }
    });
    ["recalcCartDelivery", "recalcModalDelivery", "updateOrderSummary", "updateExpressSummary"].forEach(function (fn) {
      if (typeof window[fn] === "function") { try { window[fn](); } catch {} }
    });
    wilayaIds.forEach(function (id) {
      var select = document.getElementById(id);
      if (!select || !select.value) return;
      var f = fields(select);
      if (!f.scope || feeFor(select.value, mode(f.scope, id)) != null) return;
      var deliveryId = id === "cartWilaya" ? "cartDelivery" : id === "expressWilaya" ? "expDelivery" : "sumDelivery";
      var totalId = id === "cartWilaya" ? "cartTotal" : id === "expressWilaya" ? "expTotal" : "sumTotal";
      var deliveryNode = document.getElementById(deliveryId), totalNode = document.getElementById(totalId);
      if (deliveryNode) deliveryNode.textContent = "غير متاح";
      if (totalNode) totalNode.textContent = "—";
    });
  }
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () { scheduled = false; apply(); }, 100);
  }
  async function load() {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 9000) : null;
    try {
      var response = await fetch(worker + "/delivery/reference", { credentials: "omit", signal: controller && controller.signal });
      var data = await response.json();
      if (!response.ok || !data.ok) throw new Error("reference_unavailable");
      reference = data; lastError = "";
      if (data.pricesEnabled === false) {
        document.querySelectorAll(".rb-eco-desk,datalist[id^='rb-eco-communes-']").forEach(function (node) { node.remove(); });
        document.querySelectorAll("input[list^='rb-eco-communes-']").forEach(function (node) { node.removeAttribute("list"); });
        ["recalcCartDelivery", "recalcModalDelivery", "updateOrderSummary", "updateExpressSummary"].forEach(function (fn) {
          if (typeof window[fn] === "function") window[fn]();
        });
        document.querySelectorAll(".rb-eco-rate-hint").forEach(function (node) { node.textContent = "أسعار التوصيل مضبوطة من المتجر."; });
      }
      try { sessionStorage.setItem("robuste_eco_reference:" + worker, JSON.stringify(data)); } catch {}
      apply(); document.dispatchEvent(new CustomEvent("robuste:ecotrack-reference", { detail: data }));
    } catch {
      lastError = "reference_unavailable";
      if (!ready()) wilayaIds.forEach(function (id) {
        var node = document.getElementById(id);
        if (node) hint(fields(node).scope, "تعذر تحديث تعرفة Assil. السعر المعروض احتياطي ويحتاج تأكيداً من المتجر.", false);
      });
    } finally { if (timer) clearTimeout(timer); }
  }
  function submitGuard(event) {
    if (!ready()) return;
    var form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    var select = wilayaIds.map(function (id) { return form.querySelector("#" + id); }).find(Boolean);
    if (!select) return;
    var chosenMode = mode(form, select.id), message = "";
    if (!code(select.value) || feeFor(select.value, chosenMode) == null) message = "اختر ولاية وطريقة توصيل متاحتين لدى Assil.";
    var box = form.querySelector(".rb-eco-desk");
    if (!message && chosenMode === "office" && reference.available.desks &&
        (!box || box.querySelector("select").value === "")) message = "اختر مكتب Assil الذي ستستلم منه الطرد.";
    var commune = fields(select).commune;
    if (!message && chosenMode === "home" && commune && reference.available.communes &&
        !reference.communes.some(function (c) { return c.wilaya === code(select.value) && key(c.name) === key(commune.value); }))
      message = "اختر اسم البلدية من القائمة المتاحة لدى Assil.";
    if (message) { event.preventDefault(); event.stopImmediatePropagation(); hint(form, message, true); }
  }
  window.RBEcoDelivery = { ready: ready, feeFor: feeFor, code: code,
    getReference: function () { return reference; }, refresh: load,
    lastError: function () { return lastError; } };
  function init() {
    worker = String(window.ROBUSTE_WORKER_URL || "https://robuste.aneslaidaoui06.workers.dev").replace(/\/+$/, "");
    try {
      var cached = JSON.parse(sessionStorage.getItem("robuste_eco_reference:" + worker) || "null");
      if (cached && Date.now() - Date.parse(cached.fetchedAt) < 3600000) reference = cached;
    } catch {}
    apply(); load();
    document.addEventListener("change", function (e) {
      if (/DeliveryType|deliveryType/.test(e.target.name || "") || wilayaIds.includes(e.target.id)) schedule();
    });
    document.addEventListener("submit", submitGuard, true);
    if (window.MutationObserver) new MutationObserver(function (changes) {
      var relevant = changes.some(function (change) {
        var target = change.target;
        if (target.tagName === "SELECT" && (wilayaIds.includes(target.id) || /baladiya|commune/i.test(target.id))) {
          return target.options.length > 1 && target.options[1].dataset.eco !== "1";
        }
        return Array.from(change.addedNodes).some(function (node) {
          return node.nodeType === 1 && (wilayaIds.includes(node.id) || node.querySelector &&
            node.querySelector("#expressWilaya,#wilayaSelect,#cartWilaya,select#baladiyaInput"));
        });
      });
      if (relevant) schedule();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();