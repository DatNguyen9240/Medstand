var NotificationPushService = (() => {
  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  function decodePublicKey(value) {
    const padding = '='.repeat((4 - value.length % 4) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from(raw, char => char.charCodeAt(0));
  }

  async function endpointHash(endpoint) {
    const bytes = new TextEncoder().encode(endpoint);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function registration() {
    if (!supported()) throw new Error('Trình duyệt không hỗ trợ Web Push.');
    return navigator.serviceWorker.ready;
  }

  async function currentSubscription() {
    if (!supported()) return null;
    return (await registration()).pushManager.getSubscription();
  }

  async function subscribe() {
    const publicKey = String(API_CONFIG.WEB_PUSH_VAPID_PUBLIC_KEY || '').trim();
    if (!publicKey) throw new Error('Máy chủ chưa cấu hình VAPID public key.');
    if (Notification.permission === 'denied') throw new Error('Quyền thông báo đã bị chặn trong trình duyệt.');
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Bạn chưa cấp quyền nhận thông báo.');

    const reg = await registration();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodePublicKey(publicKey)
      });
    }

    const key = 'req-push-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
    await Http.post(API_CONFIG.ENDPOINTS.NOTIFICATION.PUSH, {
      Action: 'SUBSCRIBE',
      EndpointHash: await endpointHash(subscription.endpoint),
      Subscription: subscription.toJSON(),
      DeviceLabel: navigator.userAgent.slice(0, 150)
    }, { idempotencyKey: key });
    return subscription;
  }

  async function unsubscribe() {
    const subscription = await currentSubscription();
    if (!subscription) return false;
    const key = 'req-push-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now());
    try {
      await Http.post(API_CONFIG.ENDPOINTS.NOTIFICATION.PUSH, {
        Action: 'UNSUBSCRIBE',
        EndpointHash: await endpointHash(subscription.endpoint)
      }, { idempotencyKey: key });
    } finally {
      await subscription.unsubscribe();
    }
    return true;
  }

  return { supported, currentSubscription, subscribe, unsubscribe };
})();
