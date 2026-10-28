// This route must run on-demand (not be statically prerendered) so it can
// verify the Turnstile token and forward the message server-side on every request.
export const prerender = false;

import type { APIContext } from 'astro';

const RECIPIENT_EMAIL = 'shelleyliucounsellingpractice@gmail.com';
const SITE_URL = 'https://www.shelleyliutherapy.co.uk/';
const TURNSTILE_VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const FORMSUBMIT_AJAX_URL = `https://formsubmit.co/ajax/${RECIPIENT_EMAIL}`;

function jsonResponse(body: Record<string, unknown>, status: number) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

export async function POST({ request, clientAddress }: APIContext) {
	let data: Record<string, unknown>;
	try {
		data = await request.json();
	} catch {
		return jsonResponse({ success: false, message: 'Invalid request body.' }, 400);
	}

	// Honeypot: pretend success so bots don't learn to adapt.
	if (typeof data._honey === 'string' && data._honey.trim() !== '') {
		return jsonResponse({ success: true }, 200);
	}

	const name = typeof data.name === 'string' ? data.name.trim() : '';
	const email = typeof data.email === 'string' ? data.email.trim() : '';
	const message = typeof data.message === 'string' ? data.message.trim() : '';
	const consent = data.consent;
	const turnstileToken = typeof data['cf-turnstile-response'] === 'string' ? data['cf-turnstile-response'] : '';

	if (!name || !email || !message || !consent) {
		return jsonResponse({ success: false, message: 'Please complete all required fields.' }, 400);
	}

	if (!turnstileToken) {
		return jsonResponse({ success: false, message: 'Please complete the verification challenge.' }, 400);
	}

	const secretKey = import.meta.env.TURNSTILE_SECRET_KEY;
	if (!secretKey) {
		console.error('TURNSTILE_SECRET_KEY is not configured.');
		return jsonResponse({ success: false, message: 'Server misconfiguration.' }, 500);
	}

	let remoteIp: string | undefined;
	try {
		remoteIp = clientAddress;
	} catch {
		remoteIp = undefined;
	}

	try {
		const verifyResponse = await fetch(TURNSTILE_VERIFY_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				secret: secretKey,
				response: turnstileToken,
				...(remoteIp ? { remoteip: remoteIp } : {}),
			}),
			signal: AbortSignal.timeout(8000),
		});
		const verifyResult = await verifyResponse.json();
		if (!verifyResult.success) {
			return jsonResponse({ success: false, message: 'Verification failed. Please try again.' }, 400);
		}
	} catch (error) {
		console.error('Turnstile verification error:', error);
		return jsonResponse({ success: false, message: 'Verification service unavailable. Please try again shortly.' }, 502);
	}

	try {
		// FormSubmit can take a long time to respond under load, so we allow a
		// generous timeout here (Vercel Fluid compute allows up to 300s on Hobby).
		const deliveryResponse = await fetch(FORMSUBMIT_AJAX_URL, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				// FormSubmit requires a Referer header to identify the originating
				// page; server-to-server requests don't send one automatically.
				Referer: SITE_URL,
			},
			body: JSON.stringify({
				name,
				email,
				message,
				consent,
				_subject: 'New Website Counselling Enquiry',
				_template: 'table',
				_captcha: 'false',
				_url: SITE_URL,
			}),
			signal: AbortSignal.timeout(60000),
		});
		const deliveryResult = await deliveryResponse.json();
		if (!deliveryResponse.ok || !(deliveryResult.success === 'true' || deliveryResult.success === true)) {
			throw new Error(deliveryResult.message || 'Delivery failed');
		}
	} catch (error) {
		console.error('FormSubmit delivery error:', error);
		return jsonResponse(
			{ success: false, message: 'Your message could not be delivered. Please try again or email directly.' },
			502
		);
	}

	return jsonResponse({ success: true }, 200);
}
