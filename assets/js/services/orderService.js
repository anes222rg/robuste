/**
 * Order Service - Handles order submission to Firebase and EmailJS.
 * 
 * Centralizes all order-related business logic.
 * Provides fallback handling when Firebase/EmailJS unavailable.
 * 
 * TODO Future: Add order status tracking and admin order management.
 * TODO Future: Add order confirmation page/email to customer.
 * TODO Future: Support multiple payment gateways.
 * TODO Future: Add order history for logged-in users.
 */

var OrderService = {
  _processing: false,

  /**
   * Submit an order.
   * @param {Object} orderData - The order data object
   * @param {Array} cartItems - The cart items array
   * @returns {Promise} Resolves with order result
   */
  submitOrder: function (orderData, cartItems) {
    if (this._processing) {
      return Promise.reject(new Error('Order already in progress'));
    }
    this._processing = true;

    var db = getFirestoreDB();
    var hasFirebase = db !== null;
    var hasEmailJS = isEmailJSReady();

    var orderPayload = {
      products: cartItems || [],
      customer: orderData.fullName,
      phone: orderData.phone,
      email: orderData.email || 'لم يتم تقديمه',
      wilaya: orderData.wilaya,
      address: orderData.address || 'غير محدد',
      payment: orderData.paymentMethod || 'الدفع عند الاستلام',
      totalPrice: orderData.totalPrice,
      timestamp: new Date().toISOString(),
      status: 'جديد'
    };

    var orderId = 'ORD-' + Date.now();

    var firestorePromise;
    if (hasFirebase) {
      firestorePromise = db.collection('orders').add(orderPayload)
        .then(function (docRef) {
          orderId = docRef.id;
          return docRef;
        });
    } else {
      firestorePromise = Promise.resolve({ id: orderId });
    }

    return firestorePromise
      .then(function (docRef) {
        if (hasEmailJS) {
          return this._sendEmailNotification(orderId, orderData, cartItems);
        }
        return Promise.resolve();
      }.bind(this))
      .then(function () {
        this._processing = false;
        return {
          orderId: orderId,
          success: true
        };
      }.bind(this))
      .catch(function (error) {
        this._processing = false;
        console.error('Order submission error:', error);
        throw error;
      }.bind(this));
  },

  /**
   * Send email notification via EmailJS.
   */
  _sendEmailNotification: function (orderId, orderData, cartItems) {
    var productsList = '';
    if (cartItems && cartItems.length) {
      cartItems.forEach(function (item) {
        productsList += '<div style="margin-bottom:10px;padding:8px;border-bottom:1px solid #eee;">' +
          '<strong>المنتج:</strong> ' + item.name + ' <br>' +
          '<strong>الكمية:</strong> ' + item.quantity + ' <br>' +
          '<strong>السعر:</strong> ' + item.price.toLocaleString() + ' د.ج <br>' +
          '<strong>المجموع:</strong> ' + (item.price * item.quantity).toLocaleString() + ' د.ج' +
          '</div>';
      });
    } else {
      productsList = (orderData.productName || '') + ' x' + (orderData.quantity || 1);
    }

    return emailjs.send(
      EMAILJS_CONFIG.serviceId,
      EMAILJS_CONFIG.orderTemplateId,
      {
        order_id: orderId,
        customer_name: orderData.fullName,
        customer_phone: orderData.phone,
        customer_email: orderData.email || 'لم يتم تقديمه',
        wilaya: orderData.wilaya,
        address: orderData.address || 'غير محدد',
        total_price: orderData.totalPrice.toLocaleString(),
        payment_method: orderData.paymentMethod || 'الدفع عند الاستلام',
        order_date: new Date().toLocaleString('ar-DZ'),
        products: productsList
      }
    );
  },

  /**
   * Submit express order (single product from product page).
   */
  submitExpressOrder: function (product, quantity, customerData) {
    var cartItems = [{
      id: product.id,
      name: product.title,
      price: product.price,
      quantity: quantity || 1,
      image: product.images[0]
    }];
    var total = product.price * (quantity || 1);

    return this.submitOrder({
      fullName: customerData.name,
      phone: customerData.phone,
      wilaya: customerData.wilaya,
      address: '',
      email: '',
      paymentMethod: 'الدفع عند الاستلام',
      totalPrice: total,
      productName: product.title,
      quantity: quantity || 1
    }, cartItems);
  },

  isProcessing: function () {
    return this._processing;
  }
};
