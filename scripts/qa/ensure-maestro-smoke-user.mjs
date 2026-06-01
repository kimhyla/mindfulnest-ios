#!/usr/bin/env node
/**
 * Ensures a dedicated Firebase Auth user exists for Maestro LD-278 persistence smoke.
 * Uses the public Identity Toolkit REST API + API key from GoogleService-Info.plist.
 * Does not print credentials; exits 0 when sign-in succeeds.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PLIST_PATH = resolve(process.cwd(), 'GoogleService-Info.plist');
const DEFAULT_EMAIL = 'maestro.ld278.smoke@test.mindfulnestkids.local';
const DEFAULT_PASSWORD = 'Maestro-LD278-Smoke-Only-2026!';

function readApiKey() {
  const plist = readFileSync(PLIST_PATH, 'utf8');
  const match = plist.match(/<key>API_KEY<\/key>\s*<string>([^<]+)<\/string>/);
  if (!match) throw new Error(`API_KEY not found in ${PLIST_PATH}`);
  return match[1];
}

async function identityRequest(path, body) {
  const apiKey = readApiKey();
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/${path}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  return { ok: res.ok, json };
}

async function main() {
  const email = process.env.MAESTRO_SMOKE_EMAIL ?? DEFAULT_EMAIL;
  const password = process.env.MAESTRO_SMOKE_PASSWORD ?? DEFAULT_PASSWORD;

  const signIn = await identityRequest('accounts:signInWithPassword', {
    email,
    password,
    returnSecureToken: true,
  });
  if (signIn.ok) {
    console.log(`Maestro smoke user ready: ${email}`);
    return;
  }

  const signInError = signIn.json?.error?.message ?? 'unknown';
  if (signInError !== 'EMAIL_NOT_FOUND' && signInError !== 'INVALID_LOGIN_CREDENTIALS') {
    throw new Error(`signInWithPassword failed: ${signInError}`);
  }

  const signUp = await identityRequest('accounts:signUp', {
    email,
    password,
    returnSecureToken: true,
  });
  if (!signUp.ok) {
    const signUpError = signUp.json?.error?.message ?? 'unknown';
    throw new Error(`accounts:signUp failed: ${signUpError}`);
  }

  console.log(`Created Maestro smoke user: ${email}`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
