import { Resend } from 'resend';
import { config } from './config';
import { logger } from './logger';

const resend = new Resend(config.RESEND_API_KEY);

export function sendPasswordResetEmail(to: string, resetUrl: string, userName: string): void {
  void resend.emails
    .send({
      from: config.RESEND_FROM,
      to: config.NODE_ENV === 'development' ? config.RESEND_LOCAL_TO : to,
      subject: 'Reset your password',
      template: {
        id: config.RESEND_PASSWORD_RESET_TEMPLATE_ID,
        variables: { reset_url: resetUrl, user_name: userName },
      },
    })
    .then((response) => {
      logger.info({ to, id: response.data?.id }, 'Sent password reset email');
    })
    .catch((err: unknown) => {
      logger.error({ err }, 'Failed to send password reset email');
    });
}

export function sendAccountSetupEmail(
  to: string,
  userName: string,
  role: string,
  setupUrl: string,
): void {
  void resend.emails
    .send({
      from: config.RESEND_FROM,
      to: config.NODE_ENV === 'development' ? config.RESEND_LOCAL_TO : to,
      subject: 'Welcome to Driftwood TRS — set up your account',
      template: {
        id: config.RESEND_WELCOME_TEMPLATE_ID,
        variables: { user_name: userName, role, setup_url: setupUrl },
      },
    })
    .then((response) => {
      logger.info({ to, id: response.data?.id }, 'Sent account setup email');
    })
    .catch((err: unknown) => {
      logger.error({ err }, 'Failed to send account setup email');
    });
}
