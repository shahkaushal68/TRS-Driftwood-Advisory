interface PasswordRequirement {
  label: string
  test: (value: string) => boolean
}

interface PasswordStrengthResult {
  isStrong: boolean
  missingLabels: string[]
  score: number
}

const passwordRequirements: readonly PasswordRequirement[] = [
  {
    label: 'At least 8 characters',
    test: (value) => value.length >= 8,
  },
  {
    label: 'One uppercase letter',
    test: (value) => /[A-Z]/.test(value),
  },
  {
    label: 'One lowercase letter',
    test: (value) => /[a-z]/.test(value),
  },
  {
    label: 'One number',
    test: (value) => /\d/.test(value),
  },
  {
    label: 'One special character',
    test: (value) => /[^A-Za-z0-9]/.test(value),
  },
]

const getPasswordStrength = (value: string): PasswordStrengthResult => {
  const missingLabels = passwordRequirements
    .filter((requirement) => !requirement.test(value))
    .map((requirement) => requirement.label)

  return {
    isStrong: missingLabels.length === 0,
    missingLabels,
    score: passwordRequirements.length - missingLabels.length,
  }
}

const getPasswordStrengthError = (value: string) => {
  const strength = getPasswordStrength(value)

  if (strength.isStrong) {
    return true
  }

  return `Password must include: ${strength.missingLabels.join(', ')}`
}

export {
  getPasswordStrength,
  getPasswordStrengthError,
  passwordRequirements,
  type PasswordStrengthResult,
}
