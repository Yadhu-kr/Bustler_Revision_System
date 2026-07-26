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
    const params = getParams();
    const bootstrap = getBootstrapContext();

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
