// تم استخدام منطق معالجة البروتوكول المستقر من مشروع edgetunnel
export async function onRequest(context) {
    const { request, env } = context;
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket') {
        return await vlessOverWSHandler(request, env);
    }

    // تمويه: عرض صفحة الويب العادية
    return env.ASSETS.fetch(request);
}

async function vlessOverWSHandler(request, env) {
    const userID = env.UUID; // سيتم جلبه من إعدادات Cloudflare Pages
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    let remoteSocket = null;

    server.addEventListener('message', async (event) => {
        const message = event.data;
        
        // إذا كان الاتصال مفتوحاً بالفعل، مرر البيانات مباشرة
        if (remoteSocket) {
            const writer = remoteSocket.writable.getWriter();
            await writer.write(message);
            writer.releaseLock();
            return;
        }

        // معالجة حزمة VLESS الأولى (التحقق من UUID واستخراج العنوان المستهدف)
        const vlessBuffer = new Uint8Array(message);
        const receivedUUID = Array.from(vlessBuffer.slice(1, 17))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        
        // التحقق من الهوية (إزالة الداشات من UUID المخزن للمقارنة)
        if (receivedUUID !== userID.replace(/-/g, '')) {
            server.close();
            return;
        }

        // استخراج العنوان والمنفذ المستهدف (Target Host & Port)
        const addressType = vlessBuffer[17];
        let addressLength = 0;
        let addressValueIndex = 18;
        let targetAddress = "";

        if (addressType === 1) { // IPv4
            targetAddress = vlessBuffer.slice(18, 22).join('.');
            addressValueIndex = 22;
        } else if (addressType === 3) { // Domain name
            addressLength = vlessBuffer[18];
            targetAddress = new TextDecoder().decode(vlessBuffer.slice(19, 19 + addressLength));
            addressValueIndex = 19 + addressLength;
        }

        const targetPort = (vlessBuffer[addressValueIndex] << 8) | vlessBuffer[addressValueIndex + 1];

        // فتح اتصال TCP باستخدام Cloudflare Connect API
        try {
            const { connect } = await import('cloudflare:sockets');
            remoteSocket = connect({ hostname: targetAddress, port: targetPort });
            
            // ربط البيانات الصادرة من السيرفر المستهدف بالـ WebSocket
            const reader = remoteSocket.readable.getReader();
            (async () => {
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    server.send(value);
                }
            })();

            // إرسال البيانات المتبقية في الحزمة الأولى إلى السيرفر المستهدف
            const writer = remoteSocket.writable.getWriter();
            await writer.write(vlessBuffer.slice(addressValueIndex + 4)); // تخطي رأس VLESS
            writer.releaseLock();

        } catch (e) {
            server.close();
        }
    });

    return new Response(null, { status: 101, webSocket: client });
}
