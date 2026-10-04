/* Customer-first delivery checkout: wilaya -> commune dropdown -> delivery choice.
 * Carrier credentials stay in the Worker. Detailed desk addresses supplement,
 * but never replace, the carrier's commune-level Stop Desk availability flag.
 */
(function () {
  "use strict";
  var reference = null, worker = "", lastError = "", scheduled = false, applying = false;
  var script = document.currentScript;
  var scriptUrl = script && script.src || document.baseURI;
  var wilayaIds = ["cartWilaya", "wilaya", "wilayaSelect", "expressWilaya"];
  var addressState = new WeakMap();
  var customerCopy = {"السعر غير متاح":["Price unavailable","Tarif indisponible"]," د.ج":[" DZD"," DA"],"اختر البلدية":["Choose a commune","Choisissez une commune"]," — مكتب متاح":[" — pickup desk available"," — bureau disponible"]," — منزل فقط":[" — home only"," — domicile uniquement"],"اختر الولاية أولاً":["Choose a wilaya first","Choisissez d’abord une wilaya"],"جارٍ تحميل قائمة البلديات…":["Loading communes…","Chargement des communes…"],"لا توجد بلديات متاحة حالياً":["No communes available at present","Aucune commune disponible actuellement"],"اختر الولاية، ثم البلدية لمعرفة طرق التوصيل.":["Choose a wilaya, then a commune to see delivery options.","Choisissez une wilaya, puis une commune pour voir les modes de livraison."],"نعمل على تحميل البلديات المتاحة. انتظر لحظة من فضلك.":["Loading available communes. Please wait a moment.","Chargement des communes disponibles. Veuillez patienter."],"اختر البلدية ليظهر توفر مكتب الاستلام.":["Choose a commune to check pickup desk availability.","Choisissez une commune pour vérifier la disponibilité du bureau."],"✓ مكتب الاستلام متاح في هذه البلدية.":["✓ Pickup desk available in this commune.","✓ Bureau de retrait disponible dans cette commune."],"التوصيل للمنزل فقط — لا يوجد مكتب استلام في هذه البلدية.":["Home delivery only — no pickup desk in this commune.","Livraison à domicile uniquement — aucun bureau dans cette commune."],"لم نتمكن من تأكيد توفر المكتب. اختر التوصيل للمنزل.":["Desk availability could not be confirmed. Choose home delivery.","La disponibilité du bureau n’a pas pu être confirmée. Choisissez le domicile."],"المكتب متاح حسب آخر قائمة متوفرة؛ نؤكّد لك توفره قبل الشحن.":["Desk available in the last known list; we will confirm before shipping.","Bureau disponible selon la dernière liste connue ; nous confirmerons avant l’expédition."],"حسب آخر قائمة متوفرة، التوصيل لهذه البلدية للمنزل فقط.":["The last known list shows home delivery only for this commune.","La dernière liste connue indique une livraison à domicile uniquement pour cette commune."],"اختر مكتب الاستلام":["Choose a pickup desk","Choisissez un bureau de retrait"],"مكتب الاستلام: ":["Pickup desk: ","Bureau de retrait : "],"استلام من المكتب في ":["Office pickup in ","Retrait en bureau à "],"اختر المكتب لمعرفة عنوانه.":["Choose a desk to see its address.","Choisissez un bureau pour voir son adresse."],"المكتب متاح وفق بيانات شركة التوصيل؛ سيُؤكَّد عنوان الاستلام معك قبل الشحن.":["The carrier lists a pickup desk here; we will confirm its exact address with you before shipping.","Le transporteur indique un bureau disponible ; son adresse exacte sera confirmée avec vous avant l’expédition."],"مكتب الاستلام في ":["Pickup desk in ","Bureau de retrait à "],"عنوان مكتب الاستلام":["Pickup desk address","Adresse du bureau de retrait"],"مكان الاستلام — العنوان يُؤكَّد قبل الشحن":["Pickup location — address confirmed before shipping","Lieu de retrait — adresse confirmée avant l’expédition"],"اختر الولاية":["Choose a wilaya","Choisissez une wilaya"]," — مبدئي":[" — provisional"," — provisoire"],"اختر الولاية والبلدية":["Choose a wilaya and commune","Choisissez une wilaya et une commune"],"اختر البلدية أولاً":["Choose a commune first","Choisissez d’abord une commune"],"متاح — ":["Available — ","Disponible — "],"غير متاح لهذه البلدية":["Unavailable in this commune","Indisponible dans cette commune"],"السعر غير متاح حالياً":["Price currently unavailable","Tarif actuellement indisponible"],"التوفر غير مؤكّد":["Availability not confirmed","Disponibilité non confirmée"],"قائمة البلديات متاحة. سعر التوصيل المعروض مبدئي وسيؤكَّد معك قبل الشحن.":["The commune list is available. The displayed delivery fee is provisional and will be confirmed before shipping.","La liste des communes est disponible. Le tarif affiché est provisoire et sera confirmé avant l’expédition."],"غير متاح":["Unavailable","Indisponible"],"تعذّر تحميل قائمة البلديات. أعد المحاولة بعد لحظات.":["Could not load communes. Please try again shortly.","Impossible de charger les communes. Réessayez dans un instant."],"اختر الولاية أولاً.":["Choose a wilaya first.","Choisissez d’abord une wilaya."],"اختر البلدية من القائمة.":["Choose a commune from the list.","Choisissez une commune dans la liste."],"لا يوجد مكتب استلام في هذه البلدية. اختر التوصيل للمنزل.":["No pickup desk in this commune. Choose home delivery.","Aucun bureau de retrait dans cette commune. Choisissez le domicile."],"سعر طريقة التوصيل المختارة غير متاح حالياً.":["The selected delivery fee is currently unavailable.","Le tarif du mode de livraison choisi est actuellement indisponible."],"اختر مكتب الاستلام.":["Choose a pickup desk.","Choisissez un bureau de retrait."],"البلدية *":["Commune *","Commune *"]};
  function language() {
    try { var saved = localStorage.getItem("site_lang"); if (["ar", "en", "fr"].includes(saved)) return saved; } catch (_) {}
    var lang = document.documentElement.lang.slice(0, 2); return ["ar", "en", "fr"].includes(lang) ? lang : "ar";
  }
  function t(ar) { var pair = customerCopy[ar], lang = language(); return !pair || lang === "ar" ? ar : pair[lang === "fr" ? 1 : 0]; }
  function key(v) { return String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^a-z0-9\u0600-\u06ff]/g, ""); }
  function ready() { return !!(reference && reference.pricesEnabled !== false && reference.available && reference.available.fees && reference.available.wilayas); }
  function locationsReady() { return !!(reference && reference.available && reference.available.wilayas && reference.available.communes); }
  function code(value) {
    if (!reference) return 0;
    var n = Number(value), w = reference.wilayas.find(function (x) { return x.code === n || key(x.name) === key(value) || key(x.arabic) === key(value); });
    return w ? w.code : 0;
  }
  function communeList(value) {
    var n = code(value);
    return reference ? reference.communes.filter(function (c) { return c.wilaya === n; }).slice()
      .sort(function (a, b) { return a.name.localeCompare(b.name, "fr"); }) : [];
  }
  function deskList(value, commune) {
    var n = code(value);
    return reference ? reference.desks.filter(function (d) { return d.wilaya === n && (!commune || key(d.commune) === key(commune)); }) : [];
  }
  function deskAvailability(value, commune) {
    if (!locationsReady() || !code(value) || !commune) return "unknown";
    var c = communeList(value).find(function (x) { return key(x.name) === key(commune); });
    if (!c) return "unknown";
    return c.stopDesk === true || deskList(value, c.name).length ? "available" : "unavailable";
  }
  function hasOffice(value) {
    return communeList(value).some(function (c) { return c.stopDesk === true; }) || deskList(value).length > 0;
  }
  function feeFor(value, type) {
    var n = code(value), row = reference && reference.fees && reference.fees[n];
    if (!n || !row || !row.delivery) return null;
    if (type !== "home" && locationsReady() && !hasOffice(value)) return null;
    var fee = type === "home" ? row.delivery.home : row.delivery.office;
    return fee == null ? null : Number(fee);
  }
  function checkoutFee(value, type) {
    if (ready()) return feeFor(value, type);
    if (typeof window.deliveryFeeFor !== "function") return null;
    var fee = window.deliveryFeeFor(value, type);
    return fee == null || !Number.isFinite(Number(fee)) || Number(fee) < 0 ? null : Number(fee);
  }
  function money(value) { return value == null || !Number.isFinite(Number(value)) ? t("السعر غير متاح") : Number(value).toLocaleString("fr-DZ") + t(" د.ج"); }
  function radioName(id) { return id === "cartWilaya" ? "cartDeliveryType" : id === "expressWilaya" ? "expDeliveryType" : "deliveryType"; }
  function fields(select) {
    var scope = select.closest("form") || select.closest(".modal,.offcanvas") || select.parentElement.parentElement;
    var communeId = select.id === "expressWilaya" ? "expressBaladiya" : "baladiyaInput";
    var commune = select.id === "cartWilaya" ? null : scope && scope.querySelector("#" + communeId);
    var address = select.id === "expressWilaya" ? scope && scope.querySelector("#expressAddress") : scope && scope.querySelector("#address");
    return { scope: scope, commune: commune, address: address };
  }
  function mode(scope, id) {
    var input = (id === "cartWilaya" ? document : scope).querySelector('input[name="' + radioName(id) + '"]:checked');
    return input ? input.value : "home";
  }
  function setText(node, text) { if (node && node.textContent !== text) node.textContent = text; }
  function optionList(select, rows, selected, label, signature) {
    if (select.dataset.ecoOptions === signature && select.options.length === rows.length + 1 &&
        (!rows.length || select.options[1].dataset.eco === "1")) return;
    select.textContent = "";
    var first = document.createElement("option"); first.value = ""; first.textContent = label; select.appendChild(first);
    rows.forEach(function (row) {
      var option = document.createElement("option"); option.value = row.value; option.textContent = row.label; option.dataset.eco = "1";
      if (selected && key(selected) === key(row.value)) option.selected = true;
      select.appendChild(option);
    });
    select.dataset.ecoOptions = signature;
  }
  function ensureCommune(select, f) {
    if (!f.commune) return null;
    if (f.commune.tagName !== "SELECT") {
      var old = f.commune, replacement = document.createElement("select");
      Array.from(old.attributes).forEach(function (a) {
        if (!["type", "list", "placeholder", "value"].includes(a.name)) replacement.setAttribute(a.name, a.value);
      });
      replacement.dataset.ecoInitialValue = old.value || "";
      old.replaceWith(replacement); f.commune = replacement;
    }
    var picker = f.commune, n = code(select.value), previous = Number(picker.dataset.ecoWilaya || 0);
    picker.classList.add("rb-eco-commune"); picker.required = true; picker.setAttribute("aria-label", t("اختر البلدية"));
    var selected = previous && previous !== n ? "" : picker.value || picker.dataset.ecoInitialValue || "";
    var communes = communeList(select.value);
    optionList(picker, communes.map(function (c) {
      return { value: c.name, label: c.name + (deskAvailability(select.value, c.name) === "available" ? t(" — مكتب متاح") : t(" — منزل فقط")) };
    }), selected, !n ? t("اختر الولاية أولاً") : !locationsReady() ? t("جارٍ تحميل قائمة البلديات…") : communes.length ? t("اختر البلدية") : t("لا توجد بلديات متاحة حالياً"),
    n + ":" + language() + ":" + communes.map(function (c) { return c.name + ":" + c.stopDesk; }).join("|"));
    picker.dataset.ecoWilaya = String(n); delete picker.dataset.ecoInitialValue;
    picker.disabled = !n || !locationsReady() || !communes.length;
    picker.setAttribute("aria-busy", locationsReady() ? "false" : "true");
    var label = picker.parentElement.querySelector('label[for="' + picker.id + '"]') || picker.previousElementSibling;
    if (!label || label.tagName !== "LABEL") {
      label = document.createElement("label"); label.className = "rb-eco-field-label";
      picker.insertAdjacentElement("beforebegin", label);
    }
    label.htmlFor = picker.id;
    if (label.classList.contains("rb-eco-field-label")) setText(label, t("البلدية *"));
    return picker;
  }
  function notice(select, f, state) {
    if (!f.commune) return;
    var node = f.commune.parentElement.querySelector('.rb-eco-availability[data-wilaya-id="' + select.id + '"]');
    if (!node) { node = document.createElement("p"); node.dataset.wilayaId = select.id; node.setAttribute("role", "status"); node.setAttribute("aria-live", "polite"); f.commune.insertAdjacentElement("afterend", node); }
    node.className = "rb-eco-availability is-" + state;
    var text = !code(select.value) ? t("اختر الولاية، ثم البلدية لمعرفة طرق التوصيل.") : !locationsReady() ?
      t("نعمل على تحميل البلديات المتاحة. انتظر لحظة من فضلك.") : !f.commune.value ? t("اختر البلدية ليظهر توفر مكتب الاستلام.") :
      state === "available" ? t("✓ مكتب الاستلام متاح في هذه البلدية.") : state === "unavailable" ?
      t("التوصيل للمنزل فقط — لا يوجد مكتب استلام في هذه البلدية.") : t("لم نتمكن من تأكيد توفر المكتب. اختر التوصيل للمنزل.");
    if (reference && reference.source === "bundled_locations" && f.commune.value)
      text = state === "available" ? t("المكتب متاح حسب آخر قائمة متوفرة؛ نؤكّد لك توفره قبل الشحن.") :
        t("حسب آخر قائمة متوفرة، التوصيل لهذه البلدية للمنزل فقط.");
    setText(node, text);
  }
  function radioNote(input, text, unavailable) {
    if (!input) return;
    var label = input.closest("label"); if (!label) return;
    label.classList.add("rb-eco-delivery-choice"); label.classList.toggle("rb-eco-choice-unavailable", !!unavailable);
    var note = label.querySelector(".rb-eco-choice-note");
    if (!note) { note = document.createElement("span"); note.className = "rb-eco-choice-note"; label.appendChild(note); }
    setText(note, text);
  }
  function selectedDesk(select, f) {
    if (!f.commune) return null;
    var desks = deskList(select.value, f.commune.value), picker = f.scope.querySelector('.rb-eco-desk[data-wilaya-id="' + select.id + '"] select');
    if (desks.length === 1) return desks[0];
    return picker && picker.value !== "" ? desks[Number(picker.value)] || null : null;
  }
  function bindDesk(select, f, availability) {
    if (!f.commune || !f.scope) return;
    var office = mode(f.scope, select.id) === "office" && availability === "available";
    var box = f.scope.querySelector('.rb-eco-desk[data-wilaya-id="' + select.id + '"]');
    if (!box) {
      box = document.createElement("div"); box.className = "rb-eco-desk"; box.dataset.wilayaId = select.id;
      var heading = document.createElement("p"); heading.className = "rb-eco-desk-heading";
      var label = document.createElement("label"); label.textContent = t("اختر مكتب الاستلام"); label.htmlFor = "rb-eco-desk-" + select.id;
      var picker = document.createElement("select"); picker.id = label.htmlFor; picker.className = "rb-eco-desk-select";
      var address = document.createElement("p"); address.className = "rb-eco-desk-address";
      box.appendChild(heading); box.appendChild(label); box.appendChild(picker); box.appendChild(address);
      var group = f.scope.querySelector('.delivery-type-group,.exp-delivery') || f.commune.parentElement;
      group.insertAdjacentElement("afterend", box);
    }
    box.hidden = !office;
    var desks = deskList(select.value, f.commune.value), picker = box.querySelector("select");
    var signature = code(select.value) + ":" + f.commune.value + ":" + desks.map(function (d) { return d.name + d.address; }).join("|");
    var current = picker.dataset.ecoLocation === signature ? picker.value : "";
    optionList(picker, desks.map(function (d, i) { return { value: String(i), label: d.name }; }), current, t("اختر مكتب الاستلام"), signature + ":" + language());
    picker.dataset.ecoLocation = signature;
    setText(box.querySelector("label"), t("اختر مكتب الاستلام"));
    picker.hidden = box.querySelector("label").hidden = desks.length < 2;
    picker.disabled = !office || desks.length < 2; picker.required = office && desks.length > 1;
    if (!picker.dataset.ecoBound) { picker.dataset.ecoBound = "1"; picker.addEventListener("change", function () { apply(); }); }
    var desk = selectedDesk(select, f);
    setText(box.querySelector(".rb-eco-desk-heading"), desk ? t("مكتب الاستلام: ") + desk.name : t("استلام من المكتب في ") + (f.commune.value || ""));
    setText(box.querySelector(".rb-eco-desk-address"), desk && desk.address ? desk.address + (desk.phone ? " · " + desk.phone : "") :
      desks.length > 1 && !desk ? t("اختر المكتب لمعرفة عنوانه.") : t("المكتب متاح وفق بيانات شركة التوصيل؛ سيُؤكَّد عنوان الاستلام معك قبل الشحن."));
    if (f.address) {
      var saved = addressState.get(f.address);
      if (office) {
        if (!saved) { saved = { value: f.address.value, readOnly: f.address.readOnly, label: null, labelHtml: "" }; addressState.set(f.address, saved); }
        if (!saved.label) {
          var addressLabel = f.address.parentElement.querySelector('label[for="' + f.address.id + '"]') || f.address.previousElementSibling;
          if (addressLabel && addressLabel.tagName === "LABEL") { saved.label = addressLabel; saved.labelHtml = addressLabel.innerHTML; }
        }
        f.address.value = desk && desk.address ? [desk.name, desk.address].filter(Boolean).join(" — ") : t("مكتب الاستلام في ") + f.commune.value;
        f.address.readOnly = true;
        if (saved.label) setText(saved.label, desk && desk.address ? t("عنوان مكتب الاستلام") : t("مكان الاستلام — العنوان يُؤكَّد قبل الشحن"));
      } else if (saved) {
        f.address.value = saved.value; f.address.readOnly = saved.readOnly;
        if (saved.label) saved.label.innerHTML = saved.labelHtml;
        addressState.delete(f.address);
      }
    }
  }
  function applyOne(select) {
    var oldCode = code(select.value), old = reference && reference.wilayas.find(function (w) { return w.code === oldCode; });
    if (reference && reference.available.wilayas) optionList(select, reference.wilayas.map(function (w) {
      return { value: w.arabic || w.name, label: w.arabic || w.name };
    }), old ? old.arabic || old.name : "", t("اختر الولاية"), "wilayas:" + language() + ":" + reference.wilayas.map(function (w) { return w.code; }).join("|"));
    var f = fields(select), n = code(select.value), commune = ensureCommune(select, f);
    if (!f.scope) return;
    var home = (select.id === "cartWilaya" ? document : f.scope).querySelector('input[name="' + radioName(select.id) + '"][value="home"]');
    var office = (select.id === "cartWilaya" ? document : f.scope).querySelector('input[name="' + radioName(select.id) + '"][value="office"]');
    var availability = commune ? deskAvailability(select.value, commune.value) : n && hasOffice(select.value) ? "available" : "unknown";
    var homeFee = checkoutFee(select.value, "home"), officeFee = checkoutFee(select.value, "office");
    var officeEnabled = !!(n && availability === "available" && officeFee != null);
    if (home) home.disabled = !!(n && homeFee == null);
    if (office) {
      office.disabled = !officeEnabled; office.setAttribute("aria-disabled", office.disabled ? "true" : "false");
      if (office.checked && office.disabled && home && !home.disabled) { office.checked = false; home.checked = true; home.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    var preliminary = reference && reference.source === "bundled_locations";
    radioNote(home, !n ? t("اختر الولاية") : money(homeFee) + (preliminary && homeFee != null ? t(" — مبدئي") : ""), home && home.disabled);
    radioNote(office, !n ? t("اختر الولاية والبلدية") : commune && !commune.value ? t("اختر البلدية أولاً") : officeEnabled ?
      t("متاح — ") + money(officeFee) + (preliminary ? t(" — مبدئي") : "") : availability === "unavailable" ? t("غير متاح لهذه البلدية") :
      availability === "available" ? t("السعر غير متاح حالياً") : t("التوفر غير مؤكّد"), !officeEnabled);
    notice(select, f, availability); bindDesk(select, f, availability);
    var hint = f.scope.querySelector('.rb-eco-rate-hint[data-wilaya-id="' + select.id + '"]');
    if (hint) hint.hidden = !preliminary;
    if (preliminary && n && locationsReady()) {
      if (!hint) { hint = document.createElement("p"); hint.className = "rb-eco-rate-hint"; hint.dataset.wilayaId = select.id; f.scope.appendChild(hint); }
      setText(hint, t("قائمة البلديات متاحة. سعر التوصيل المعروض مبدئي وسيؤكَّد معك قبل الشحن."));
    }
  }
  function apply() {
    if (applying) return;
    applying = true;
    try {
      document.querySelectorAll("datalist[id^='rb-eco-communes-']").forEach(function (node) { node.remove(); });
      wilayaIds.forEach(function (id) { var select = document.getElementById(id); if (select && select.tagName === "SELECT") applyOne(select); });
      ["recalcCartDelivery", "recalcModalDelivery", "updateOrderSummary", "updateExpressSummary"].forEach(function (fn) {
        if (typeof window[fn] === "function") { try { window[fn](); } catch (_) {} }
      });
      wilayaIds.forEach(function (id) {
        var select = document.getElementById(id); if (!select || !select.value) return;
        var f = fields(select); if (!f.scope || checkoutFee(select.value, mode(f.scope, id)) != null) return;
        var delivery = document.getElementById(id === "cartWilaya" ? "cartDelivery" : id === "expressWilaya" ? "expDelivery" : "sumDelivery");
        var total = document.getElementById(id === "cartWilaya" ? "cartTotal" : id === "expressWilaya" ? "expTotal" : "sumTotal");
        setText(delivery, t("غير متاح")); setText(total, "—");
      });
    } finally { applying = false; }
  }
  function schedule() { if (scheduled) return; scheduled = true; setTimeout(function () { scheduled = false; apply(); }, 40); }
  function validation(select) {
    var f = fields(select);
    if (!locationsReady()) return { ok: false, message: t("تعذّر تحميل قائمة البلديات. أعد المحاولة بعد لحظات."), focus: select };
    if (!code(select.value)) return { ok: false, message: t("اختر الولاية أولاً."), focus: select };
    if (!f.commune || !f.commune.value || !communeList(select.value).some(function (c) { return key(c.name) === key(f.commune.value); }))
      return { ok: false, message: t("اختر البلدية من القائمة."), focus: f.commune || select };
    var type = mode(f.scope, select.id);
    if (type === "office" && deskAvailability(select.value, f.commune.value) !== "available")
      return { ok: false, message: t("لا يوجد مكتب استلام في هذه البلدية. اختر التوصيل للمنزل."), focus: f.commune };
    if (checkoutFee(select.value, type) == null) return { ok: false, message: t("سعر طريقة التوصيل المختارة غير متاح حالياً."), focus: select };
    var box = f.scope.querySelector('.rb-eco-desk[data-wilaya-id="' + select.id + '"]');
    if (type === "office" && deskList(select.value, f.commune.value).length > 1 && (!box || !box.querySelector("select").value))
      return { ok: false, message: t("اختر مكتب الاستلام."), focus: box && box.querySelector("select") || f.commune };
    return { ok: true };
  }
  function block(event, select) {
    var result = validation(select); if (result.ok) return false;
    event.preventDefault(); event.stopImmediatePropagation();
    var f = fields(select), node = f.commune && f.commune.parentElement.querySelector(".rb-eco-availability");
    if (node) { node.className = "rb-eco-availability is-error"; node.setAttribute("role", "alert"); setText(node, result.message); }
    if (result.focus) { result.focus.focus(); if (!result.focus.disabled) { result.focus.setCustomValidity(result.message); result.focus.reportValidity(); setTimeout(function () { result.focus.setCustomValidity(""); }, 0); } }
    return true;
  }
  function actionSelect(button) {
    if (button.closest("#expressModal") || /submitExpressOrder/.test(button.getAttribute("onclick") || "")) return document.getElementById("expressWilaya");
    if (button.closest("#orderModal") || /submitOrder|confirmOrder/.test(button.id + " " + (button.getAttribute("onclick") || "")))
      return document.getElementById("wilayaSelect") || document.getElementById("wilaya");
    return null;
  }
  async function fetchLive() {
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 9000) : null;
    try {
      var response = await fetch(worker + "/delivery/reference", { credentials: "omit", signal: controller && controller.signal });
      var data = await response.json();
      if (!response.ok || !data.ok || !data.available || !data.available.communes ||
          !Array.isArray(data.wilayas) || !Array.isArray(data.communes) || !data.communes.length || !data.desks)
        throw new Error("reference_unavailable");
      reference = data; lastError = "";
      try { sessionStorage.setItem("robuste_eco_reference:" + worker, JSON.stringify(data)); } catch (_) {}
      apply(); document.dispatchEvent(new CustomEvent("robuste:ecotrack-reference", { detail: data }));
    } catch (_) { lastError = "reference_unavailable"; await fetchFallback(); apply(); }
    finally { if (timer) clearTimeout(timer); }
  }
  async function fetchFallback() {
    if (reference) return;
    try {
      var response = await fetch(new URL("robuste-delivery-locations.json?v=3", scriptUrl).href, { credentials: "omit" });
      var data = await response.json();
      if (!response.ok || reference || !data.wilayas || !data.communes || !data.desks) return;
      reference = data; apply();
    } catch (_) {}
  }
  window.RBEcoDelivery = { ready: ready, locationsReady: locationsReady, feeFor: feeFor, code: code,
    communeList: communeList, deskAvailability: deskAvailability, apply: apply,
    validateCheckout: function (id) { var select = document.getElementById(id); return select ? validation(select) : { ok: false, message: "checkout_not_found" }; },
    getReference: function () { return reference; }, refresh: fetchLive, lastError: function () { return lastError; } };
  function init() {
    worker = String(window.ROBUSTE_WORKER_URL || "https://robuste.aneslaidaoui06.workers.dev").replace(/\/+$/, "");
    try { var cached = JSON.parse(sessionStorage.getItem("robuste_eco_reference:" + worker) || "null");
      if (cached && cached.available && cached.available.communes && cached.wilayas && cached.communes && cached.communes.length &&
          Date.now() - Date.parse(cached.fetchedAt) < 3600000) reference = cached;
    } catch (_) {}
    window.onWilayaCommune = function () { apply(); };
    apply(); fetchFallback(); fetchLive();
    window.addEventListener("robuste:languagechange", function () { apply(); });
    document.addEventListener("change", function (event) {
      var node = event.target;
      if (wilayaIds.includes(node.id) || /baladiya|commune/i.test(node.id || "") || /DeliveryType|deliveryType/.test(node.name || "")) {
        if (/baladiya|commune/i.test(node.id || "")) node.setCustomValidity("");
        apply();
      }
    }, true);
    document.addEventListener("submit", function (event) {
      if (!(event.target instanceof HTMLFormElement)) return;
      var select = event.target.querySelector("#wilayaSelect,#wilaya,#expressWilaya"); if (select) block(event, select);
    }, true);
    document.addEventListener("click", function (event) {
      var button = event.target.closest("button,input[type='submit']"); if (!button || button.type === "reset") return;
      if (button.matches("#submitOrder,#submitOrderBtn,#submitOrderFinal,#confirmOrderBtn,#confirmExpressOrder,#expressSubmitBtn,[onclick*='submitExpressOrder'],[onclick*='submitOrder'],[onclick*='requestSubmit']") || button.type === "submit") {
        var select = actionSelect(button); if (!select && button.form) select = button.form.querySelector("#wilayaSelect,#wilaya,#expressWilaya");
        if (select) block(event, select);
      }
    }, true);
    if (window.MutationObserver) new MutationObserver(function (changes) {
      if (changes.some(function (change) {
        if (change.target.tagName === "SELECT" && (wilayaIds.includes(change.target.id) || /baladiya|commune/i.test(change.target.id || "")))
          return change.target.options.length > 1 && change.target.options[1].dataset.eco !== "1";
        return Array.from(change.addedNodes).some(function (node) { return node.nodeType === 1 &&
          (wilayaIds.includes(node.id) || /baladiya|commune/i.test(node.id || "") || node.querySelector && node.querySelector("#expressWilaya,#wilayaSelect,#wilaya,#cartWilaya,#baladiyaInput,#expressBaladiya")); });
      })) schedule();
    }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
