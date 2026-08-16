(function attachBustlerContext(global) {
  const STORAGE_KEYS = {
    currentUserId: 'bustler_current_user_id',
    currentUserRole: 'bustler_current_user_role',
    assignedProviderId: 'bustler_assigned_provider_id',
    productId: 'bustler_product_id',
    activeToken: 'bustler_active_token',
  };

  function clean(value) {
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  }

  /**
   * Returns true when running on localhost or file:// (dev mode).
   * In production, URL-param identity is disabled for security.
   */
  function isLocalDev() {
    try {
      const host = global.location.hostname;
      return (
        global.location.protocol === 'file:' ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0'
      );
    } catch (_) {
      return false;
    }
  }

  function getParams() {
    return new URLSearchParams(global.location.search);
  }

  function getBootstrapContext() {
    return global.BUSTLER_CONTEXT && typeof global.BUSTLER_CONTEXT === 'object'
      ? global.BUSTLER_CONTEXT
      : {};
  }

  function getStoredValue(key) {
    try {
      return clean(global.localStorage.getItem(key));
    } catch (error) {
      return '';
    }
  }

  function setStoredValue(key, value) {
    try {
      if (clean(value)) {
        global.localStorage.setItem(key, value.trim());
      }
    } catch (error) {
      // Ignore storage issues so the app still works in restricted environments.
    }
  }

  function persistSession(session) {
    setStoredValue(STORAGE_KEYS.currentUserId, session.currentUserId);
    setStoredValue(STORAGE_KEYS.currentUserRole, session.currentUserRole);
    setStoredValue(STORAGE_KEYS.assignedProviderId, session.assignedProviderId);
    setStoredValue(STORAGE_KEYS.productId, session.productId);
  }

  function resolveSession(defaultRole) {
    const bootstrap = getBootstrapContext();
    const hasBootstrap = Object.keys(bootstrap).length > 0;

    // In production, ONLY use BUSTLER_CONTEXT (injected by the authenticated parent platform).
    // URL params are allowed ONLY in local dev and when BUSTLER_CONTEXT is absent.
    const allowUrlParams = !hasBootstrap && isLocalDev();

    const params = allowUrlParams ? getParams() : new URLSearchParams();

    if (allowUrlParams && (params.get('user_id') || params.get('userId'))) {
      console.warn(
        '[BustlerContext] ⚠️ Using URL-param identity — dev-only fallback. ' +
        'In production, inject window.BUSTLER_CONTEXT from an authenticated session.'
      );
    }

    const session = {
      currentUserId:
        clean(bootstrap.currentUserId) ||
        clean(params.get('user_id')) ||
        clean(params.get('userId')) ||
        getStoredValue(STORAGE_KEYS.currentUserId),
      currentUserRole:
        clean(bootstrap.currentUserRole) ||
        clean(params.get('role')) ||
        defaultRole,
      assignedProviderId:
        clean(bootstrap.assignedProviderId) ||
        clean(params.get('provider_id')) ||
        clean(params.get('providerId')) ||
        getStoredValue(STORAGE_KEYS.assignedProviderId),
      productId:
        clean(bootstrap.productId) ||
        clean(params.get('product_id')) ||
        clean(params.get('productId')) ||
        getStoredValue(STORAGE_KEYS.productId),
    };

    persistSession(session);
    return session;
  }

  global.BustlerContext = {
    keys: STORAGE_KEYS,
    persistSession,
    resolveSession,
  };
})(window);
