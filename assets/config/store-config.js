const STORE_CONFIG = {
  brand: {
    name: 'ROBUSTE eulma',
    shortName: 'ROBUSTE',
    tagline: 'أجهزة منزلية تجعل حياتك أسهل',
    description: 'متجر متخصص في الأجهزة المنزلية عالية الجودة بأسعار تنافسية في الجزائر مع ضمان سنتين وتوصيل سريع',
    logo: 'https://i.postimg.cc/7P7BK44r/f525e1dd-9f2c-4160-aed1-882a8b28b75c-20250703-131500-0000.png',
    favicon: 'images/favicon.ico',
    themeColor: '#ff6600'
  },
  contact: {
    phone: '0656360457',
    whatsapp: 'https://wa.me/213656360457',
    email: 'laidaouih@gmail.com',
    address: 'Rue Bourquaa El Manouar, 426 Parcelle, El Eulma, Sétif, Algérie',
    workingHours: 'يومياً من 07:00 إلى 16:00',
    facebook: 'https://www.facebook.com/share/19QooaXfy8/',
    maps: 'https://maps.app.goo.gl/Cpk1L8fAadgE9pB76'
  },
  theme: {
    primary: '#FF6B35',
    primaryDark: '#E05A2B',
    secondary: '#FFF8F0',
    light: '#FFFFFF',
    dark: '#333333',
    gray: '#6C757D',
    success: '#28a745',
    danger: '#dc3545',
    darkMode: {
      primary: '#FF8C42',
      primaryDark: '#FF6B35',
      secondary: '#121212',
      light: '#1e1e1e',
      dark: '#f5f5f5',
      gray: '#a0a0a0',
      success: '#4CAF50',
      danger: '#f44336'
    }
  },
  currency: {
    code: 'DZD',
    symbol: 'د.ج',
    locale: 'ar-DZ'
  },
  products: {
    source: 'products.json',
    cacheTTL: 300000
  },
  features: {
    warranty: 'ضمان سنتان',
    delivery: 'توصيل سريع',
    payment: 'الدفع عند الاستلام'
  },
  /* TODO: Future multi-store support
  store: {
    id: 'robuste-eulma',
    template: 'default',
    locale: 'ar-DZ',
    dir: 'rtl'
  },
  */
  /* TODO: Future SaaS - admin dashboard URL
  admin: {
    dashboard: '',
    api: ''
  },
  */
};
