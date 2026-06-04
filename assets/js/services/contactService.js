/**
 * Contact Service - Handles contact form submissions via EmailJS.
 * 
 * TODO Future: Store contact messages in Firestore for admin dashboard.
 * TODO Future: Add auto-reply to customer email.
 */

var ContactService = {
  _processing: false,

  sendMessage: function (data) {
    if (this._processing) {
      return Promise.reject(new Error('Already processing'));
    }
    this._processing = true;

    if (!isEmailJSReady()) {
      this._processing = false;
      return Promise.reject(new Error('EmailJS not available'));
    }

    return emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.contactTemplateId,
      {
        from_name: data.name,
        from_email: data.email,
        phone_number: data.phone || 'لم يتم تقديمه',
        message: data.message
      }
    ).then(function (result) {
      this._processing = false;
      return result;
    }.bind(this)).catch(function (error) {
      this._processing = false;
      throw error;
    }.bind(this));
  },

  isProcessing: function () {
    return this._processing;
  }
};
