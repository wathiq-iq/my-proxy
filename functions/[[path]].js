// استيراد مباشر في أعلى الملف لضمان توافق البيئة
import { connect } from 'cloudflare:sockets';

export async function onRequest(context) {
    const { request, env } = context;
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket') {
        return await vlessOverWSHandler(request, env);
    }

    // إذا لم يكن الطلب WebSocket، اعرض صفحة التمويه
    return env.ASSETS.fetch(request);
}

async function vlessOverWSHandler(request, env) {
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    let remoteSocket = null;
    const userID = env.UUID.replace(/-/g, '').toLowerCase();

    server.addEventListener('message', async (event) => {
        const message = event.data; // البيانات تصل كـ ArrayBuffer
        
        if (remoteSocket) {
            const writer = remoteSocket.writable.getWriter();
            await writer.write(message);
            writer.releaseLock();
            return;
        }

        // معالجة الحزمة الأولى
        const vlessBuffer = new Uint8Array(message);
        
        // التحقق من UUID (البايتات من 1 إلى 17)
        const receivedUUID = Array.from(vlessBuffer.slice(1, 17))
            .map(b => b.toString(16).padStart(2, '0')).join('').toLowerCase();
        
        if (receivedUUID !== userID) {
            server.close();
            return;
        }

        // استخراج العنوان والمنفذ
        const addressType = vlessBuffer[17];
        let addressValueIndex = 18;
        let targetAddress = "";

        if (addressType === 1) { // IPv4
            targetAddress = vlessBuffer.slice(18, 22).join('.');
            addressValueIndex = 22;
        } else if (addressType === 3) { // Domain
            const addressLength = vlessBuffer[18];
            targetAddress = new TextDecoder().decode(vlessBuffer.slice(19, 19 + addressLength));
            addressValueIndex = 19 + addressLength;
        }

        const targetPort = (vlessBuffer[addressValueIndex] << 8) | vlessBuffer[addressValueIndex + 1];
        const dataStart = addressValueIndex + 4;

        try {
            // فتح الاتصال الفعلي
            remoteSocket = connect({ hostname: targetAddress, port: targetPort });

            // إرسال استجابة VLESS القياسية [النسخة، طول الإضافات]
            server.send(new Uint8Array([0, 0]).buffer);

            // ربط القراءة (من السيرفر إلى المستخدم)
            const reader = remoteSocket.readable.getReader();
            (async () => {
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        server.send(value.buffer || value);
                    }
                } catch (e) {
                    server.close();
                }
            })();

            // إرسال بقية البيانات في الحزمة الأولى
            if (vlessBuffer.length > dataStart) {
                const writer = remoteSocket.writable.getWriter();
                await writer.write(vlessBuffer.slice(dataStart));
                writer.releaseLock();
            }

        } catch (e) {
            server.close();
        }
    });

    return new Response(null, { status: 101, webSocket: client });
}
