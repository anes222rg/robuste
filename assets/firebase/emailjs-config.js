/**
 * EmailJS configuration.
 * Initializes EmailJS with the public key for client-side use.
 * 
 * Security note: Public key is exposed client-side by design.
 * EmailJS uses the public key for client-side SDK initialization.
 * Rate limiting should be configured in EmailJS dashboard.
 * 
 * TODO Future: Move EmailJS calls to a backend proxy for production.
 */
const EMAILJS_CONFIG = {
  publicKey: 'k77vdaUWPpnLrfTnS',
  serviceId: 'service_lc1q5k8',
  orderTemplateId: 'template_a15g7yg',
  contactTemplateId: 'template_11pkq0k'
};

let emailjsInitialized = false;

function initEmailJS() {
  if (typeof emailjs === 'undefined') {
    console.warn('EmailJS SDK not loaded');
    return false;
  }
  try {
    emailjs.init(EMAILJS_CONFIG.publicKey);
    emailjsInitialized = true;
    return true;
  } catch (e) {
    console.error('EmailJS init error:', e);
    return false;
  }
}

function isEmailJSReady() {
  return emailjsInitialized && typeof emailjs !== 'undefined';
}
