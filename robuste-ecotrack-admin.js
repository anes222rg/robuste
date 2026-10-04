/* Staff-only Assil API Standard tools. All courier actions use authenticated
 * Worker endpoints, never browser-held courier tokens.
 */
(function () {
  "use strict";
  var typeLabels = { 1: "توصيل", 2: "تبادل / Échange", 3: "استرجاع / Pickup", 4: "تحصيل" };
  var eventLabels = { order_information_received_by_carrier: "تسجيل وتأكيد الشحنة", picked: "استلام الناقل للطرد",
    accepted_by_carrier: "استلام مركز الفرز", dispatched_to_driver: "التسليم للموزّع", attempt_delivery: "محاولة توصيل",
    return_asked: "بدء مسار الإرجاع", return_in_transit: "الإرجاع في الطريق", return_received: "استلام المرتجع",
    livred: "تم التسليم", encaissed: "تم تحصيل المبلغ", payed: "الناقل أبلغ الدفع", notification_on_order: "تحديث / ملاحظة" };
  var paymentLabels = { unknown: "غير معلوم", return_review: "إرجاع / إلغاء — يحتاج تسوية يدوية",
    delivered_uncollected: "تم التسليم — لم يُبلّغ التحصيل",
    collected_unpaid: "مُحصّل — غير مدفوع", paid_reported: "موسوم مدفوعاً لدى الناقل" };
  var errors = {
    unauthorized: "انتهت الجلسة. سجّل الدخول مجدداً.", rate_limited: "بلغنا حد طلبات Assil. انتظر بضع دقائق قبل المحاولة مجدداً.",
    parcel_already_dispatched: "سُلّم هذا الطرد للناقل؛ استخدم الملاحظات أو طلب الإرجاع.",
    parcel_not_confirmed_as_draft: "لم يؤكد Assil أن الطرد مسودة قابلة للتعديل. حدّث حالته أولاً.",
    commune_not_served: "البلدية المختارة غير متاحة. اختر بلدية من القائمة.",
    wilaya_not_served: "الولاية غير متاحة لدى Assil.", stop_desk_not_available: "لا يوجد مكتب استلام مؤكّد لهذه البلدية.",
    tracking_unavailable: "تعذّر جلب حالات الطرود من Assil. حاول مجدداً لاحقاً.",
    no_eligible_return: "لم يؤكد Assil وجود مرتجع جاهز للاستلام.",
    action_pending_reconciliation: "نتيجة محاولة الإنشاء السابقة غير مؤكدة. طابق رقم الطرد في Assil قبل إنشاء طرد آخر.",
    related_parcel_limit: "وصل الطلب إلى الحد الأقصى للطرود المرتبطة.",
    courier_updated_save_failed: "تم الإجراء لدى Assil، لكن تعذّر حفظه في المتجر. حدّث الحالة وطابق الطرد قبل إجراء آخر.",
    parcel_created_save_failed: "أُنشئ الطرد لدى Assil. أعد نفس المحاولة لربط الطرد الموجود دون إنشاء طرد جديد.",
    parcel_created_action_save_failed: "أُنشئ الطرد، لكن حفظ بياناته تعذّر. طابقه في Assil قبل المحاولة مجدداً."
  };
  function errorText(data) {
    var code = data.detail || data.message || data.error || "";
    return errors[data.error] || errors[code] || (/rate_limited|HTTP 429/.test(code) ? errors.rate_limited : code) || "تعذّر الاتصال بالخادم. حاول مجدداً.";
  }
  function hasParcels(d) { return !!(d.ecotrackTracking || (d.ecotrackRelatedParcels || []).some(function (p) { return p.tracking && !p.deletedAt; })); }
  function isDraft(p) { return !p.ecotrackValidated && (!p.ecotrackStage || ["unknown", "preparing"].includes(p.ecotrackStage)); }
  function matchesStage(row, filter) {
    var p = row.data, stage = p.ecotrackStage || "unknown";
    if (filter === "draft") return isDraft(p);
    if (filter === "attention") return !!p.ecotrackNeedsAttention || stage === "unknown";
    if (filter === "active") return !isDraft(p) && !["delivered", "returned", "cancelled"].includes(stage);
    if (filter === "closed") return ["delivered", "returned", "cancelled"].includes(stage);
    return true;
  }
  function dateMillis(value) {
    if (value && typeof value.toDate === "function") return value.toDate().getTime();
    if (value && typeof value.seconds === "number") return value.seconds * 1000;
    return Date.parse(value || "");
  }
  function esc(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  }); }
  function number(value) {
    if (value == null || String(value).trim() === "") return null;
    var n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null;
  }
  function money(value) { var n = number(value); return n == null ? "—" : n.toLocaleString("fr-DZ") + " د.ج"; }
  function key(value) { return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[^a-z0-9\u0600-\u06ff]/g, ""); }
  function button(label, attributes, style) {
    return '<button type="button" class="eco-button ' + (style || "") + '" ' + (attributes || "") + ">" + esc(label) + "</button>";
  }
  function flatten(orders) {
    var rows = [];
    orders.forEach(function (record) {
      var d = record.data || {}, saved = d.ecotrackPayload || {};
      if (d.ecotrackTracking) rows.push({ id: record.id, tracking: d.ecotrackTracking, primary: true, data: d,
        type: Number(d.ecotrackType || saved.type || 1), amount: number(d.ecotrackCodAmount == null ? d.totalPrice : d.ecotrackCodAmount),
        wilaya: saved.code_wilaya || d.wilaya, customer: saved.nom_client || d.customer || "", source: d });
      (d.ecotrackRelatedParcels || []).forEach(function (p) {
        if (p.deletedAt) return;
        rows.push({ id: record.id, tracking: p.tracking, primary: false, data: p,
          type: Number(p.ecotrackType || 1), amount: number(p.totalPrice),
          wilaya: p.wilaya || d.wilaya, customer: p.customer || d.customer || "", source: d });
      });
    });
    return rows;
  }
  function statistics(rows) {
    var s = { total: rows.length, delivered: 0, returned: 0, open: 0, attention: 0, unknown: 0,
      paid: 0, unpaid: 0, uncollected: 0, paidCount: 0, unpaidCount: 0, uncollectedCount: 0,
      missingFees: 0, fees: 0, feeCount: 0, estimatedFeeCount: 0, pickupCount: 0 };
    rows.forEach(function (r) {
      var p = r.data, stage = p.ecotrackStage || "unknown";
      if (stage === "delivered") s.delivered++;
      else if (stage === "returned") s.returned++;
      else if (stage === "unknown") s.unknown++;
      else s.open++;
      if (p.ecotrackNeedsAttention) s.attention++;
      if (r.type === 3) s.pickupCount++;
      var state = p.ecotrackPaymentState || "unknown";
      if (r.type !== 3 && r.amount != null) {
        if (state === "paid_reported") { s.paid += r.amount; s.paidCount++; }
        if (state === "collected_unpaid") { s.unpaid += r.amount; s.unpaidCount++; }
        if (state === "delivered_uncollected") { s.uncollected += r.amount; s.uncollectedCount++; }
      }
      // Costs on completed deliveries/returns only; open parcel costs are not invoices.
      if (!["delivered", "returned"].includes(stage)) return;
      var actual = number(stage === "returned" ? p.ecotrackActualReturnFee : p.ecotrackActualServiceFee);
      var estimate = number(stage === "returned" ? p.ecotrackReturnFeeEstimate : p.ecotrackServiceFeeEstimate);
      var fee = actual == null ? estimate : actual;
      if (fee == null) s.missingFees++;
      else { s.fees += fee; s.feeCount++; if (actual == null) s.estimatedFeeCount++; }
    });
    return s;
  }
  function csvCell(value) {
    var text = String(value == null ? "" : value);
    if (typeof value !== "number" && /^[\s\u0000-\u001f]*[=+\-@]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function create(config) {
    var state = { reference: null, health: null, tab: "parcels", search: "", period: "all", filter: "all", limit: 50,
      busy: false, message: "", error: "", timer: null, healthTimer: null, started: false, panelCursor: 0, retryAfter: 0 };
    var host = document.getElementById("sec-ecotrack");
    function isReady() { return !!(state.reference && state.reference.available && state.reference.available.fees && state.reference.available.wilayas); }
    function resolveCode(value) {
      if (!state.reference) return Number(value) || 0;
      var w = state.reference.wilayas.find(function (x) { return x.code === Number(value) ||
        key(x.name) === key(value) || key(x.arabic) === key(value); });
      return w ? w.code : 0;
    }
    function wilayaName(value) {
      var w = state.reference && state.reference.wilayas.find(function (x) { return x.code === resolveCode(value); });
      return w ? w.arabic || w.name : String(value || "—");
    }
    function rateFor(wilaya, delivery, type) {
      var row = state.reference && state.reference.fees[resolveCode(wilaya)];
      var table = row && row[({ 1: "delivery", 2: "exchange", 3: "pickup", 4: "recovery" })[type || 1]];
      return table ? table[delivery === "home" ? "home" : "office"] : null;
    }
    async function request(method, path, body) {
      var response = method === "GET" ? await config.get(path) : await config.post(path, body);
      var data;
      try { data = await response.json(); } catch { data = {}; }
      if (!response.ok || data.error || data.ok === false && !data.results) {
        var e = new Error(errorText(data));
        if (response.status === 429 || /rate_limited|HTTP 429/.test(data.detail || data.error || "")) state.retryAfter = Date.now() + 300000;
        e.data = data; throw e;
      }
      return data;
    }
    function applyPatch(row, patch) {
      if (!patch) return;
      var record = config.getOrders().find(function (r) { return r.id === row.id; });
      if (!record) return;
      if (row.primary) Object.assign(record.data, patch);
      else {
        var parcel = (record.data.ecotrackRelatedParcels || []).find(function (p) { return p.tracking === row.tracking; });
        if (parcel) Object.assign(parcel, patch);
      }
      if (config.onChange) config.onChange();
    }
    function allRows(ignoreStage) {
      var rows = flatten(config.getOrders());
      if (state.period !== "all") {
        var since = Date.now() - Number(state.period) * 86400000;
        rows = rows.filter(function (r) {
          var date = dateMillis(r.data.ecotrackCreatedAt || r.data.createdAt || r.source.createdAt || r.source.timestamp);
          return Number.isFinite(date) && date >= since;
        });
      }
      var query = state.search.toLowerCase().trim();
      rows = query ? rows.filter(function (r) {
        return [r.tracking, r.customer, r.id, wilayaName(r.wilaya)].join(" ").toLowerCase().includes(query);
      }) : rows;
      return ignoreStage || state.tab !== "parcels" ? rows : rows.filter(function (r) { return matchesStage(r, state.filter); });
    }
    function metric(label, value, note) {
      return '<div class="eco-metric"><div class="eco-metric-label">' + esc(label) +
        '</div><div class="eco-metric-value">' + esc(value) + '</div><div class="eco-metric-note">' + esc(note || "") + "</div></div>";
    }
    function render() {
      if (!host) return;
      var restoreSearch = document.activeElement && document.activeElement.id === "ecoSearch";
      var rows = allRows(), summary = statistics(rows), health = state.health || {}, scheduler = health.scheduler;
      var lastRun = scheduler && scheduler.lastRunAt;
      var html = '<div class="eco-tools"><div class="eco-heading"><div><h2>Assil Delivery / Ecotrack</h2>' +
        '<div class="eco-subtitle">أنشئ المسودة، اطبع الملصق، ثم أكّد تسليم الطرد للناقل. تابع حالته والتحصيل هنا.</div></div><div class="eco-actions">' +
        (config.goShipping ? button("إنشاء شحنة", 'data-eco="shipping"', "eco-primary") : "") +
        button(state.busy ? "جارٍ التحديث…" : "تحديث الحالات الآن", 'data-eco="sync"' + (state.busy ? " disabled" : ""), "eco-primary") +
        button("تحديث التعرفة والمكاتب", 'data-eco="reference"' + (state.busy ? " disabled" : "")) + "</div></div>";
      html += '<details class="eco-connection"><summary>' + (lastRun ? "آخر تحديث تلقائي: " + esc(new Date(lastRun).toLocaleString("ar-DZ")) :
        "التحديث التلقائي يعمل أثناء فتح اللوحة") + '</summary><p>' +
        (health.enabled === false ? "التحديث في الخلفية معطّل." : !lastRun ? "فعّل التحديث في الخلفية من إعدادات Worker لمتابعة الطرود عند إغلاق اللوحة." : "التحديث في الخلفية مفعّل.") +
        (scheduler && scheduler.lastError ? " آخر مشكلة: " + esc(scheduler.lastError) : "") +
        (health.telegramConfigured ? " تنبيهات Telegram مفعّلة." : " تنبيهات Telegram غير مفعّلة.") + "</p></details>";
      if (state.error) html += '<div class="eco-banner eco-error" role="alert">' + esc(state.error) + "</div>";
      if (state.message) html += '<div class="eco-banner" role="status">' + esc(state.message) + "</div>";
      html += '<div class="eco-tabs" role="tablist" aria-label="أدوات الشحن">';
      [["parcels", "الطرود والمتابعة"], ["finance", "التحصيل والتقارير"], ["locations", "التعرفة والمكاتب"]].forEach(function (tab) {
        html += '<button type="button" role="tab" aria-selected="' + (state.tab === tab[0]) + '" data-tab="' + tab[0] + '">' + tab[1] + "</button>";
      });
      html += '</div><div class="eco-filters"><label for="ecoPeriod">الفترة</label><select id="ecoPeriod" aria-label="فترة التقرير">' +
        '<option value="all">كل الشحنات المحلية</option><option value="30">آخر 30 يوماً</option><option value="7">آخر 7 أيام</option></select>' +
        '<input id="ecoSearch" type="search" placeholder="بحث برقم التتبع أو العميل أو الولاية" aria-label="بحث في الشحنات" value="' + esc(state.search) + '"></div>';
      if (state.tab === "parcels") {
        html += '<div class="eco-pipeline" role="group" aria-label="تصفية حالات الطرود">';
        var baseRows = allRows(true);
        [["all", "كل الطرود"], ["draft", "مسودات للتسليم"], ["active", "في الطريق"], ["attention", "تحتاج متابعة"], ["closed", "مكتملة"]].forEach(function (f) {
          html += '<button type="button" data-filter="' + f[0] + '" aria-pressed="' + (state.filter === f[0]) + '">' + f[1] +
            ' <span>' + baseRows.filter(function (r) { return matchesStage(r, f[0]); }).length + '</span></button>';
        });
        html += "</div>";
      }
      if (state.tab === "parcels") html += parcelView(rows, summary);
      if (state.tab === "finance") html += financeView(rows, summary);
      if (state.tab === "locations") html += locationsView();
      html += "</div>"; host.innerHTML = html;
      host.querySelectorAll(".eco-table-wrap").forEach(function (region) {
        if (!region.querySelector("table")) return;
        region.tabIndex = 0;
        region.setAttribute("role", "region");
        region.setAttribute("aria-label", "جدول قابل للتمرير أفقياً");
        var hint = document.createElement("p");
        hint.className = "eco-scroll-hint";
        hint.textContent = "اسحب الجدول أفقياً لرؤية بقية الأعمدة والإجراءات.";
        region.before(hint);
      });
      host.querySelector("#ecoPeriod").value = state.period;
      bind();
      if (restoreSearch) host.querySelector("#ecoSearch").focus({ preventScroll: true });
    }
    function parcelView(rows, s) {
      var html = '<div class="eco-metrics">' + metric("الشحنات المرتبطة", s.total, "الأصلية + التبادل والاسترجاع") +
        metric("تم التسليم", s.delivered, "حالة مبلغ التحصيل معروضة منفصلة") +
        metric("المرتجعات المستلمة", s.returned, "طلبات الإرجاع وحدها لا تُحسب") +
        metric("تحتاج متابعة", s.attention, s.unknown + " شحنة بلا حالة متزامنة") + "</div>";
      if (!rows.length) return html + '<div class="eco-table-wrap"><div class="eco-empty">لا توجد طرود تطابق هذا العرض.' +
        (state.search || state.filter !== "all" || state.period !== "all" ? '<p>' + button("مسح الفلاتر", 'data-eco="reset"') + '</p>' :
          '<p>ابدأ بتأكيد الطلب ثم إنشاء المسودة من شاشة الشحن.</p>' + (config.goShipping ? button("فتح شاشة الشحن", 'data-eco="shipping"', "eco-primary") : "")) + '</div></div>';
      html += '<div class="eco-table-wrap"><table class="eco-table"><thead><tr><th>رقم التتبع / العميل</th><th>النوع / الولاية</th><th>الحالة</th><th>التحصيل</th><th>الإجراءات</th></tr></thead><tbody>';
      rows.slice(0, state.limit).forEach(function (r, i) {
        var p = r.data, stage = p.ecotrackStage || "unknown";
        html += '<tr><td data-label="العميل والتتبع"><div class="eco-tracking" dir="ltr">' + esc(r.tracking) +
          ' ' + button("نسخ", 'data-row="' + i + '" data-action="copy"', "eco-copy") + '</div><span class="eco-secondary" dir="rtl">' + esc(r.customer) +
          (r.primary ? "" : " · مرتبط بالطلب الأصلي") + '</span></td><td data-label="الشحنة">' + esc(typeLabels[r.type] || "—") +
          '<span class="eco-secondary">' + esc(wilayaName(r.wilaya)) + '</span></td><td data-label="الحالة"><span class="eco-state ' +
          (stage === "delivered" ? "eco-good" : p.ecotrackNeedsAttention ? "eco-alert" : "") + '">' +
          esc(isDraft(p) ? "مسودة — بانتظار التسليم" : p.ecotrackStageLabel || "لم تُحدّث الحالة بعد") + "</span>";
        if (p.ecotrackNeedsAttention) html += '<span class="eco-secondary">' + esc(p.ecotrackNeedsAttention) + "</span>";
        if (p.ecotrackReturnRequestedAt) html += '<span class="eco-secondary">طُلب الإرجاع؛ قبول الناقل غير مضمون.</span>';
        html += '<span class="eco-secondary">' + (p.ecotrackLastSyncedAt ? "آخر تحقق: " +
          esc(new Date(p.ecotrackLastSyncedAt).toLocaleString("ar-DZ")) : "يلزم تحديث") + '</span></td><td data-label="التحصيل">' +
          esc(r.type === 3 ? "Pickup — خارج إجمالي COD" : money(r.amount)) +
          '<span class="eco-secondary">' + esc(paymentLabels[p.ecotrackPaymentState || "unknown"] || paymentLabels.unknown) +
          '</span></td><td data-label="الإجراءات"><div class="eco-row-actions">' + button("السجل والملاحظات", 'data-row="' + i + '" data-action="history"');
        html += button("الملصق", 'data-row="' + i + '" data-action="label"');
        if (isDraft(p)) html += button("تأكيد التسليم للناقل", 'data-row="' + i + '" data-action="dispatch"', "eco-primary");
        html += '</div><details class="eco-more"><summary>المزيد</summary><div class="eco-row-actions">' +
          button("تحديث هذا الطلب", 'data-row="' + i + '" data-action="sync"');
        if (config.openOrder) html += button("فتح الطلب الأصلي", 'data-row="' + i + '" data-action="order"');
        if (isDraft(p)) html += button("تعديل المسودة", 'data-row="' + i + '" data-action="update"') +
          button("حذف المسودة", 'data-row="' + i + '" data-action="delete"', "eco-danger");
        if (r.primary) html += button("تبادل / Pickup", 'data-row="' + i + '" data-action="related"');
        if (!isDraft(p) && !p.ecotrackReturnRequestedAt && !["delivered", "returned", "cancelled"].includes(stage))
          html += button("طلب إرجاع", 'data-row="' + i + '" data-action="request-return"');
        if (["returning", "returned"].includes(stage) && !p.ecotrackReturnReceivedAt) html += button("استلام المرتجع", 'data-row="' + i + '" data-action="receive-return"');
        html += "</div></details></td></tr>";
      });
      html += '</tbody></table></div><p class="eco-subtitle">عرض ' + Math.min(rows.length, state.limit) + ' من ' + rows.length + ' طرد</p>';
      return html + (rows.length > state.limit ? button("عرض المزيد", 'data-eco="more"') : "");
    }
    function financeView(rows, s) {
      var html = '<div class="eco-banner eco-warning">هذا التقرير مبني على حالات الناقل للشحنات المرتبطة بمتجرك فقط، وليس كشف حساب Assil كاملاً. ' +
        '«موسوم مدفوعاً» لا يثبت وصول المال إلى بنكك. API Standard لا يوفر هنا كشف التحويلات البنكية أو رصيداً مؤكداً.</div>' +
        '<div class="eco-metrics">' + metric("مبالغ موسومة مدفوعة", money(s.paid), s.paidCount + " شحنة — إجمالي COD قبل التكاليف") +
        metric("مُحصّل ولم يُدفع", money(s.unpaid), s.unpaidCount + " شحنة — حسب حالة الناقل") +
        metric("مسلّم ولم يُبلّغ التحصيل", money(s.uncollected), s.uncollectedCount + " شحنة") +
        metric("تعرفة مرجعية للحالات المكتملة", money(s.fees), s.estimatedFeeCount + " تقدير · " + s.missingFees + " تعرفة مفقودة") + "</div>" +
        '<div class="eco-banner">التكاليف تخص الشحنات المسلّمة أو المرتجعة فقط. التعرفة المحفوظة تقدير؛ افتح «السجل» لاسترجاع tarif_prestation / tarif_retour المبلغ عنه من الناقل. ' +
        'هذا مجموع مرجعي وليس فاتورة: يقرر الناقل إن كانت رسوم الذهاب والإرجاع تُجمع. لا يُحسب Pickup كتحصيل مبيعات، ولا تُفترض قيمة صافية للمدفوعات غير المعلومة.</div>' +
        '<div class="eco-actions">' + button("تصدير التقرير CSV", 'data-eco="csv"') + '</div><h3>تفصيل المبالغ والتكاليف</h3>';
      html += '<div class="eco-table-wrap"><table class="eco-table"><thead><tr><th>رقم التتبع</th><th>مبلغ COD</th><th>حالة التحصيل</th><th>تعرفة التوصيل</th><th>تعرفة الإرجاع</th><th>مصدر التعرفة</th></tr></thead><tbody>';
      rows.forEach(function (r) {
        var p = r.data, service = number(p.ecotrackActualServiceFee), returned = number(p.ecotrackActualReturnFee);
        html += "<tr><td dir=\"ltr\">" + esc(r.tracking) + "</td><td>" + esc(r.type === 3 ? "غير محتسب / Pickup" : money(r.amount)) +
          "</td><td>" + esc(paymentLabels[p.ecotrackPaymentState || "unknown"] || paymentLabels.unknown) + "</td><td>" +
          esc(money(service == null ? p.ecotrackServiceFeeEstimate : service)) + "</td><td>" +
          esc(money(returned == null ? p.ecotrackReturnFeeEstimate : returned)) + "</td><td>" +
          esc(service != null || returned != null ? "قيمة أبلغ عنها API (تحقق بالسجل)" : "تقدير من تعرفة الحساب / غير متوفر") + "</td></tr>";
      });
      html += "</tbody></table></div><h3>نتائج التوصيل حسب الولاية</h3>";
      var grouped = {};
      rows.filter(function (r) { return r.type === 1 || r.type === 2; }).forEach(function (r) {
        var name = wilayaName(r.wilaya), g = grouped[name] || (grouped[name] = { total: 0, delivered: 0, returned: 0, unknown: 0 });
        g.total++; if (r.data.ecotrackStage === "delivered") g.delivered++;
        else if (r.data.ecotrackStage === "returned") g.returned++;
        else if (!r.data.ecotrackStage || r.data.ecotrackStage === "unknown") g.unknown++;
      });
      html += '<div class="eco-table-wrap"><table class="eco-table"><thead><tr><th>الولاية</th><th>إجمالي الشحنات</th><th>مسلّمة</th><th>مرتجعة</th><th>نجاح ضمن النتائج المغلقة</th><th>غير معلوم</th></tr></thead><tbody>';
      Object.keys(grouped).sort().forEach(function (name) {
        var g = grouped[name], closed = g.delivered + g.returned;
        html += "<tr><td>" + esc(name) + "</td><td>" + g.total + "</td><td>" + g.delivered + "</td><td>" + g.returned +
          "</td><td>" + (closed ? (100 * g.delivered / closed).toFixed(1) + "% (" + closed + " نتيجة)" : "—") +
          "</td><td>" + g.unknown + "</td></tr>";
      });
      return html + "</tbody></table></div>";
    }
    function locationsView() {
      var ref = state.reference;
      if (!ref) return '<div class="eco-banner eco-warning">التعرفة والمواقع غير متاحة بعد. اضغط تحديث التعرفة والمكاتب.</div>';
      var html = '<div class="eco-banner">تعرفة حساب Assil، تاريخ الجلب: ' + esc(new Date(ref.fetchedAt).toLocaleString("ar-DZ")) +
        ". الأسعار هنا تكلفة الخدمة؛ مبالغ الطلبات القديمة لا تتغيّر تلقائياً.</div>";
      if (ref.errors && ref.errors.length) html += '<div class="eco-banner eco-warning">بيانات ناقصة: ' + esc(ref.errors.join(", ")) +
        " — لا تُعامل البيانات المفقودة على أنها خدمة مجانية.</div>";
      html += '<div class="eco-table-wrap"><table class="eco-table"><thead><tr><th>الولاية</th><th>منزل</th><th>Stop Desk</th><th>تبادل منزل</th><th>Pickup منزل</th><th>إرجاع منزل</th></tr></thead><tbody>';
      ref.wilayas.forEach(function (w) {
        var row = ref.fees[w.code] || {};
        var officePrice = money(row.delivery && row.delivery.office);
        var desksKnown = ref.available && (ref.available.desks || ref.available.communes);
        var hasDesk = ref.desks.some(function (d) { return Number(d.wilaya) === Number(w.code); }) ||
          ref.communes.some(function (c) { return Number(c.wilaya) === Number(w.code) && c.stopDesk === true; });
        var office = desksKnown ? (hasDesk ? officePrice : "غير متاح — لا مكتب مؤكّد") :
          "التوفر غير مؤكّد" + (officePrice === "—" ? "" : " · " + officePrice);
        html += "<tr><td>" + esc(w.arabic || w.name) + "</td><td>" + esc(money(row.delivery && row.delivery.home)) +
          "</td><td>" + esc(office) + "</td><td>" + esc(money(row.exchange && row.exchange.home)) +
          "</td><td>" + esc(money(row.pickup && row.pickup.home)) + "</td><td>" + esc(money(row.return && row.return.home)) + "</td></tr>";
      });
      html += '</tbody></table></div><h3>المكاتب المتاحة</h3><div class="eco-table-wrap"><table class="eco-table"><thead><tr><th>المكتب</th><th>الولاية / البلدية</th><th>العنوان</th><th>الهاتف</th></tr></thead><tbody>';
      ref.desks.forEach(function (d) { html += "<tr><td>" + esc(d.name) + "</td><td>" + esc(wilayaName(d.wilaya) + " / " + d.commune) +
        "</td><td>" + esc(d.address || "—") + "</td><td dir=\"ltr\">" + esc(d.phone || "—") + "</td></tr>"; });
      return html + "</tbody></table></div>";
    }
    function findRow(index) { return allRows()[Number(index)]; }
    function bind() {
      host.querySelectorAll("[data-tab]").forEach(function (b) {
        b.onclick = function () { state.tab = b.dataset.tab; state.error = ""; render(); };
      });
      host.querySelectorAll("[data-filter]").forEach(function (b) {
        b.onclick = function () { state.filter = b.dataset.filter; state.limit = 50; render(); };
      });
      host.querySelector("#ecoPeriod").onchange = function (e) { state.period = e.target.value; render(); };
      var searchTimer;
      host.querySelector("#ecoSearch").oninput = function (e) {
        state.search = e.target.value; clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          var position = e.target.selectionStart; render();
          var next = host.querySelector("#ecoSearch"); next.focus(); if (next.type !== "search") next.setSelectionRange(position, position);
        }, 250);
      };
      host.querySelectorAll("[data-eco]").forEach(function (b) {
        b.onclick = function () {
          if (b.dataset.eco === "sync") syncAll();
          if (b.dataset.eco === "reference") refreshReference(true);
          if (b.dataset.eco === "csv") exportCsv();
          if (b.dataset.eco === "shipping" && config.goShipping) config.goShipping();
          if (b.dataset.eco === "more") { state.limit += 50; render(); }
          if (b.dataset.eco === "reset") { state.search = ""; state.period = "all"; state.filter = "all"; state.limit = 50; render(); }
        };
      });
      host.querySelectorAll("[data-action]").forEach(function (b) {
        b.onclick = function () { var row = findRow(b.dataset.row); if (row) action(row, b.dataset.action); };
      });
    }
    async function refreshReference(fresh) {
      var ref = null;
      try {
        ref = await request("GET", "/admin/ecotrack/reference" + (fresh ? "?fresh=1" : ""));
        if (!ref.available || !Array.isArray(ref.wilayas)) throw new Error("انشر نسخة Worker المحدّثة أولاً؛ تنسيق التعرفة الحالي قديم.");
        state.error = "";
      } catch (e) { ref = null; state.error = "تعذّر جلب التعرفة: " + e.message; }
      if (!ref || !ref.available || !ref.available.wilayas || !ref.available.communes || !ref.communes.length) {
        try {
          var response = await fetch("robuste-delivery-locations.json?v=3", { credentials: "omit" });
          if (!response.ok) throw new Error("fallback_unavailable");
          var fallback = await response.json();
          if (!fallback.wilayas || !fallback.communes || !fallback.communes.length) throw new Error("fallback_unavailable");
          ref = Object.assign({}, ref || fallback, { locationsFallback: true,
            wilayas: ref && ref.available.wilayas ? ref.wilayas : fallback.wilayas,
            communes: fallback.communes, desks: ref && ref.available.desks ? ref.desks : fallback.desks,
            available: Object.assign({}, ref && ref.available || fallback.available, { wilayas: true, communes: true }) });
        } catch (_) {
          // Keep the last usable list during an outage.
          if (state.reference) ref = state.reference;
        }
      }
      if (ref) state.reference = ref;
      if (config.onReference && state.reference) config.onReference(state.reference);
      render();
    }
    async function refreshHealth() {
      try { state.health = await request("GET", "/admin/ecotrack/health"); } catch {}
      if (config.isActive && config.isActive()) render();
    }
    async function syncIds(ids, showProgress) {
      var changed = 0, missing = 0;
      for (var i = 0; i < ids.length; i += 15) {
        if (showProgress) { state.message = "تحديث " + Math.min(i + 15, ids.length) + " / " + ids.length + " طلب…"; render(); }
        var data = await request("POST", "/admin/ecotrack/sync", { ids: ids.slice(i, i + 15) });
        changed += data.changed || 0; missing += (data.results || []).filter(function (r) { return !r.ok; }).length;
        if (data.notificationError) state.error = "تمت مزامنة الحالات، لكن تنبيه Telegram تعذّر: " + data.notificationError;
        if (i + 15 < ids.length) await new Promise(function (resolve) { setTimeout(resolve, 1400); });
      }
      return { changed: changed, missing: missing };
    }
    async function syncAll() {
      if (state.busy) return;
      var ids = [...new Set(allRows().map(function (r) { return r.id; }))];
      if (!ids.length) { state.message = "لا توجد طرود لتحديثها في هذا العرض."; render(); return; }
      state.busy = true; state.error = ""; render();
      try {
        var result = await syncIds(ids, true);
        state.message = "اكتمل التحقق. تغيّرت " + result.changed + " حالة؛ " + result.missing + " حالة غير متاحة لدى الناقل.";
        await refreshHealth();
      } catch (e) { state.error = "تعذّر التحديث: " + e.message; state.message = ""; }
      finally { state.busy = false; render(); }
    }
    async function syncNext() {
      if (state.busy || document.visibilityState === "hidden" || Date.now() < state.retryAfter) return;
      var ids = config.getOrders().filter(function (r) { return hasParcels(r.data); }).map(function (r) { return r.id; });
      if (!ids.length) return;
      if (state.panelCursor >= ids.length) state.panelCursor = 0;
      var batch = ids.slice(state.panelCursor, state.panelCursor + 15); state.panelCursor += batch.length;
      state.busy = true;
      try { await syncIds(batch, false); } catch (e) { state.error = "آخر تحديث أثناء فتح اللوحة لم يكتمل: " + e.message; }
      finally { state.busy = false; if (config.isActive && config.isActive()) render(); }
    }
    function modal(title, content, onSubmit, submitText) {
      return new Promise(function (resolve, reject) {
        var prior = document.activeElement, priorOverflow = document.body.style.overflow, layer = document.createElement("div"); layer.className = "eco-modal-layer";
        layer.innerHTML = '<section class="eco-dialog" role="dialog" aria-modal="true" aria-labelledby="ecoDialogTitle">' +
          '<div class="eco-dialog-header"><h2 id="ecoDialogTitle">' + esc(title) + "</h2>" +
          button("إغلاق", 'data-close="1" aria-label="إغلاق النافذة"') + '</div><form><div data-content>' + content +
          '</div><div class="eco-banner eco-error" data-error hidden role="alert"></div><div class="eco-dialog-footer">' +
          button("إلغاء", 'data-close="1"') + (onSubmit ? '<button type="submit" class="eco-button eco-primary">' +
            esc(submitText || "حفظ") + "</button>" : "") + "</div></form></section>";
        document.body.appendChild(layer);
        document.body.style.overflow = "hidden";
        var form = layer.querySelector("form"), busy = false;
        function close(value, error) {
          if (busy) return;
          layer.remove(); document.body.style.overflow = priorOverflow; document.removeEventListener("keydown", keyboard);
          if (prior && prior.focus) prior.focus();
          if (error) reject(error); else resolve(value);
        }
        function keyboard(e) {
          if (e.key === "Escape") { e.preventDefault(); close(null, new Error("cancelled_by_admin")); }
          if (e.key === "Tab") {
            var focusable = Array.from(layer.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]"))
              .filter(function (el) { return el.offsetParent !== null; });
            if (!focusable.length) return;
            var first = focusable[0], last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
          }
        }
        document.addEventListener("keydown", keyboard);
        layer.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { close(null, new Error("cancelled_by_admin")); }; });
        if (onSubmit) form.onsubmit = async function (event) {
          event.preventDefault(); if (busy || !form.reportValidity()) return;
          busy = true; var submit = form.querySelector('[type="submit"]'), submitLabel = submit.textContent;
          submit.disabled = true; submit.textContent = "جارٍ التنفيذ…";
          layer.querySelectorAll("[data-close]").forEach(function (b) { b.disabled = true; });
          try { var result = await onSubmit(form); busy = false; close(result); }
          catch (e) {
            var error = form.querySelector("[data-error]"); error.hidden = false; error.textContent = e.message;
            if (e.data && e.data.tracking) error.textContent += " · رقم الطرد: " + e.data.tracking + " — لا تنشئ طرداً آخر قبل المطابقة.";
            busy = false; submit.disabled = !!(e.data && (e.data.courierApplied ||
              ["parcel_created_action_save_failed", "action_pending_reconciliation"].includes(e.data.error)));
            submit.textContent = submit.disabled ? "يلزم مطابقة الطرد أولاً" : submitLabel;
            layer.querySelectorAll("[data-close]").forEach(function (b) { b.disabled = false; });
          }
        };
        setTimeout(function () { var first = form.querySelector("input,select,textarea,button"); if (first) first.focus(); }, 0);
      });
    }
    function field(label, name, value, options) {
      options = options || {};
      return '<div class="eco-field' + (options.wide ? " eco-wide" : "") + '"><label for="ecoField-' + name + '">' + esc(label) +
        '</label><input id="ecoField-' + name + '" name="' + name + '" type="' + (options.type || "text") + '" value="' + esc(value) +
        '" ' + (options.required ? "required " : "") + (options.type === "number" ? 'min="0" step="0.01" ' : "") +
        'maxlength="' + (name === "gps_link" ? "1500" : "255") + '"></div>';
    }
    function parcelForm(row, related) {
      var p = row.data.ecotrackPayload || {}, original = row.source || row.data;
      var client = p.nom_client || original.customer || "", phone = p.telephone || original.phone || "";
      var w = resolveCode(p.code_wilaya || row.wilaya), delivery = p.stop_desk == null ? row.data.deliveryType || "home" : p.stop_desk ? "office" : "home";
      var html = (state.reference && state.reference.locationsFallback ? '<div class="eco-banner eco-warning">قائمة المواقع من آخر نسخة متوفرة. راجع العنوان؛ يؤكد Assil الخدمة عند حفظ الطرد.</div>' : "") +
        '<div class="eco-form-grid">' + field("اسم العميل", "client", client, { required: true }) +
        field("الهاتف", "tel", phone, { required: true, type: "tel" }) +
        '<div class="eco-field"><label for="ecoField-wilaya">الولاية</label><select id="ecoField-wilaya" name="wilaya" required>' +
        '<option value=""' + (!w ? " selected" : "") + '>اختر الولاية</option>';
      if (state.reference) state.reference.wilayas.forEach(function (x) {
        html += '<option value="' + x.code + '"' + (x.code === w ? " selected" : "") + ">" + esc(x.arabic || x.name) + "</option>";
      });
      else html += '<option value="' + esc(w || "") + '">' + esc(wilayaName(row.wilaya)) + "</option>";
      html += '</select></div><div class="eco-field"><label for="ecoField-stop_desk">طريقة التسليم</label><select id="ecoField-stop_desk" name="stop_desk">' +
        '<option value="0"' + (delivery === "home" ? " selected" : "") + '>منزل</option><option value="1"' +
        (delivery === "office" ? " selected" : "") + '>Stop Desk</option></select></div>' +
        '<div class="eco-field"><label for="ecoField-commune">البلدية / مكتب الاستلام</label><select id="ecoField-commune" name="commune" required data-initial="' +
        esc(p.commune || original.commune || original.baladiya || "") + '"></select></div>' +
        field("عنوان العميل / المكتب", "adresse", p.adresse || original.address || "", { required: true }) +
        field("المبلغ المؤكد تحصيله من العميل (يشمل التوصيل)", "montant", related ? 0 : row.amount, { required: true, type: "number", wide: true }) +
        field("وصف المنتجات", "product", p.produit || (original.products || []).map(function (x) { return x.name + " x" + (x.quantity || 1); }).join(", "), { wide: true }) +
        field("الهاتف الثاني (اختياري)", "tel2", p.telephone_2 || "", { type: "tel" }) +
        '<div class="eco-field"><label for="ecoField-fragile">الطرد قابل للكسر</label><select id="ecoField-fragile" name="fragile"><option value="0">لا</option><option value="1"' +
        (p.fragile ? " selected" : "") + ">نعم</option></select></div>" + field("ملاحظة", "remarque", p.remarque || "", { wide: true });
      if (related) html += '<div class="eco-field"><label for="ecoField-type">العملية الجديدة</label><select id="ecoField-type" name="type">' +
        '<option value="2">تبادل / Échange</option><option value="3">Pickup</option></select></div>' +
        field("المنتج الذي سيُسترجع عند التبادل", "produit_a_recuperer", "", {});
      return html + '</div><p class="eco-help" data-quote>جارٍ قراءة التعرفة…</p><p class="eco-help">لا تغيّر مبلغ COD إلا بعد تأكيد العميل. ' +
        'تكلفة الناقل منفصلة عن مبلغ الطلب القديم؛ إنشاء الطرد ينتج مسودة ولا يرسله تلقائياً.</p>';
    }
    function bindParcelForm(form, related, parcelType) {
      var wilaya = form.elements.wilaya, stop = form.elements.stop_desk, commune = form.elements.commune;
      var address = form.elements.adresse, homeAddress = address.value, officeAddress = null, lastWilaya = wilaya.value;
      var savedAmount = form.elements.montant.value;
      function syncAddress() {
        var selected = commune.selectedOptions[0];
        if (stop.value === "1" && selected && selected.value) {
          if (officeAddress === null) homeAddress = address.value;
          officeAddress = selected.dataset.address || "مكتب الاستلام في " + selected.value;
          address.value = officeAddress;
        } else if (officeAddress !== null) { address.value = homeAddress; officeAddress = null; }
      }
      function fill() {
        var ref = state.reference, n = Number(wilaya.value), office = stop.value === "1";
        var previous = wilaya.value === lastWilaya ? commune.value || commune.dataset.initial || "" : "";
        lastWilaya = wilaya.value; delete commune.dataset.initial;
        var rows = ref ? ref.communes.filter(function (c) {
          return c.wilaya === n && (!office || c.stopDesk === true ||
            ref.desks.some(function (d) { return d.wilaya === n && key(d.commune) === key(c.name); }));
        }).map(function (c) {
          var desk = office && ref.desks.find(function (d) { return d.wilaya === n && key(d.commune) === key(c.name); });
          return { name: c.name, label: desk ? desk.name + " — " + c.name : c.name,
            address: desk && desk.address || "" };
        }) : [];
        if (office && ref) ref.desks.filter(function (d) { return d.wilaya === n; }).forEach(function (d) {
          if (!rows.some(function (r) { return key(r.name) === key(d.commune); }))
            rows.push({ name: d.commune, label: d.name + " — " + d.commune, address: d.address });
        });
        commune.innerHTML = '<option value="">اختر موقعاً متاحاً لدى Assil</option>';
        rows.forEach(function (r) {
          var option = document.createElement("option"); option.value = r.name; option.textContent = r.label; option.dataset.address = r.address || "";
          if (key(previous) === key(r.name)) option.selected = true; commune.appendChild(option);
        });
        if ((!ref || !ref.available.communes) && previous) {
          var legacy = document.createElement("option"); legacy.value = previous; legacy.textContent = previous; legacy.selected = true; commune.appendChild(legacy);
        }
        syncAddress(); quote();
      }
      function quote() {
        var value = rateFor(wilaya.value, stop.value === "1" ? "office" : "home", related ? Number(form.elements.type.value) : parcelType || 1);
        form.querySelector("[data-quote]").textContent = "تكلفة الناقل حسب تعرفة الحساب: " + money(value) +
          (value == null ? " — غير متاحة؛ لا تُعاملها كصفر." : " (تقدير إلى أن يؤكدها الناقل)");
      }
      wilaya.onchange = fill; stop.onchange = fill;
      commune.onchange = syncAddress;
      if (related) form.elements.type.onchange = function () {
        if (this.value === "3") { savedAmount = form.elements.montant.value; form.elements.montant.value = "0"; }
        else form.elements.montant.value = savedAmount;
        form.elements.produit_a_recuperer.parentElement.hidden = this.value === "3";
        quote();
      };
      fill();
    }
    function formFields(form) {
      var fields = {};
      ["client", "tel", "tel2", "wilaya", "stop_desk", "commune", "adresse", "montant", "product", "fragile", "remarque"].forEach(function (name) {
        var value = form.elements[name].value.trim();
        fields[name] = ["wilaya", "stop_desk", "montant", "fragile"].includes(name) ? Number(value) : value;
        if (["tel", "tel2"].includes(name)) {
          fields[name] = value.replace(/[٠-٩]/g, function (n) { return String(n.charCodeAt(0) - 1632); }).replace(/[\s().-]/g, "");
          fields[name] = fields[name].replace(/^(?:\+213|00213|213)([5-7][0-9]{8})$/, "0$1");
        }
      });
      return fields;
    }
    async function edit(row, related) {
      var promise = modal(related ? "إنشاء طرد تبادل / Pickup مرتبط" : "تعديل المسودة قبل الإرسال", parcelForm(row, related), async function (form) {
        var fields = formFields(form), body = { id: row.id, tracking: row.tracking, action: "update", fields: fields };
        if (related) {
          var type = Number(form.elements.type.value), storageKey = "robuste_eco_pending:" + row.id + ":" + type, actionId;
          try { actionId = sessionStorage.getItem(storageKey); } catch {}
          actionId = actionId || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : "rb_" + Date.now() + "_" + Math.random().toString(36).slice(2));
          try { sessionStorage.setItem(storageKey, actionId); } catch {}
          body = { id: row.id, action: "create-related", type: type, actionId: actionId,
            fields: { nom_client: fields.client, telephone: fields.tel, telephone_2: fields.tel2,
              code_wilaya: fields.wilaya, stop_desk: fields.stop_desk, commune: fields.commune,
              adresse: fields.adresse, montant: fields.montant, produit: fields.product,
              fragile: fields.fragile, remarque: fields.remarque,
              produit_a_recuperer: form.elements.produit_a_recuperer.value.trim() } };
        }
        var result = await request("POST", "/admin/ecotrack/parcel", body);
        if (related) { try { sessionStorage.removeItem(storageKey); } catch {} }
        else applyPatch(row, result.patch);
        state.message = related ? "أُنشئت المسودة " + result.tracking + "؛ يلزم تأكيد التسليم للناقل يدوياً." : "تم تحديث المسودة لدى Assil.";
        render(); return result;
      }, related ? "إنشاء المسودة" : "حفظ التعديل");
      bindParcelForm(document.querySelector(".eco-modal-layer form"), related, row.type);
      await promise;
    }
    async function confirmAction(row, actionName) {
      var descriptions = {
        delete: "سيُحذف الطرد من Assil فقط إذا ظل مسودة غير مُرسلة. يبقى الطلب الأصلي في متجرك. لا تستخدم هذا لإلغاء طرد خرج للتوصيل.",
        dispatch: "أؤكد أن الطرد جاهز وسُلّم فعلياً للناقل. لا يمكن تعديل أو حذف الطرد عبر هذا التدفق بعد تأكيد الإرسال.",
        "request-return": "سيُرسل طلب إرجاع فقط. يمكن للناقل تجاهله؛ لا تتغير حالة الطرد إلى مرتجع بمجرد الطلب.",
        "receive-return": "أؤكد أنني استلمت الطرد المرتجع فعلياً. لا تستخدم هذا لمجرد رؤية حالة «إرجاع»."
      };
      var labels = { delete: "حذف المسودة", dispatch: "تأكيد التسليم للناقل", "request-return": "طلب إرجاع", "receive-return": "تأكيد استلام المرتجع" };
      await modal(labels[actionName], '<div class="eco-banner">' + esc(descriptions[actionName]) +
        '</div><label class="eco-check"><input type="checkbox" name="confirm" required><span>قرأت التنبيه وأؤكد الإجراء للشحنة ' +
        esc(row.tracking) + "</span></label>", async function (form) {
        var body = { id: row.id, tracking: row.tracking, action: actionName, confirm: form.elements.confirm.checked };
        if (actionName === "receive-return") body.confirmPhysicalReceipt = true;
        var result = await request("POST", "/admin/ecotrack/parcel", body);
        applyPatch(row, result.patch);
        state.message = result.message || "تم تنفيذ الإجراء. تحديث الحالة النهائية يتبع بيانات الناقل."; render(); return result;
      }, labels[actionName]);
    }
    async function history(row) {
      var result = await request("GET", "/admin/ecotrack/history?id=" + encodeURIComponent(row.id) + "&tracking=" + encodeURIComponent(row.tracking));
      applyPatch(row, result.parcelPatch);
      var node = result.history || {}, events = node.activity || node.events || [], notes = Array.isArray(result.notes) ? result.notes : [];
      if (!Array.isArray(events)) events = [];
      var html = "";
      if (result.errors.length) html += '<div class="eco-banner eco-warning">بعض البيانات غير متاحة: ' + esc(result.errors.join(", ")) + "</div>";
      html += '<h3>سجل العمليات</h3><ul class="eco-history-list">';
      events.slice().reverse().forEach(function (a) { html += "<li><time>" + esc([a.date || a.created_at, a.time].filter(Boolean).join(" ")) +
        "</time>" + esc(eventLabels[String(a.status || a.activity || a.event || "").toLowerCase()] ||
          a.status || a.activity || a.event || "—") + (a.scanLocation ? " · " + esc(a.scanLocation) : "") + "</li>"; });
      if (!events.length) html += "<li>لا يوجد سجل عمليات متاح.</li>";
      html += '</ul><h3>ملاحظات الناقل والمرسل</h3><ul class="eco-history-list">';
      notes.forEach(function (n) { html += "<li><time>" + esc(n.created_at || n.date || "") + "</time>" + esc(n.remarque || n.content || "") + "</li>"; });
      html += '</ul><div class="eco-field eco-wide" style="margin-top:20px"><label for="ecoNote">إرسال ملاحظة للناقل</label>' +
        '<textarea id="ecoNote" name="content" maxlength="255" required rows="3"></textarea></div><p class="eco-help">الملاحظة لا تغيّر عنوان طرد مُرسل؛ يقرر الناقل التصرف بناءً عليها.</p>';
      await modal("سجل الشحنة " + row.tracking, html, function (form) {
        return request("POST", "/admin/ecotrack/parcel", { id: row.id, tracking: row.tracking, action: "note", content: form.elements.content.value.trim() });
      }, "إرسال الملاحظة");
    }
    async function action(row, actionName) {
      state.error = "";
      try {
        if (actionName === "copy") {
          await navigator.clipboard.writeText(row.tracking); state.message = "نُسخ رقم التتبع " + row.tracking; render();
        }
        else if (actionName === "order" && config.openOrder) config.openOrder(row.id);
        else if (actionName === "sync") {
          if (state.busy) return;
          state.busy = true; render();
          try { var updated = await syncIds([row.id], false); state.message = updated.missing ? "بعض الحالات غير متاحة لدى Assil." : "تم تحديث حالات هذا الطلب."; }
          finally { state.busy = false; render(); }
        }
        else if (actionName === "label") await config.printLabel(row.tracking);
        else if (actionName === "update" || actionName === "related") await edit(row, actionName === "related");
        else if (actionName === "history") await history(row);
        else await confirmAction(row, actionName);
      } catch (e) { if (e.message !== "cancelled_by_admin") { state.error = e.message; render(); } }
    }
    function exportCsv() {
      var columns = ["tracking", "type", "wilaya", "cod_amount", "carrier_status", "payment_status",
        "service_fee_reported", "service_fee_estimate", "return_fee_reported", "return_fee_estimate", "last_synced_at"];
      var rows = allRows().map(function (r) { var p = r.data; return [r.tracking, typeLabels[r.type], wilayaName(r.wilaya),
        r.type === 3 ? null : r.amount, p.ecotrackRawStatus || p.ecotrackStage, p.ecotrackPaymentState || "unknown",
        p.ecotrackActualServiceFee, p.ecotrackServiceFeeEstimate, p.ecotrackActualReturnFee, p.ecotrackReturnFeeEstimate, p.ecotrackLastSyncedAt]; });
      var csv = [columns].concat(rows).map(function (r) { return r.map(csvCell).join(","); }).join("\r\n");
      var url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
      var a = document.createElement("a"); a.href = url; a.download = "robuste-assil-report-" + new Date().toISOString().slice(0, 10) + ".csv";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }
    async function resolveShipping(id, overrides) {
      var record = config.getOrders().find(function (r) { return r.id === id; });
      if (!record) throw new Error("order_not_found");
      if (!state.reference) await refreshReference(false);
      // Preserve working legacy submission when live reference data is unavailable.
      if (!state.reference || !state.reference.available.wilayas) return overrides;
      var row = { id: id, data: Object.assign({}, record.data, { ecotrackPayload: Object.assign({}, record.data.ecotrackPayload || {}, {
        stop_desk: overrides.stop_desk, commune: overrides.commune || record.data.commune || record.data.baladiya
      }) }), source: record.data, wilaya: record.data.wilaya, amount: number(record.data.totalPrice) };
      var promise = modal("راجع بيانات الطرد قبل إنشاء المسودة", parcelForm(row, false), function (form) {
        var f = formFields(form);
        return { type: 1, nom_client: f.client, telephone: f.tel, telephone_2: f.tel2,
          code_wilaya: f.wilaya, stop_desk: f.stop_desk, commune: f.commune, adresse: f.adresse,
          montant: f.montant, produit: f.product, fragile: f.fragile, remarque: f.remarque };
      }, "استخدام هذه البيانات");
      bindParcelForm(document.querySelector(".eco-modal-layer form"), false);
      return promise;
    }
    function start() {
      if (state.started) return;
      state.started = true; refreshReference(false); refreshHealth();
      state.timer = setInterval(syncNext, 120000); state.healthTimer = setInterval(refreshHealth, 120000);
    }
    function stop() {
      clearInterval(state.timer); clearInterval(state.healthTimer); state.started = false;
    }
    return { start: start, stop: stop, render: render, ready: isReady, rateFor: rateFor,
      resolveShipping: resolveShipping, refreshReference: refreshReference, state: state,
      focusOrder: function (id) { state.tab = "parcels"; state.search = id; state.filter = "all"; state.period = "all"; state.limit = 50; render(); } };
  }
  window.RBEcoAdmin = { create: create, flatten: flatten, statistics: statistics, csvCell: csvCell };
})();
