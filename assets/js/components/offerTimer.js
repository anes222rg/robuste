/**
 * Offer Timer Component - Countdown timer for special offers.
 * 
 * Displays a countdown timer for limited-time offers.
 * 
 * TODO Future: Accept custom end date from config/API.
 * TODO Future: Add offer expiry callback.
 */

var OfferTimer = {
  _interval: null,
  _initialized: false,

  init: function (endDate) {
    if (this._initialized) return;

    var daysEl = safeGetElement('days');
    var hoursEl = safeGetElement('hours');
    var minutesEl = safeGetElement('minutes');
    var secondsEl = safeGetElement('seconds');

    if (!daysEl || !hoursEl || !minutesEl || !secondsEl) return;

    var end = endDate || this._defaultEndDate();

    function update() {
      var now = new Date();
      var diff = end.getTime() - now.getTime();

      if (diff <= 0) {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minutesEl.textContent = '00';
        secondsEl.textContent = '00';
        return;
      }

      var days = Math.floor(diff / (1000 * 60 * 60 * 24));
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      var seconds = Math.floor((diff % (1000 * 60)) / 1000);

      daysEl.textContent = days < 10 ? '0' + days : '' + days;
      hoursEl.textContent = hours < 10 ? '0' + hours : '' + hours;
      minutesEl.textContent = minutes < 10 ? '0' + minutes : '' + minutes;
      secondsEl.textContent = seconds < 10 ? '0' + seconds : '' + seconds;
    }

    update();
    this._interval = setInterval(update, 1000);
    this._initialized = true;
  },

  _defaultEndDate: function () {
    var d = new Date();
    d.setDate(d.getDate() + 3);
    return d;
  },

  destroy: function () {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
    this._initialized = false;
  }
};
