// https://github.com/Stanko/mobile-chrome-vh-fix
// Copyright (c) 2017 Stanko
// Licence: MIT (https://github.com/Stanko/mobile-chrome-vh-fix/blob/master/LICENSE)
var VHChromeFix = function(selectors) {
  var self = this;
  var userAgent = navigator.userAgent.toLowerCase();
  var isAndroidChrome = /chrome/.test(userAgent) && /android/.test(userAgent);
  var isIOSChrome = /crios/.test(userAgent);

  if (isAndroidChrome || isIOSChrome) {
    // If we detected Chrome on Android or iOS
    // Cache elements and trigger fix on init
    this.getElements(selectors);
    this.fixAll();

    // Cache window dimensions
    this.windowWidth = window.innerWidth;
    this.windowHeight = window.innerHeight;

    window.addEventListener('resize', function() {
      // Both width and height changed (orientation change)
      // This is a hack, as Android when eyboard pops up
      // Triggers orientation change
      if (self.windowWidth !== window.innerWidth && self.windowHeight !== window.innerHeight) {
        self.windowWidth = window.innerWidth;
        self.windowHeight = window.innerHeight;
        self.fixAll();
      }
    });
  }
};

VHChromeFix.prototype.getElements = function(selectors) {
  this.elements = [];
  // Convert selectors to array if they are not
  selectors = this.isArray(selectors) ? selectors : [selectors];

  for (var i = 0; i < selectors.length; i++) {
    // Get all elements for selector
    var selector = selectors[i].selector;
    var elements = document.querySelectorAll(selector);

    // Go through all elements for one selector to filter them
    for (var j = 0; j < elements.length; j++) {
      this.elements.push({
        domElement: elements[j],
        vh: selectors[i].vh
      });
    }
  }
};

VHChromeFix.prototype.isArray = function(array) {
  return Object.prototype.toString.call(array) === '[object Array]';
};

VHChromeFix.prototype.fixAll = function() {
  for (var i = 0; i < this.elements.length; i++) {
    var element = this.elements[i];
    element.domElement.style.height = (window.innerHeight * element.vh / 100) + 'px';
  }
};
