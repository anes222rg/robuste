/**
 * Safe DOM access utilities.
 * Prevents crashes from missing elements.
 */

function safeGetElement(id) {
  try {
    return document.getElementById(id);
  } catch (e) {
    return null;
  }
}

function safeQuerySelector(selector) {
  try {
    return document.querySelector(selector);
  } catch (e) {
    return null;
  }
}

function safeQuerySelectorAll(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (e) {
    return [];
  }
}

function safeAddEventListener(el, event, handler, options) {
  if (el && typeof el.addEventListener === 'function') {
    el.addEventListener(event, handler, options);
  }
}

function safeInnerHTML(el, html) {
  if (el) {
    el.innerHTML = html;
  }
}

function safeSetText(el, text) {
  if (el) {
    el.textContent = text;
  }
}

function safeSetSrc(el, src) {
  if (el) {
    el.src = src;
  }
}

function safeSetAttribute(el, attr, value) {
  if (el) {
    el.setAttribute(attr, value);
  }
}

function safeRemove(el) {
  if (el && el.parentNode) {
    el.parentNode.removeChild(el);
  }
}

function safeHide(el) {
  if (el) {
    el.style.display = 'none';
  }
}

function safeShow(el, displayType) {
  if (el) {
    el.style.display = displayType || 'block';
  }
}

function preventDoubleClick(el, cooldown) {
  if (!el) return;
  el.disabled = true;
  setTimeout(function () {
    el.disabled = false;
  }, cooldown || 1000);
}

function debounce(fn, delay) {
  var timer = null;
  return function () {
    var context = this;
    var args = arguments;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function () {
      fn.apply(context, args);
    }, delay);
  };
}

function throttle(fn, limit) {
  var inThrottle = false;
  return function () {
    var context = this;
    var args = arguments;
    if (!inThrottle) {
      fn.apply(context, args);
      inThrottle = true;
      setTimeout(function () {
        inThrottle = false;
      }, limit);
    }
  };
}
