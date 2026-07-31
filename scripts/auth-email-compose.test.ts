import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('auth email Compose configuration', () => {
  it('injects the Resend settings and does not retain Brevo settings', async () => {
    const compose = await readFile(resolve(import.meta.dirname, '..', 'docker-compose.staging.yml'), 'utf8');

    expect(compose).toContain('RESEND_API_KEY: ${RESEND_API_KEY}');
    expect(compose).toContain('RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-art@art.aittco.com}');
    expect(compose).toContain('RESEND_FROM_NAME: ${RESEND_FROM_NAME:-Art-Aittco}');
    expect(compose).not.toContain('BREVO_');
  });
});
