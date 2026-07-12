/**
 * Test CSRF on all 3 critical write routes:
 *  1. POST /auth/logout
 *  2. POST /tickets/:id/attachments (file upload)
 *  3. POST /auth/forgot-password
 */
const http = require('http');

const BASE = 'http://localhost:8005';

function request(method, path, headers, body) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const opts = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: headers || {}
        };
        const req = http.request(opts, (res) => {
            let data = '';
            res.on('data', d => data += d);
            res.on('end', () => {
                const cookies = res.headers['set-cookie'] || [];
                resolve({ status: res.statusCode, body: data, cookies, headers: res.headers });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

function parseCookies(cookieHeaders) {
    const jar = {};
    cookieHeaders.forEach(c => {
        const [kv] = c.split(';');
        const [k, v] = kv.split('=');
        jar[k.trim()] = v;
    });
    return jar;
}

function cookieString(jar) {
    return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

function mergeCookies(jar, newCookies) {
    const parsed = parseCookies(newCookies);
    return { ...jar, ...parsed };
}

async function run() {
    console.log('=== CSRF Verification for 3 Critical Routes ===\n');

    // ─── Step 1: GET /login to get CSRF cookie ─────────────
    const loginPage = await request('GET', '/login', {});
    let jar = parseCookies(loginPage.cookies);
    const csrfToken = jar['_csrf'];
    console.log(`1. GET /login → CSRF cookie: ${csrfToken ? '✅ ' + csrfToken.substring(0, 12) + '...' : '❌ MISSING'}`);

    // ─── Step 2: POST /auth/login (with CSRF) to get session ──
    const loginRes = await request('POST', '/auth/login', {
        'Content-Type': 'application/json',
        'Cookie': cookieString(jar),
        'x-csrf-token': csrfToken
    }, JSON.stringify({ email: 'admin@techdesk.com', password: 'Admin123!' }));
    jar = mergeCookies(jar, loginRes.cookies);
    console.log(`2. POST /auth/login → ${loginRes.status} ${loginRes.status === 200 ? '✅' : '❌'} ${loginRes.body.substring(0, 80)}`);

    // ─── TEST A: POST /auth/forgot-password (with CSRF) ─────
    const forgotRes = await request('POST', '/auth/forgot-password', {
        'Content-Type': 'application/json',
        'Cookie': cookieString(jar),
        'x-csrf-token': csrfToken
    }, JSON.stringify({ email: 'admin@techdesk.com' }));
    console.log(`3. POST /auth/forgot-password → ${forgotRes.status} ${forgotRes.status === 200 ? '✅' : '❌'} ${forgotRes.body.substring(0, 100)}`);

    // ─── TEST B: POST /auth/forgot-password (WITHOUT CSRF) → should fail ──
    const forgotNoCsrf = await request('POST', '/auth/forgot-password', {
        'Content-Type': 'application/json',
        'Cookie': cookieString(jar)
    }, JSON.stringify({ email: 'admin@techdesk.com' }));
    console.log(`4. POST /auth/forgot-password SIN token → ${forgotNoCsrf.status} ${forgotNoCsrf.status === 403 ? '✅ Bloqueado' : '❌ NO BLOQUEADO'}`);

    // ─── TEST C: POST /tickets/:id/attachments (file upload with CSRF) ──
    // We need a ticket ID. Let's create one first.
    const createRes = await request('POST', '/tickets', {
        'Content-Type': 'application/json',
        'Cookie': cookieString(jar),
        'x-csrf-token': csrfToken
    }, JSON.stringify({ title: 'Test CSRF upload', description: 'Prueba de subida con CSRF', priority_id: 1 }));
    let ticketId;
    try { ticketId = JSON.parse(createRes.body).ticket.id; } catch (e) { ticketId = null; }
    console.log(`5. POST /tickets (crear ticket) → ${createRes.status} ${createRes.status === 201 || createRes.status === 200 ? '✅' : '❌'} ticketId=${ticketId}`);

    if (ticketId) {
        // Simulate a multipart file upload with CSRF header
        const boundary = '----TestBoundary123';
        const fileContent = 'Hello this is a test file';
        const multipartBody = [
            `--${boundary}`,
            `Content-Disposition: form-data; name="file"; filename="test.txt"`,
            `Content-Type: text/plain`,
            ``,
            fileContent,
            `--${boundary}--`
        ].join('\r\n');

        const uploadRes = await request('POST', `/tickets/${ticketId}/attachments`, {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Cookie': cookieString(jar),
            'x-csrf-token': csrfToken
        }, multipartBody);
        // 200 or 400 (bad file type) are both OK — we just need to confirm it's NOT 403
        const uploadOk = uploadRes.status !== 403;
        console.log(`6. POST /tickets/${ticketId}/attachments (upload) → ${uploadRes.status} ${uploadOk ? '✅ CSRF pasó' : '❌ CSRF bloqueó'} ${uploadRes.body.substring(0, 100)}`);

        // Same upload WITHOUT CSRF → must be 403
        const uploadNoCsrf = await request('POST', `/tickets/${ticketId}/attachments`, {
            'Content-Type': `multipart/form-data; boundary=${boundary}`,
            'Cookie': cookieString(jar)
        }, multipartBody);
        console.log(`7. POST /tickets/${ticketId}/attachments SIN token → ${uploadNoCsrf.status} ${uploadNoCsrf.status === 403 ? '✅ Bloqueado' : '❌ NO BLOQUEADO'}`);
    }

    // ─── TEST D: POST /auth/logout (with CSRF) ──────────────
    const logoutRes = await request('POST', '/auth/logout', {
        'Content-Type': 'application/json',
        'Cookie': cookieString(jar),
        'x-csrf-token': csrfToken
    });
    console.log(`8. POST /auth/logout → ${logoutRes.status} ${logoutRes.status === 200 ? '✅' : '❌'} ${logoutRes.body.substring(0, 80)}`);

    // ─── TEST E: POST /auth/logout WITHOUT CSRF → must be 403 ──
    const logoutNoCsrf = await request('POST', '/auth/logout', {
        'Content-Type': 'application/json',
        'Cookie': cookieString(jar)
    });
    console.log(`9. POST /auth/logout SIN token → ${logoutNoCsrf.status} ${logoutNoCsrf.status === 403 ? '✅ Bloqueado' : '❌ NO BLOQUEADO'}`);

    console.log('\n=== Verificación completa ===');
}

run().catch(console.error);
