/**
 * Slideshow Component - Top hero slideshow.
 * 
 * Manages the hero image slideshow with auto-advance and navigation.
 * 
 * TODO Future: Support multiple slideshow templates.
 * TODO Future: Add swipe gesture support for mobile.
 */

var Slideshow = {
  _slideIndex: 1,
  _interval: null,
  _initialized: false,

  init: function () {
    if (this._initialized) return;
    var slides = document.getElementsByClassName('mySlides1');
    if (!slides || slides.length === 0) return;

    this._slideIndex = 1;
    this._show();
    this._startTimer();
    this._ensureDots(slides);
    this._initialized = true;
  },

  _show: function () {
    var slides = document.getElementsByClassName('mySlides1');
    var dots = document.getElementsByClassName('dot1');
    if (!slides || slides.length === 0) return;

    var n = this._slideIndex;
    if (n > slides.length) this._slideIndex = 1;
    if (n < 1) this._slideIndex = slides.length;
    n = this._slideIndex;

    for (var i = 0; i < slides.length; i++) {
      slides[i].style.display = 'none';
      slides[i].classList.remove('active-slide');
    }
    for (var j = 0; j < dots.length; j++) {
      dots[j].className = dots[j].className.replace(' active1', '');
      dots[j].classList.remove('active');
    }

    if (slides[n - 1]) {
      slides[n - 1].style.display = 'block';
      slides[n - 1].classList.add('active-slide');
    }
    if (dots[n - 1]) {
      dots[n - 1].className += ' active1';
      dots[n - 1].classList.add('active');
    }
  },

  _startTimer: function () {
    this._stopTimer();
    this._interval = setInterval(function () {
      this._slideIndex++;
      this._show();
    }.bind(this), 4000);
  },

  _stopTimer: function () {
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = null;
    }
  },

  _resetTimer: function () {
    this._startTimer();
  },

  _ensureDots: function (slides) {
    var dotsContainer = slides[0] && slides[0].parentElement
      ? slides[0].parentElement.nextElementSibling
      : null;
    if (!dotsContainer || dotsContainer.tagName !== 'DIV') return;
    var dots = document.getElementsByClassName('dot1');
    if (dots.length < slides.length) {
      for (var i = dots.length; i < slides.length; i++) {
        var newDot = document.createElement('span');
        newDot.className = 'dot1';
        newDot.setAttribute('onclick', 'Slideshow.goTo(' + (i + 1) + ')');
        newDot.setAttribute('role', 'button');
        newDot.setAttribute('tabindex', '0');
        newDot.setAttribute('aria-label', 'صورة ' + (i + 1));
        dotsContainer.appendChild(newDot);
      }
    }
  },

  next: function () {
    this._slideIndex++;
    this._show();
    this._resetTimer();
  },

  prev: function () {
    this._slideIndex--;
    this._show();
    this._resetTimer();
  },

  goTo: function (n) {
    this._slideIndex = n;
    this._show();
    this._resetTimer();
  },

  destroy: function () {
    this._stopTimer();
    this._initialized = false;
  }
};

/* Expose for inline onclick handlers */
window.plusSlides1 = function (n) {
  Slideshow.next();
};
window.currentSlide1 = function (n) {
  Slideshow.goTo(n);
};
