import axios from 'axios';
import logger from '../utils/logger';

// Hardcoded per product decision — the external generator lives at this AWS endpoint.
const PAYMENT_SS_ENDPOINT = 'https://fkvb9pd3j0.execute-api.us-east-1.amazonaws.com';

export interface PaymentScreenshotParams {
    amount: string;
    to_address: string;
    to_id?: string;
    order_id?: string;
    payment_method?: string;
}

// Calls the external generator and returns the PNG. `amount` and `to_address` are
// required by the API; the rest are optional passthroughs.
export async function generatePaymentScreenshot(
    p: PaymentScreenshotParams,
): Promise<{ buffer: Buffer; contentType: string }> {
    const queryStringParameters: Record<string, string> = {
        amount: p.amount,
        to_address: p.to_address,
    };
    if (p.to_id) queryStringParameters.to_id = p.to_id;
    if (p.order_id) queryStringParameters.order_id = p.order_id;
    if (p.payment_method) queryStringParameters.payment_method = p.payment_method;

    let response;
    try {
        // API Gateway (execute-api) populates the Lambda's event.queryStringParameters
        // ONLY from the real URL query string — a JSON body lands in event.body instead,
        // leaving queryStringParameters null and the Lambda returning 400. So pass these
        // as actual query params, not in the body. responseType:arraybuffer stops axios
        // from JSON-parsing (and corrupting) whatever binary/text the gateway returns.
        response = await axios.post(PAYMENT_SS_ENDPOINT, null, {
            params: queryStringParameters,
            responseType: 'arraybuffer',
        });
    } catch (err: any) {
        // Surface WHY the API rejected us — the response body carries the real reason.
        const status = err?.response?.status;
        const body = err?.response?.data;
        const bodyStr = Buffer.isBuffer(body) ? body.toString('utf8') : (typeof body === 'string' ? body : JSON.stringify(body));
        logger.error(
            `[paymentScreenshot] API error status=${status} ` +
            `params=${JSON.stringify(queryStringParameters)} body=${bodyStr}`,
        );
        throw err;
    }

    const buffer = decodeImageResponse(Buffer.from(response.data));
    return { buffer, contentType: 'image/png' };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

function looksLikeImage(b: Buffer): boolean {
    return b.length > 4 && (b.subarray(0, 4).equals(PNG_MAGIC) || b.subarray(0, 3).equals(JPG_MAGIC));
}

// The gateway can hand back the image three ways depending on its integration:
// (a) raw image bytes, (b) a Lambda-proxy JSON wrapper {statusCode,headers,body:"<base64>"},
// or (c) a bare base64 string. Detect and normalize to real image bytes, and fail loudly
// if it's none of those — so we never hand Telegram garbage (which caused IMAGE_PROCESS_FAILED).
export function decodeImageResponse(raw: Buffer): Buffer {
    if (looksLikeImage(raw)) return raw;

    const text = raw.toString('utf8').trim();

    if (text.startsWith('{')) {
        try {
            const obj = JSON.parse(text);
            if (typeof obj.body === 'string') {
                const decoded = Buffer.from(obj.body, 'base64');
                if (looksLikeImage(decoded)) return decoded;
            }
        } catch { /* not JSON — fall through to base64 */ }
    }

    const decoded = Buffer.from(text, 'base64');
    if (looksLikeImage(decoded)) return decoded;

    throw new Error('payment screenshot response was not a recognizable image');
}

// The decoy reply model emits this as the first line when the target demands proof
// of payment, e.g.  SEND_PAYMENT_SS: {"amount":"5000","to_address":"0x3a1A02...5699774"}
const DIRECTIVE_PREFIX = /^SEND_PAYMENT_SS:/i;

// Pull the control directive off the reply parts. ALWAYS strips any directive line
// (even a malformed one) so it can never leak to the target, and returns validated
// params only when a well-formed directive carried both required fields.
export function extractPaymentDirective(parts: string[]): {
    params: PaymentScreenshotParams | null;
    cleanedParts: string[];
} {
    let params: PaymentScreenshotParams | null = null;
    const cleanedParts: string[] = [];

    for (const part of parts) {
        const kept: string[] = [];
        for (const line of part.split('\n')) {
            if (DIRECTIVE_PREFIX.test(line.trim())) {
                // Drop the line no matter what. Only try to parse the first one.
                if (!params) {
                    const json = line.match(/\{[\s\S]*\}/);
                    if (json) params = parseParams(json[0]);
                }
                continue;
            }
            kept.push(line);
        }
        const rejoined = kept.join('\n').trim();
        if (rejoined) cleanedParts.push(rejoined);
    }

    return { params, cleanedParts };
}

// Anti-hallucination backstop: the model must not invent a destination the scammer
// never gave. The to_address has to appear verbatim (case-insensitive) somewhere in the
// conversation text. Wallets/UPI/account numbers are copy-pasted, so they match exactly;
// amount is deliberately NOT checked (scammers write "5k", "5,000", "5000") — the address
// is the hard anchor. If it isn't grounded, the caller should skip sending.
export function isPaymentGrounded(params: PaymentScreenshotParams, conversationText: string): boolean {
    const addr = params.to_address.toLowerCase().trim();
    if (addr.length < 4) return false; // too short to be a real destination
    return conversationText.toLowerCase().includes(addr);
}

// The model likes to fill fields it doesn't have with placeholder junk ("nil", "null",
// "N/A", "-", …). Treat those as absent so they never render on the screenshot.
const PLACEHOLDERS = new Set(['', 'nil', 'null', 'none', 'n/a', 'na', 'undefined', '-', '—']);
function cleanField(v: any): string | undefined {
    if (v == null) return undefined;
    const s = String(v).trim();
    return PLACEHOLDERS.has(s.toLowerCase()) ? undefined : (s || undefined);
}

function parseParams(json: string): PaymentScreenshotParams | null {
    try {
        const o = JSON.parse(json);
        const amount = cleanField(o.amount);
        const to_address = cleanField(o.to_address);
        if (!amount || !to_address) return null; // required fields missing/placeholder -> not sendable
        return {
            amount,
            to_address,
            to_id: cleanField(o.to_id),
            order_id: cleanField(o.order_id),
            payment_method: cleanField(o.payment_method),
        };
    } catch {
        return null;
    }
}
