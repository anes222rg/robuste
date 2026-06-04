/**
 * Validation utilities.
 */

var Validators = {
  phone: function (value) {
    return /^0[5-7][0-9]{8}$/.test(value);
  },

  email: function (value) {
    if (!value) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  },

  required: function (value) {
    return typeof value === 'string' && value.trim().length > 0;
  },

  wilaya: function (value) {
    return value && value !== '';
  },

  validateOrderForm: function (fields) {
    var errors = [];
    if (!this.required(fields.fullName)) {
      errors.push('الاسم مطلوب');
    }
    if (!this.required(fields.phone)) {
      errors.push('رقم الهاتف مطلوب');
    } else if (!this.phone(fields.phone)) {
      errors.push('رقم الهاتف غير صحيح');
    }
    if (!this.wilaya(fields.wilaya)) {
      errors.push('الولاية مطلوبة');
    }
    return errors;
  }
};
