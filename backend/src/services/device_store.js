/**
 * Store em memória para dispositivos que enviam dados via MQTT.
 * Um dispositivo "está enviando dados" se recebeu mensagem nos últimos ONLINE_THRESHOLD_MS.
 */
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutos

const devices = new Map(); // device_id_str -> { device_id_str, name, lastPayload, lastSeen }

function upsertDevice(deviceIdStr, payload) {
    const { broker_key, name: payloadName, ...data } = payload;
    const existing = devices.get(deviceIdStr);
    const name = payloadName || existing?.name || deviceIdStr;
    devices.set(deviceIdStr, {
        device_id_str: deviceIdStr,
        name,
        lastPayload: data,
        lastSeen: new Date()
    });
}

function getOnlineDevices() {
    const now = Date.now();
    return Array.from(devices.values()).filter(
        d => (now - new Date(d.lastSeen).getTime()) < ONLINE_THRESHOLD_MS
    );
}

function getDeviceById(deviceIdStr) {
    return devices.get(deviceIdStr) || null;
}

/** Retorna todos os dispositivos já vistos, ordenados por último envio (mais recente primeiro). */
function getAllDevices() {
    return Array.from(devices.values()).sort(
        (a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
}

/** True se o dispositivo enviou dados nos últimos 5 minutos. */
function isDeviceOnline(device) {
    const last = new Date(device.lastSeen).getTime();
    return (Date.now() - last) < ONLINE_THRESHOLD_MS;
}

module.exports = {
    upsertDevice,
    getOnlineDevices,
    getDeviceById,
    getAllDevices,
    isDeviceOnline,
    ONLINE_THRESHOLD_MS
};
