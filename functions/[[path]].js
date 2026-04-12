export async function onRequest(context) {
    const { request, env } = context;
    const upgradeHeader = request.headers.get('Upgrade');

    if (upgradeHeader === 'websocket') {
        return await vlessOverWSHandler(request, env);
    }

    return env.ASSETS.fetch(request);
}

async function vlessOverWSHandler(request, env) {
    const userID = env.UUID.replace(/-/g, '');
    const webSocketPair = new WebSocketPair();
    const [client, server] = Object.values(webSocketPair);

    server.accept();

    let remoteSocket = null;

    server.addEventListener('message', async (event) => {
        const message = event.data;
        
        if (remoteSocket) {
            const writer = remoteSocket.writable.getWriter();
            await writer.write(message);
            writer.releaseLock();
            return;
        }

        const vlessBuffer = new Uint8Array(message);
        const receivedUUID = Array.from(vlessBuffer.slice(1, 17))
            .map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (receivedUUID !== userID) {
            server.close();
            return;
        }

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
        const dataStart = addressValueIndex + 4; // تخطي البروتوكول للوصول للبيانات الفعلية

        try {
            const { connect } = await import('cloudflare:sockets');
            remoteSocket = connect({ hostname: targetAddress, port: targetPort });

            // CRITICAL: إرسال استجابة نجاح المصافحة (VLESS Response)
            // البايت الأول هو الإصدار (0) والبايت الثاني هو طول الإضافات (0)
            server.send(new Uint8Array([0, 0]));

            // قراءة البيانات من السيرفر المستهدف وإرسالها للعميل
            const reader = remoteSocket.readable.getReader();
            (async () => {
                try {
                    while (true) {
                        const { value, done } = await reader.read();
                        if (done) break;
                        server.send(value);
                    }
                } catch (e) {
                    server.close();
                }
            })();

            // إرسال البيانات المتبقية في الحزمة الأولى
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
