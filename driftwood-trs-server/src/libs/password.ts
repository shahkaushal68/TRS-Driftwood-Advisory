import { registerDecorator, type ValidationOptions } from 'class-validator';

export function checkPasswordStrength(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 8) errors.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) errors.push('an uppercase letter');
  if (!/[a-z]/.test(password)) errors.push('a lowercase letter');
  if (!/[0-9]/.test(password)) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('a special character');
  return errors;
}

export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isStrongPassword',
      target: object.constructor,
      propertyName,
      options: {
        ...validationOptions,
      },
      constraints: [],
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          return checkPasswordStrength(value).length === 0;
        },
        defaultMessage() {
          return 'Password must be at least 8 characters and include uppercase, lowercase, number, and special character';
        },
      },
    });
  };
}
