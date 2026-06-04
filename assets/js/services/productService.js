/**
 * Product Service - Centralized product data layer.
 * 
 * Single source of truth for all product data.
 * Implements caching to prevent duplicate network requests.
 * 
 * TODO Future: Support multiple data sources:
 *   - Current: products.json (static file)
 *   - Future: Firestore collection
 *   - Future: REST API endpoint
 *   - Future: CMS headless API
 *   - Future: Admin dashboard API
 * 
 * TODO Future: Add inventory fields:
 *   - stock: number (current stock quantity)
 *   - status: 'inStock' | 'outOfStock' | 'comingSoon' | 'hidden'
 *   - lowStockThreshold: number (for low stock alerts)
 *   - sku: string
 */

var ProductService = {
  _cache: null,
  _cacheTime: 0,
  _cacheTTL: STORE_CONFIG ? STORE_CONFIG.products.cacheTTL : 300000,
  _loadPromise: null,
  _source: STORE_CONFIG ? STORE_CONFIG.products.source : 'products.json',

  /**
   * Load all products with caching.
   * Returns a promise that resolves to the products array.
   */
  loadProducts: function () {
    if (this._cache && (Date.now() - this._cacheTime) < this._cacheTTL) {
      return Promise.resolve(this._cache);
    }
    if (this._loadPromise) {
      return this._loadPromise;
    }
    this._loadPromise = fetch(this._source)
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Failed to load products');
        }
        return response.json();
      })
      .then(function (products) {
        this._cache = products;
        this._cacheTime = Date.now();
        this._loadPromise = null;
        return products;
      }.bind(this))
      .catch(function (error) {
        this._loadPromise = null;
        console.error('ProductService error:', error);
        throw error;
      }.bind(this));
    return this._loadPromise;
  },

  /**
   * Get product by ID.
   */
  getProductById: function (id) {
    return this.loadProducts().then(function (products) {
      return products.find(function (p) {
        return p.id == id;
      }) || null;
    });
  },

  /**
   * Get products by category.
   */
  getProductsByCategory: function (category) {
    return this.loadProducts().then(function (products) {
      if (!category || category === 'all') {
        return products;
      }
      return products.filter(function (p) {
        return p.category === category;
      });
    });
  },

  /**
   * Get products with discounts (special offers).
   */
  getSpecialOffers: function (limit) {
    return this.loadProducts().then(function (products) {
      var offers = products.filter(function (p) {
        return p.old_price && p.old_price > p.price;
      });
      if (limit) {
        offers = offers.slice(0, limit);
      }
      return offers;
    });
  },

  /**
   * Get related products (exclude current product).
   */
  getRelatedProducts: function (currentId, limit) {
    return this.loadProducts().then(function (products) {
      var related = products.filter(function (p) {
        return p.id != currentId;
      });
      if (limit) {
        related = related.slice(0, limit);
      }
      return related;
    });
  },

  /**
   * Get all categories.
   */
  getCategories: function () {
    return this.loadProducts().then(function (products) {
      var cats = {};
      products.forEach(function (p) {
        if (p.category) {
          cats[p.category] = true;
        }
      });
      return Object.keys(cats);
    });
  },

  /**
   * Invalidate cache (useful for future admin dashboard).
   */
  invalidateCache: function () {
    this._cache = null;
    this._cacheTime = 0;
  },

  /**
   * Change data source (for future multi-store support).
   */
  setSource: function (source) {
    this._source = source;
    this.invalidateCache();
  }
};
