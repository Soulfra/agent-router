/**
 * Analytics Tracking Wrapper
 *
 * Centralizes tracking for:
 * - Google Analytics 4 (GA4)
 * - Facebook Pixel
 * - Google Ads Conversions
 *
 * Usage:
 *   Analytics.init('GA4_MEASUREMENT_ID', 'FB_PIXEL_ID');
 *   Analytics.track('event_name', { param: 'value' });
 *   Analytics.trackConversion('purchase', { value: 4.99, currency: 'USD' });
 */

const Analytics = {
  ga4Id: null,
  fbPixelId: null,
  initialized: false,

  /**
   * Initialize analytics tracking
   *
   * @param {string} ga4MeasurementId - Google Analytics 4 Measurement ID (G-XXXXXXXXXX)
   * @param {string} fbPixelId - Facebook Pixel ID (optional)
   */
  init(ga4MeasurementId, fbPixelId = null) {
    this.ga4Id = ga4MeasurementId;
    this.fbPixelId = fbPixelId;

    // Load Google Analytics 4
    if (ga4MeasurementId) {
      this.loadGA4(ga4MeasurementId);
    }

    // Load Facebook Pixel
    if (fbPixelId) {
      this.loadFacebookPixel(fbPixelId);
    }

    this.initialized = true;
    console.log('✓ Analytics initialized', { ga4: !!ga4MeasurementId, fb: !!fbPixelId });
  },

  /**
   * Load Google Analytics 4
   */
  loadGA4(measurementId) {
    // Load gtag.js script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', measurementId, {
      send_page_view: true,
      cookie_flags: 'SameSite=None;Secure'
    });

    console.log('✓ Google Analytics loaded:', measurementId);
  },

  /**
   * Load Facebook Pixel
   */
  loadFacebookPixel(pixelId) {
    !function(f,b,e,v,n,t,s) {
      if(f.fbq)return;
      n=f.fbq=function(){
        n.callMethod ? n.callMethod.apply(n,arguments) : n.queue.push(arguments)
      };
      if(!f._fbq)f._fbq=n;
      n.push=n;
      n.loaded=!0;
      n.version='2.0';
      n.queue=[];
      t=b.createElement(e);
      t.async=!0;
      t.src=v;
      s=b.getElementsByTagName(e)[0];
      s.parentNode.insertBefore(t,s);
    }(window, document,'script','https://connect.facebook.net/en_US/fbevents.js');

    fbq('init', pixelId);
    fbq('track', 'PageView');

    console.log('✓ Facebook Pixel loaded:', pixelId);
  },

  /**
   * Track custom event
   *
   * @param {string} eventName - Event name (e.g., 'recipe_swipe', 'survey_start')
   * @param {object} params - Event parameters
   */
  track(eventName, params = {}) {
    if (!this.initialized) {
      console.warn('Analytics not initialized. Call Analytics.init() first.');
      return;
    }

    // Google Analytics 4
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, params);
    }

    // Facebook Pixel
    if (typeof fbq !== 'undefined') {
      fbq('trackCustom', eventName, params);
    }

    console.log('📊 Event tracked:', eventName, params);
  },

  /**
   * Track conversion event
   *
   * @param {string} conversionType - Type: 'purchase', 'signup', 'upgrade'
   * @param {object} data - Conversion data (value, currency, etc.)
   */
  trackConversion(conversionType, data = {}) {
    const eventMap = {
      purchase: 'purchase',
      signup: 'sign_up',
      upgrade: 'begin_checkout'
    };

    const eventName = eventMap[conversionType] || conversionType;

    // Google Analytics conversion
    if (typeof gtag !== 'undefined') {
      gtag('event', eventName, {
        currency: data.currency || 'USD',
        value: data.value || 0,
        transaction_id: data.transactionId,
        items: data.items || []
      });
    }

    // Facebook Pixel conversion
    if (typeof fbq !== 'undefined') {
      const fbEventMap = {
        purchase: 'Purchase',
        signup: 'CompleteRegistration',
        upgrade: 'InitiateCheckout'
      };

      const fbEvent = fbEventMap[conversionType] || 'CustomConversion';

      fbq('track', fbEvent, {
        currency: data.currency || 'USD',
        value: data.value || 0
      });
    }

    console.log('💰 Conversion tracked:', conversionType, data);
  },

  /**
   * Track page view (useful for SPAs)
   *
   * @param {string} pagePath - Page path (e.g., '/cooking', '/brand-builder')
   * @param {string} pageTitle - Page title
   */
  trackPageView(pagePath, pageTitle) {
    if (typeof gtag !== 'undefined') {
      gtag('event', 'page_view', {
        page_path: pagePath,
        page_title: pageTitle
      });
    }

    if (typeof fbq !== 'undefined') {
      fbq('track', 'PageView');
    }

    console.log('📄 Page view tracked:', pagePath);
  },

  /**
   * Track user interaction
   *
   * @param {string} action - Action type (e.g., 'click', 'swipe', 'submit')
   * @param {string} category - Category (e.g., 'button', 'card', 'form')
   * @param {string} label - Label (e.g., 'upgrade_cta', 'recipe_card')
   */
  trackInteraction(action, category, label) {
    this.track('interaction', {
      action,
      category,
      label
    });
  },

  /**
   * Set user properties (for segmentation)
   *
   * @param {object} properties - User properties (e.g., { tier: 'premium', cohort: 'beta' })
   */
  setUserProperties(properties) {
    if (typeof gtag !== 'undefined') {
      gtag('set', 'user_properties', properties);
    }

    console.log('👤 User properties set:', properties);
  },

  /**
   * Track form submission
   *
   * @param {string} formName - Form name (e.g., 'email_capture', 'survey_question')
   * @param {object} data - Form data
   */
  trackFormSubmit(formName, data = {}) {
    this.track('form_submit', {
      form_name: formName,
      ...data
    });
  },

  /**
   * Track payment event
   *
   * @param {string} step - Payment step: 'initiated', 'method_selected', 'completed', 'failed'
   * @param {object} data - Payment data
   */
  trackPayment(step, data = {}) {
    this.track(`payment_${step}`, {
      value: data.amount || 0,
      currency: data.currency || 'USD',
      payment_method: data.method || 'unknown',
      ...data
    });
  },

  /**
   * Track funnel step
   *
   * @param {string} funnelName - Funnel name (e.g., 'recipe_app_signup')
   * @param {number} step - Step number (1-based)
   * @param {string} stepName - Step name (e.g., 'landing', 'trial', 'payment')
   */
  trackFunnelStep(funnelName, step, stepName) {
    this.track('funnel_step', {
      funnel_name: funnelName,
      funnel_step: step,
      step_name: stepName
    });
  }
};

// Auto-detect environment and use test IDs for localhost
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  console.log('🧪 Development mode - using test analytics IDs');
  // In production, these will be real IDs
  Analytics.init('G-XXXXXXXXXX', null); // Replace with real IDs later
} else {
  // Production IDs - set these when deploying
  Analytics.init('G-XXXXXXXXXX', 'YOUR_FB_PIXEL_ID');
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Analytics;
}
