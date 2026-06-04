/**
 * Algerian wilayas list.
 * Single source of truth for all pages.
 * TODO Future: Load from API for admin dashboard.
 */
var WILAYAS = [
  'أدرار', 'الشلف', 'الأغواط', 'أم البواقي', 'باتنة', 'بجاية', 'بسكرة', 'بشار', 'البليدة',
  'البويرة', 'تمنراست', 'تبسة', 'تلمسان', 'تيارت', 'تيزي وزو', 'الجزائر', 'الجلفة', 'جيجل',
  'سطيف', 'سعيدة', 'سكيكدة', 'سيدي بلعباس', 'عنابة', 'قالمة', 'قسنطينة', 'المدية', 'مستغانم',
  'المسيلة', 'معسكر', 'ورقلة', 'وهران', 'البيض', 'إليزي', 'برج بوعريريج', 'بومرداس', 'الطارف',
  'تيندوف', 'تيسمسيلت', 'الوادي', 'خنشلة', 'سوق أهراس', 'تيبازة', 'ميلة', 'عين الدفلى', 'النعامة',
  'عين تموشنت', 'غرداية', 'غليزان'
];

function populateWilayaSelect(selectId) {
  var select = safeGetElement(selectId);
  if (!select) return;
  select.innerHTML = '<option value="">اختر الولاية</option>';
  WILAYAS.forEach(function (w) {
    var opt = document.createElement('option');
    opt.value = w;
    opt.textContent = w;
    select.appendChild(opt);
  });
}
