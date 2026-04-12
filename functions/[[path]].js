import { connect } from 'cloudflare:sockets';

export async function onRequest(context) {
    const { request, env } = context;
    const upgradeHeader = request.headers.get('Upgrade');

    // إذا لم يكن طلب WebSocket، اعرض صفحة التمويه فوراً
    if (upgradeHeader !== 'websocket') {
        return env.ASSETS.fetch(request);
    }

    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    let remoteSocket = null;
    const userID = (env.UUID || "").replace(/-/g, '').toLowerCase();

    server.addEventListener('message', async ({ data }) => {
        if (remoteSocket) {
            const writer = remoteSocket.writable.getWriter();
            await writer.write(data);
            writer.releaseLock();
            return;
        }

        // الحزمة الأولى: معالجة VLESS
        const buffer = new Uint8Array(data);
        
        // التحقق من UUID (16 bytes starting from index 1)
        const receivedUUID = Array.from(buffer.slice(1, 17))
            .map(b => b.toString(16).padStart(2, '0')).join('');

        if (receivedUUID !== userID) {
            server.close();
            return;
        }

        // تحديد العنوان والمنفذ
        let addressIndex = 18;
        const addressType = buffer[17];
        let targetAddress = "";

        if (addressType === 1) { // IPv4
            targetAddress = buffer.slice(18, 22).join('.');
            addressIndex = 22;
        } else if (addressType === 3) { // Domain
            const len = buffer[18];
            targetAddress = new TextDecoder().decode(buffer.slice(19, 19 + len));
            addressIndex = 19 + len;
        }

        const targetPort = (buffer[addressIndex] << 8) | buffer[addressIndex + 1];
        const vlessResponse = new Uint8Array([buffer[0], 0]); // Response Header
        const actualData = buffer.slice(addressIndex + 4);

        try {
            // إنشاء الاتصال بالوجهة (مثلاً سيرفرات تليجرام)
            remoteSocket = connect({ hostname: targetAddress, port: targetPort });
            
            // إرسال استجابة الموافقة للعميل (تليجرام/V2Box)
            server.send(vlessResponse.buffer);

            // نفق البيانات من السيرفر إلى العميل
            remoteSocket.readable.pipeTo(new WritableStream({
                write(chunk) {
                    server.send(chunk);
                },
                close() {
                    server.close();
                }
            }));

            // إرسال البيانات المتبقية من الحزمة الأولى
            const writer = remoteSocket.writable.getWriter();
            await writer.write(actualData);
            writer.releaseLock();

        } catch (e) {
            server.close();
        }
    });

    return new Response(null, { status: 101, webSocket: client });
}
