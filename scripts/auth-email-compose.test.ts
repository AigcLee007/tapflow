import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function section(compose: string, heading: string, nextHeading: string): string {
  const start = compose.indexOf(heading);
  const end = compose.indexOf(nextHeading, start);

  return compose.slice(start, end === -1 ? undefined : end);
}

describe('auth email Compose configuration', () => {
  it('injects the Resend settings and does not retain Brevo settings', async () => {
    const compose = await readFile(resolve(import.meta.dirname, '..', 'docker-compose.staging.yml'), 'utf8');
    const sharedEnvironment = section(compose, 'x-tapflow-env: &tapflow-env', '\nservices:');
    const apiService = section(compose, '  tapflow-api:', '\n  tapflow-worker:');
    const workerService = section(compose, '  tapflow-worker:', '\n  tapflow-migrator:');

    expect(sharedEnvironment).toContain('RESEND_API_KEY: ${RESEND_API_KEY}');
    expect(sharedEnvironment).toContain('RESEND_FROM_EMAIL: ${RESEND_FROM_EMAIL:-art@art.aittco.com}');
    expect(sharedEnvironment).toContain('RESEND_FROM_NAME: ${RESEND_FROM_NAME:-Art-Aittco}');
    expect(apiService).toContain('environment:\n      <<: *tapflow-env');
    expect(workerService).toContain('environment:\n      <<: *tapflow-env');
    expect(compose).not.toContain('BREVO_');
  });
});
