// Gera/recupera um identificador único e estável do dispositivo.
// Fica salvo localmente — só esse aparelho terá esse ID.
const KEY = "streamflix_device_id";

export const getDeviceId = (): string => {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
    localStorage.setItem(KEY, id);
  }
  return id;
};

export const getDeviceLabel = (): string => {
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "Dispositivo";
};
